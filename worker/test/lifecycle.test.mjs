// ============================================================================
//  Order lifecycle tests — run with:  node --test worker/test/
//
//  These run the real Worker module in-process. No network, no email sent:
//  global fetch is stubbed so the Resend calls are captured and inspected,
//  and KV is a Map. That lets us assert on the actual email HTML the customer
//  and the owner would receive, including the signed decision links.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import worker from '../src/index.js';

// ---------------------------------------------------------------- fake world
function makeKV() {
  const store = new Map();
  return {
    store,
    async get(k) {
      return store.has(k) ? store.get(k) : null;
    },
    async put(k, v) {
      store.set(k, v);
    },
    async delete(k) {
      store.delete(k);
    },
  };
}

function makeEnv(overrides = {}) {
  return {
    RESEND_API_KEY: 'test-key',
    SIGNING_SECRET: 'test-signing-secret',
    OWNER_EMAIL: 'mercymillsourdough@gmail.com',
    FROM_EMAIL: 'orders@mercymillsourdough.com',
    FROM_NAME: 'Mercy Mill Sourdough',
    SITE_URL: 'https://mercymillsourdough.com',
    ORDERS: makeKV(),
    ...overrides,
  };
}

// Captures outgoing mail instead of sending it.
function captureMail() {
  const sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.resend.com')) {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: 'msg_test' }), { status: 200 });
    }
    return real(url, init);
  };
  return {
    sent,
    restore() {
      globalThis.fetch = real;
    },
  };
}

const ORIGIN = 'https://orders.example.workers.dev';

const sampleOrder = (over = {}) => ({
  items: [
    { id: 'artisan-loaf', name: 'Artisan Regular Loaf', unit: 'loaf', price: 11, qty: 2, options: { Shape: 'Boule (round)' } },
    { id: 'bagels', name: 'Bagels', unit: '12 bagels', size: '12 bagels', price: 28, qty: 1, options: { Flavour: 'Plain' } },
  ],
  total: 50,
  lang: 'en',
  pickupDate: '2026-10-14',
  notes: 'Fraser Heights Recreation Centre, please. No nuts.',
  botcheck: false,
  customer: { name: 'Test Customer', email: 'customer@example.com', phone: '604-555-0142' },
  ...over,
});

const post = (path, body) =>
  new Request(ORIGIN + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const postForm = (path, fields) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request(ORIGIN + path, { method: 'POST', body: fd });
};

// ---------------------------------------------------------------- the tests
test('health check responds', async () => {
  const res = await worker.fetch(new Request(ORIGIN + '/'), makeEnv());
  assert.equal(res.status, 200);
  assert.match(await res.text(), /running/i);
});

test('a valid order is accepted and emails both parties', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const res = await worker.fetch(post('/api/order', sampleOrder()), env);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.match(body.id, /^MM-[A-Z0-9]{7}$/, 'order id looks like MM-XXXXXXX');

    assert.equal(mail.sent.length, 2, 'customer and owner are both emailed');
    const [toCustomer, toOwner] = mail.sent;
    assert.deepEqual(toCustomer.to, ['customer@example.com']);
    assert.deepEqual(toOwner.to, ['mercymillsourdough@gmail.com']);
    assert.match(toCustomer.from, /Mercy Mill Sourdough <orders@mercymillsourdough\.com>/);

    // The order is stored pending, for idempotency later.
    const stored = JSON.parse(await env.ORDERS.get(`order:${body.id}`));
    assert.equal(stored.status, 'pending');
    assert.equal(stored.total, 50, 'total recomputed server-side from price x qty');
    assert.equal(stored.notes, 'Fraser Heights Recreation Centre, please. No nuts.');
    assert.equal(stored.pickupDate, '2026-10-14');
  } finally {
    mail.restore();
  }
});

test('the total is recomputed server-side, not trusted from the client', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const res = await worker.fetch(post('/api/order', sampleOrder({ total: 1 })), env);
    const { id } = await res.json();
    const stored = JSON.parse(await env.ORDERS.get(`order:${id}`));
    assert.equal(stored.total, 50, 'a tampered client total is ignored');
  } finally {
    mail.restore();
  }
});

