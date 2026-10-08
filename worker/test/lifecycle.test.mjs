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
async function placeOrder(env, mail) {
  const res = await worker.fetch(post('/api/order', sampleOrder()), env);
  const { id } = await res.json();
  const ownerHtml = mail.sent[1].html;
  const links = [...ownerHtml.matchAll(/https?:\/\/[^"'\s]*\/api\/decide\?token=([^"'\s&]+)/g)].map(
    (m) => m[1]
  );
  mail.sent.length = 0; // only look at what the decision sends
  return { id, acceptToken: links[0], declineToken: links[1] };
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

test('GET /api/decide only shows a form — it never decides or emails', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { id, acceptToken } = await placeOrder(env, mail);

    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/decide?token=${acceptToken}`),
      env
    );
    assert.equal(res.status, 200);
    const page = await res.text();
    assert.match(page, /<form/i, 'renders a form for the owner to confirm');

    assert.equal(mail.sent.length, 0, 'a mail scanner prefetching the link sends nothing');
    const stored = JSON.parse(await env.ORDERS.get(`order:${id}`));
    assert.equal(stored.status, 'pending', 'and the order is still pending');
  } finally {
    mail.restore();
  }
});

test('POST accept emails the customer and marks the order accepted', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { id, acceptToken } = await placeOrder(env, mail);

    const res = await worker.fetch(
      postForm('/api/decide', { token: acceptToken, message: 'See you Wednesday!' }),
      env
    );
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

test('POST decline emails the customer with the reason', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { id, declineToken } = await placeOrder(env, mail);

    await worker.fetch(
      postForm('/api/decide', { token: declineToken, message: 'Sorry, fully booked that week.' }),
      env
    );

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

    await worker.fetch(postForm('/api/decide', { token: acceptToken }), env);
    assert.equal(mail.sent.length, 1);

    const second = await worker.fetch(postForm('/api/decide', { token: acceptToken }), env);
    assert.match(await second.text(), /already/i);
    assert.equal(mail.sent.length, 1, 'still just the one email');
  } finally {
    mail.restore();
  }
});

test('an accepted order cannot then be declined', async () => {
  const mail = captureMail();
  try {
    const env = makeEnv();
    const { id, acceptToken, declineToken } = await placeOrder(env, mail);

    await worker.fetch(postForm('/api/decide', { token: acceptToken }), env);
    const res = await worker.fetch(postForm('/api/decide', { token: declineToken }), env);
    assert.match(await res.text(), /already/i);

    const stored = JSON.parse(await env.ORDERS.get(`order:${id}`));
    assert.equal(stored.status, 'accepted', 'the first decision stands');
    assert.equal(mail.sent.length, 1);
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
      Buffer.from(JSON.stringify({ id, action: 'accept', order: { total: 9999 } }))
        .toString('base64url') + '.' + sig,
    ];

    for (const token of forged) {
      const res = await worker.fetch(postForm('/api/decide', { token }), env);
      assert.equal(res.status, 400, `refused: ${token.slice(0, 24)}…`);
      assert.match(await res.text(), /invalid/i);
    }
    assert.equal(mail.sent.length, 0, 'no email from a forged link');

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
    const res = await worker.fetch(postForm('/api/decide', { token: acceptToken }), other);
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