test('invalid orders are rejected with a reason', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const cases = [
      [sampleOrder({ items: [] }), 'No items selected'],
      [sampleOrder({ items: [{ id: 'x', name: 'X', price: 5, qty: 0 }] }), 'No items selected'],
      [sampleOrder({ customer: { name: '', email: 'a@b.co' } }), 'Name is required'],
      [sampleOrder({ customer: { name: 'A', email: 'not-an-email' } }), 'Valid email is required'],
    ];
    for (const [body, expected] of cases) {
      const res = await worker.fetch(post('/api/order', body), env);
      const j = await res.json();
      assert.equal(res.status, 400, expected);
      assert.equal(j.error, expected);
    }
    assert.equal(mail.sent.length, 0, 'nothing is emailed for a rejected order');
  } finally {
    mail.restore();
  }
});

test('the honeypot silently swallows bot submissions', async () => {
  const mail = captureMail();
  try {
    const res = await worker.fetch(post('/api/order', sampleOrder({ botcheck: true })), makeEnv());
    assert.equal(res.status, 200, 'bots get a normal-looking success');
    assert.equal(mail.sent.length, 0, 'but no email is sent');
  } finally {
    mail.restore();
  }
});

test('malformed JSON is rejected', async () => {
  const req = new Request(ORIGIN + '/api/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ not json',
  });
  const res = await worker.fetch(req, makeEnv());
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'Invalid JSON');
});

// -------------------------------------------------------- the decision flow
async function placeOrder(env, mail, over = {}) {
  const res = await worker.fetch(post('/api/order', sampleOrder(over)), env);
  const { id } = await res.json();
  const ownerHtml = mail.sent[1].html;
  const links = [...ownerHtml.matchAll(/https?:\/\/[^"'\s]*\/api\/decide\?token=([^"'\s&]+)/g)].map(
    (m) => m[1]
  );
  mail.sent.length = 0; // only look at what the decision sends
  return { id, ownerHtml, acceptToken: links[0], declineToken: links[1] };
}

// Presses "Email me a security code" and reads the code out of the email
// that arrives in the owner's inbox.
async function requestCode(env, mail, token) {
  const res = await worker.fetch(postForm('/api/decide/code', { token }), env);
  const email = mail.sent.at(-1);
  const code = email && /^(\d{6}) is your/.exec(email.subject)?.[1];
  mail.sent.length = 0;
  return { res, code, email };
}

// The whole owner path: request a code, then confirm with it.
async function decide(env, mail, token, message = '') {
  const { code } = await requestCode(env, mail, token);
  return worker.fetch(postForm('/api/decide', { token, code, message }), env);
}

// Signs a decision token the same way the Worker does, so tests can build
// expired or legacy links.
function sign(payloadObj, secret = 'test-signing-secret') {
  const p = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const s = createHmac('sha256', secret).update(p).digest('base64url');
  return `${p}.${s}`;
}

test('the owner email carries two distinct signed decision links', async () => {
  const mail = captureMail();
  try {
    const { acceptToken, declineToken } = await placeOrder(makeEnv(), mail);
    assert.ok(acceptToken, 'accept link present');
    assert.ok(declineToken, 'decline link present');
    assert.notEqual(acceptToken, declineToken);
    for (const t of [acceptToken, declineToken]) {
      assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'payload.signature');
    }
  } finally {
    mail.restore();
  }
});

test('GET /api/decide only shows the page — it never decides or emails', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { id, acceptToken } = await placeOrder(env, mail);

    const res = await worker.fetch(new Request(`${ORIGIN}/api/decide?token=${acceptToken}`), env);
    assert.equal(res.status, 200);
    const page = await res.text();
    assert.match(page, /Email me a security code/, 'first step is the code request');
    assert.doesNotMatch(page, /name="code"/, 'no code box until a code is sent');

    assert.equal(mail.sent.length, 0, 'a mail scanner prefetching the link sends nothing — not even a code');
    const stored = JSON.parse(await env.ORDERS.get(`order:${id}`));
    assert.equal(stored.status, 'pending', 'and the order is still pending');
  } finally {
    mail.restore();
  }
});

test('accept with the emailed code confirms the order and emails the customer', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { id, acceptToken } = await placeOrder(env, mail);

    const res = await decide(env, mail, acceptToken, 'See you Wednesday!');
    assert.equal(res.status, 200);

    assert.equal(mail.sent.length, 1, 'exactly one email, to the customer');
    assert.deepEqual(mail.sent[0].to, ['customer@example.com']);
    assert.match(mail.sent[0].html, /See you Wednesday!/, "the owner's note reaches the customer");

    const stored = JSON.parse(await env.ORDERS.get(`order:${id}`));
    assert.equal(stored.status, 'accepted');
    assert.ok(stored.decidedAt, 'decision is timestamped');
  } finally {
    mail.restore();
  }
});

test('decline with the emailed code emails the customer with the reason', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { id, declineToken } = await placeOrder(env, mail);

    await decide(env, mail, declineToken, 'Sorry, fully booked that week.');

    assert.equal(mail.sent.length, 1);
    assert.match(mail.sent[0].html, /fully booked/);
    const stored = JSON.parse(await env.ORDERS.get(`order:${id}`));
    assert.equal(stored.status, 'declined');
  } finally {
    mail.restore();
  }
});

test('deciding twice does not email the customer twice', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { acceptToken } = await placeOrder(env, mail);

    await decide(env, mail, acceptToken);
    assert.equal(mail.sent.length, 1);
    mail.sent.length = 0;

    const second = await decide(env, mail, acceptToken);
    assert.match(await second.text(), /already/i);
    assert.equal(mail.sent.length, 0, 'no second customer email, and no new code either');
  } finally {
    mail.restore();
  }
});

test('an accepted order cannot then be declined', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { id, acceptToken, declineToken } = await placeOrder(env, mail);

    await decide(env, mail, acceptToken);
    mail.sent.length = 0;
    const res = await decide(env, mail, declineToken);
    assert.match(await res.text(), /already/i);

    const stored = JSON.parse(await env.ORDERS.get(`order:${id}`));
    assert.equal(stored.status, 'accepted', 'the first decision stands');
    assert.equal(mail.sent.length, 0);
  } finally {
    mail.restore();
  }
});

// ------------------------------------------- the leaked-link protections
test('a decision link on its own can no longer accept an order', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { id, acceptToken } = await placeOrder(env, mail);

    for (const code of [undefined, '', '000000', 'abcdef']) {
      const fields = { token: acceptToken, message: 'hi' };
      if (code !== undefined) fields.code = code;
      const res = await worker.fetch(postForm('/api/decide', fields), env);
      assert.equal(res.status, 403, `refused with code ${JSON.stringify(code)}`);
    }
    assert.equal(mail.sent.length, 0, 'no email to anyone');
    const stored = JSON.parse(await env.ORDERS.get(`order:${id}`));
    assert.equal(stored.status, 'pending');
  } finally {
    mail.restore();
  }
});

test('the security code goes only to the owner, and carries no links', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { acceptToken } = await placeOrder(env, mail);

    const res = await worker.fetch(postForm('/api/decide/code', { token: acceptToken }), env);
    assert.equal(res.status, 200);
    const page = await res.text();
    assert.match(page, /name="code"/, 'now shows the code box');
    assert.doesNotMatch(page, /mercymillsourdough@gmail\.com/, 'the owner address is masked on the page');

    assert.equal(mail.sent.length, 1, 'one email');
    const codeMail = mail.sent[0];
    assert.deepEqual(codeMail.to, ['mercymillsourdough@gmail.com'], 'to the owner, never the customer');
    assert.match(codeMail.subject, /^\d{6} is your Mercy Mill security code/);
    assert.doesNotMatch(codeMail.html, /api\/decide|token=/, 'no decision link inside');
    assert.ok(!codeMail.html.includes(acceptToken.split('.')[1]), 'no token inside');
  } finally {
    mail.restore();
  }
});

test('the reply-to-the-customer attack: a quoted Accept link is useless', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    // The owner email is quoted in a reply, so the customer now holds it.
    const { id, ownerHtml } = await placeOrder(env, mail);
    const leaked = /\/api\/decide\?token=([^"'\s&]+)/.exec(ownerHtml)[1];

    // They can open the page...
    const page = await worker.fetch(new Request(`${ORIGIN}/api/decide?token=${leaked}`), env);
    assert.equal(page.status, 200);

    // ...and press "email me a code", but the code goes to the owner.
    await worker.fetch(postForm('/api/decide/code', { token: leaked }), env);
    assert.ok(
      mail.sent.every((m) => !m.to.includes('customer@example.com')),
      'nothing is ever sent to the customer'
    );
    mail.sent.length = 0;

    // So all they can do is guess, and guessing runs out.
    let last;
    for (let i = 0; i < 12; i++) {
      const guess = String(100000 + i);
      last = await worker.fetch(postForm('/api/decide', { token: leaked, code: guess }), env);
      if (last.status === 403 && /expired|cancelled/.test(await last.clone().text())) {
        await worker.fetch(postForm('/api/decide/code', { token: leaked }), env);
        mail.sent.length = 0;
      }
    }
    assert.equal(last.status, 429, 'the order locks after repeated wrong guesses');
    assert.match(await last.text(), /locked/i);

    const stored = JSON.parse(await env.ORDERS.get(`order:${id}`));
    assert.equal(stored.status, 'pending', 'the order was never accepted');
  } finally {
    mail.restore();
  }
});

test('the owner email replies to the owner and offers a fresh email to the customer', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    await worker.fetch(post('/api/order', sampleOrder()), env);
    const owner = mail.sent[1];
    assert.equal(owner.reply_to, 'mercymillsourdough@gmail.com', 'Reply never goes to the customer');
    assert.match(
      owner.html,
      /href="mailto:customer@example\.com\?subject=Your%20Mercy%20Mill%20Sourdough%20order%20MM-/,
      'a compose button that starts an unquoted email'
    );
    assert.notEqual(mail.sent[0].reply_to, 'customer@example.com');
  } finally {
    mail.restore();
  }
});

test('a hostile customer email address cannot break out of the compose link', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const res = await worker.fetch(
      post('/api/order', sampleOrder({ customer: { name: 'X', email: 'a"onclick=x<b>@example.com' } })),
      env
    );
    assert.equal(res.status, 200);
    const owner = mail.sent[1].html;
    assert.ok(!owner.includes('a"onclick'), 'quote is not emitted raw');
    assert.ok(!owner.includes('<b>@'), 'markup is not emitted raw');
  } finally {
    mail.restore();
  }
});

test('a wrong code is refused, counts down, and keeps the typed message', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { acceptToken } = await placeOrder(env, mail);
    const { code } = await requestCode(env, mail, acceptToken);
    const wrong = code === '000000' ? '111111' : '000000';

    const res = await worker.fetch(
      postForm('/api/decide', { token: acceptToken, code: wrong, message: 'Pickup at 4pm' }),
      env
    );
    assert.equal(res.status, 403);
    const page = await res.text();
    assert.match(page, /4 tries left/);
    assert.match(page, /Pickup at 4pm/, 'her message is not lost');

    // The right code still works afterwards.
    const ok = await worker.fetch(postForm('/api/decide', { token: acceptToken, code }), env);
    assert.equal(ok.status, 200);
  } finally {
    mail.restore();
  }
});

test('codes are single use and bound to the action they were sent for', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { id, acceptToken, declineToken } = await placeOrder(env, mail);
    const { code } = await requestCode(env, mail, acceptToken);

    const cross = await worker.fetch(postForm('/api/decide', { token: declineToken, code }), env);
    assert.equal(cross.status, 403, 'an accept code cannot decline');
    assert.equal(JSON.parse(await env.ORDERS.get(`order:${id}`)).status, 'pending');

    const ok = await worker.fetch(postForm('/api/decide', { token: acceptToken, code }), env);
    assert.equal(ok.status, 200);
    assert.equal(await env.ORDERS.get(`code:${id}:accept`), null, 'the code is deleted once used');
  } finally {
    mail.restore();
  }
});

test('an expired code is refused', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { id, acceptToken } = await placeOrder(env, mail);
    const { code } = await requestCode(env, mail, acceptToken);

    const key = `code:${id}:accept`;
    const rec = JSON.parse(await env.ORDERS.get(key));
    rec.exp = Date.now() - 1000;
    await env.ORDERS.put(key, JSON.stringify(rec));

    const res = await worker.fetch(postForm('/api/decide', { token: acceptToken, code }), env);
    assert.equal(res.status, 403);
    assert.match(await res.text(), /expired/i);
    assert.equal(mail.sent.length, 0);
  } finally {
    mail.restore();
  }
});

test('codes are hashed at rest, not stored in plain text', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { id, acceptToken } = await placeOrder(env, mail);
    const { code } = await requestCode(env, mail, acceptToken);
    const raw = await env.ORDERS.get(`code:${id}:accept`);
    assert.ok(!raw.includes(code), 'the code itself is not in storage');
  } finally {
    mail.restore();
  }
});

test('code emails are capped per order', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { acceptToken } = await placeOrder(env, mail);
    const statuses = [];
    for (let i = 0; i < 7; i++) {
      const res = await worker.fetch(postForm('/api/decide/code', { token: acceptToken }), env);
      statuses.push(res.status);
    }
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429]);
    assert.equal(mail.sent.length, 5, 'the owner inbox cannot be flooded');
  } finally {
    mail.restore();
  }
});

test('an expired decision link is refused; a legacy link without expiry still needs a code', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { id } = await placeOrder(env, mail);
    const order = JSON.parse(await env.ORDERS.get(`order:${id}`));

    const expired = sign({ id, action: 'accept', order, exp: Date.now() - 1000 });
    const res = await worker.fetch(new Request(`${ORIGIN}/api/decide?token=${expired}`), env);
    assert.equal(res.status, 400);

    const legacy = sign({ id, action: 'accept', order });
    const noCode = await worker.fetch(postForm('/api/decide', { token: legacy }), env);
    assert.equal(noCode.status, 403, 'a pre-upgrade link cannot skip the code');
    assert.equal(mail.sent.length, 0);
  } finally {
    mail.restore();
  }
});

test('decision pages fail closed when storage, secret or owner email is missing', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { acceptToken } = await placeOrder(env, mail);

    for (const missing of ['ORDERS', 'SIGNING_SECRET', 'OWNER_EMAIL']) {
      const broken = { ...env, [missing]: undefined };
      const get = await worker.fetch(new Request(`${ORIGIN}/api/decide?token=${acceptToken}`), broken);
      const send = await worker.fetch(postForm('/api/decide/code', { token: acceptToken }), broken);
      const dec = await worker.fetch(postForm('/api/decide', { token: acceptToken, code: '123456' }), broken);
      assert.deepEqual([get.status, send.status, dec.status], [503, 503, 503], `without ${missing}`);

      const health = await (await worker.fetch(new Request(ORIGIN + '/'), broken)).text();
      assert.match(health, /Warning/, `health check flags missing ${missing}`);
    }
    assert.equal(mail.sent.length, 0);
  } finally {
    mail.restore();
  }
});

test('decision pages are not cached, framed, indexed or leaked via Referer', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { acceptToken } = await placeOrder(env, mail);
    const res = await worker.fetch(new Request(`${ORIGIN}/api/decide?token=${acceptToken}`), env);
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(res.headers.get('content-security-policy'), /form-action 'self'/);
    assert.match(res.headers.get('x-robots-tag'), /noindex/);
  } finally {
    mail.restore();
  }
});

test('a tampered or forged token is refused', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { id, acceptToken } = await placeOrder(env, mail);
    const [payload, sig] = acceptToken.split('.');

    const forged = [
      acceptToken.slice(0, -2) + 'xy', // wrong signature
      payload, // no signature at all
      `${payload}.`, // empty signature
      // payload rewritten to a bigger order, signature kept
      Buffer.from(JSON.stringify({ id, action: 'accept', order: { id, total: 9999 } }))
        .toString('base64url') + '.' + sig,
    ];

    for (const token of forged) {
      for (const path of ['/api/decide/code', '/api/decide']) {
        const res = await worker.fetch(postForm(path, { token, code: '123456' }), env);
        assert.equal(res.status, 400, `${path} refused: ${token.slice(0, 24)}…`);
        assert.match(await res.text(), /invalid/i);
      }
    }
    assert.equal(mail.sent.length, 0, 'no email — not even a code — from a forged link');

    const stored = JSON.parse(await env.ORDERS.get(`order:${id}`));
    assert.equal(stored.status, 'pending', 'and the order is untouched');
  } finally {
    mail.restore();
  }
});

test('a token signed with a different secret is refused', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { acceptToken } = await placeOrder(env, mail);
    const other = makeEnv({ SIGNING_SECRET: 'a-different-secret', ORDERS: env.ORDERS });
    const res = await worker.fetch(postForm('/api/decide/code', { token: acceptToken }), other);
    assert.equal(res.status, 400);
    assert.equal(mail.sent.length, 0);
  } finally {
    mail.restore();
  }
});

test('the shape and flavour the customer picked reach the owner', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const res = await worker.fetch(post('/api/order', sampleOrder()), env);
    const { id } = await res.json();

    // Mom bakes from this email: she has to know boule vs sandwich, and which
    // bagel flavour, or the order is not actionable.
    const ownerHtml = mail.sent[1].html;
    assert.match(ownerHtml, /Boule \(round\)/, 'shape choice is in the owner email');
    assert.match(ownerHtml, /Plain/, 'bagel flavour is in the owner email');
    assert.match(ownerHtml, /12 bagels/, 'bagel size is in the owner email');

    // and the customer's own copy should agree with what they chose
    assert.match(mail.sent[0].html, /Boule \(round\)/, 'shape choice is in the customer email');

    const stored = JSON.parse(await env.ORDERS.get(`order:${id}`));
    const loaf = stored.items.find((i) => i.id === 'artisan-loaf');
    assert.equal(loaf.options.Shape, 'Boule (round)', 'choices are kept on the stored order');
    const bagel = stored.items.find((i) => i.id === 'bagels');
    assert.equal(bagel.size, '12 bagels');
    assert.equal(bagel.options.Flavour, 'Plain');
  } finally {
    mail.restore();
  }
});

test('item choices are sanitised, not stored or emailed raw', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const nasty = sampleOrder({
      items: [
        {
          id: 'artisan-loaf',
          name: 'Artisan Regular Loaf',
          price: 11,
          qty: 1,
          size: { not: 'a string' },
          options: {
            Shape: '<img src=x onerror=alert(1)>',
            Junk: { nested: true },
            Empty: '',
            ...Object.fromEntries([...Array(40)].map((_, i) => [`k${i}`, `v${i}`])),
          },
        },
      ],
    });
    const res = await worker.fetch(post('/api/order', nasty), env);
    const { id } = await res.json();
    const stored = JSON.parse(await env.ORDERS.get(`order:${id}`));
    const it = stored.items[0];

    assert.equal(typeof it.size, 'string', 'a non-string size is coerced');
    for (const [k, v] of Object.entries(it.options)) {
      assert.equal(typeof k, 'string');
      assert.equal(typeof v, 'string');
      assert.ok(v.length <= 120, 'values are bounded');
    }
    assert.ok(Object.keys(it.options).length <= 8, 'the number of options is bounded');
    assert.ok(!('Empty' in it.options), 'empty values are dropped');

    // The templates escape, so the markup must not survive as live HTML.
    assert.ok(!mail.sent[1].html.includes('<img src=x'), 'injected markup is escaped');
  } finally {
    mail.restore();
  }
});

test('the review page mom confirms from also shows the choices', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { acceptToken } = await placeOrder(env, mail);
    const res = await worker.fetch(new Request(`${ORIGIN}/api/decide?token=${acceptToken}`), env);
    const page = await res.text();
    assert.match(page, /Boule \(round\)/, 'shape is on the confirm page');
    assert.match(page, /Plain/, 'flavour is on the confirm page');
  } finally {
    mail.restore();
  }
});

test('unknown routes 404', async () => {
  const res = await worker.fetch(new Request(ORIGIN + '/api/nope', { method: 'POST' }), makeEnv());
  assert.equal(res.status, 404);
});

test('CORS preflight is answered', async () => {
  const env = makeEnv({ ALLOW_ORIGIN: 'https://mercymillsourdough.com' });
  const res = await worker.fetch(new Request(ORIGIN + '/api/order', { method: 'OPTIONS' }), env);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://mercymillsourdough.com');
});
