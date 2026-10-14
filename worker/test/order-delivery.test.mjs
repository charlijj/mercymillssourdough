// ============================================================================
//  Delivery and failure modes: what happens when things go wrong.
//  The rule these tests enforce: an order is either delivered to the owner, or
//  the customer is told it was not. It is never silently lost or doubled.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/index.js';
import { menu } from '../../src/data/menu.js';
import { makeEnv, captureMail, sampleOrder, post, ORIGIN, ownerMail, customerMail } from './helpers.mjs';

const OWNER = 'mercymillsourdough@gmail.com';
const CUSTOMER = 'customer@example.com';
const toOwner = (b) => b.to.includes(OWNER);
const toCustomer = (b) => b.to.includes(CUSTOMER);

const withMail = async (opts, fn) => {
  const mail = captureMail(opts);
  try {
    return await fn(mail);
  } finally {
    mail.restore();
  }
};
const orderReq = (body = sampleOrder(), headers = {}) =>
  new Request(`${ORIGIN}/api/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

// ---------------------------------------------------------- email failures
test('if the owner email fails, the customer is told and nothing is left behind', () =>
  withMail({ fail: toOwner }, async (mail) => {
    const env = makeEnv();
    const res = await worker.fetch(post('/api/order', sampleOrder()), env);
    const body = await res.json();

    assert.equal(res.status, 502);
    assert.equal(body.success, false);
    assert.equal(body.code, 'email_failed');
    assert.match(body.error, /try again|email us/i);

    assert.equal(mail.sent.length, 0, 'the customer is NOT sent "we got your order" for an order the owner never saw');
    const keys = [...env.ORDERS.store.keys()].filter((k) => k.startsWith('order:'));
    assert.deepEqual(keys, [], 'no phantom order record');
  }));

test('after an owner-email failure the customer can retry with the same key', async () => {
  const flaky = { down: true };
  const mail = captureMail({ fail: (b) => toOwner(b) && flaky.down });
  try {
    const env = makeEnv();
    const order = sampleOrder({ orderKey: 'retry-key-0001' });

    const first = await worker.fetch(post('/api/order', order), env);
    assert.equal(first.status, 502);

    flaky.down = false; // the mail service recovers
    const second = await worker.fetch(post('/api/order', order), env);
    const body = await second.json();
    assert.equal(second.status, 200, 'the retry is not blocked by the failed attempt');
    assert.equal(body.success, true);
    assert.equal(mail.sent.filter(toOwner).length, 1, 'the owner gets exactly one email');
  } finally {
    mail.restore();
  }
});

test('if only the customer email fails, the order still goes through and says so', () =>
  withMail({ fail: toCustomer }, async (mail) => {
    const env = makeEnv();
    const res = await worker.fetch(post('/api/order', sampleOrder()), env);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.customerEmail, false, 'the page can tell them to expect a reply instead');
    assert.equal(mail.sent.filter(toOwner).length, 1, 'the owner has the order');
    const stored = JSON.parse(await env.ORDERS.get(`order:${body.id}`));
    assert.equal(stored.status, 'pending', 'and it can still be accepted');
  }));

test('the owner is emailed before the customer', () =>
  withMail({}, async (mail) => {
    await worker.fetch(post('/api/order', sampleOrder()), makeEnv());
    assert.deepEqual(mail.sent.map((m) => m.to[0]), [OWNER, CUSTOMER]);
  }));

test('a normal success reports the customer email as sent', () =>
  withMail({}, async () => {
    const body = await (await worker.fetch(post('/api/order', sampleOrder()), makeEnv())).json();
    assert.equal(body.customerEmail, true);
  }));

// ----------------------------------------------------------- duplicate sends
test('the same order key twice sends one email, and returns the same order', () =>
  withMail({}, async (mail) => {
    const env = makeEnv();
    const order = sampleOrder({ orderKey: 'double-click-0001' });
    const a = await (await worker.fetch(post('/api/order', order), env)).json();
    const b = await (await worker.fetch(post('/api/order', order), env)).json();

    assert.equal(a.success && b.success, true);
    assert.equal(b.id, a.id, 'the same order reference');
    assert.equal(b.duplicate, true);
    assert.equal(mail.sent.filter(toOwner).length, 1, 'the owner is not emailed twice');
    assert.equal(mail.sent.filter(toCustomer).length, 1, 'nor the customer');
    assert.equal([...env.ORDERS.store.keys()].filter((k) => k.startsWith('order:')).length, 1);
  }));

test('different order keys are different orders', () =>
  withMail({}, async (mail) => {
    const env = makeEnv();
    await worker.fetch(post('/api/order', sampleOrder({ orderKey: 'order-key-AAAA' })), env);
    await worker.fetch(post('/api/order', sampleOrder({ orderKey: 'order-key-BBBB' })), env);
    assert.equal(mail.sent.filter(toOwner).length, 2);
  }));

test('a malformed order key is ignored rather than trusted', () =>
  withMail({}, async (mail) => {
    const env = makeEnv();
    for (const orderKey of ['x', '../../etc', 'a'.repeat(200), { a: 1 }, 'has space here']) {
      const res = await worker.fetch(post('/api/order', sampleOrder({ orderKey })), env);
      assert.equal(res.status, 200);
    }
    assert.equal(mail.sent.filter(toOwner).length, 5, 'each is processed as a fresh order');
    assert.equal([...env.ORDERS.store.keys()].filter((k) => k.startsWith('idem:')).length, 0);
  }));

// ---------------------------------------------------------------- rate limit
test('one connection cannot place unlimited orders', () =>
  withMail({}, async (mail) => {
    const env = makeEnv();
    const statuses = [];
    for (let i = 0; i < 13; i++) {
      const res = await worker.fetch(orderReq(sampleOrder(), { 'cf-connecting-ip': '203.0.113.7' }), env);
      statuses.push(res.status);
    }
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200));
    assert.deepEqual(statuses.slice(10), [429, 429, 429]);
    assert.equal(mail.sent.filter(toOwner).length, 10, 'the owner inbox is protected');

    // a different visitor is unaffected
    const other = await worker.fetch(orderReq(sampleOrder(), { 'cf-connecting-ip': '198.51.100.9' }), env);
    assert.equal(other.status, 200);
  }));

test('rejected orders do not use up the allowance', () =>
  withMail({}, async () => {
    const env = makeEnv();
    for (let i = 0; i < 15; i++) {
      await worker.fetch(orderReq(sampleOrder({ items: [] }), { 'cf-connecting-ip': '203.0.113.8' }), env);
    }
    const ok = await worker.fetch(orderReq(sampleOrder(), { 'cf-connecting-ip': '203.0.113.8' }), env);
    assert.equal(ok.status, 200);
  }));

// -------------------------------------------------------------------- origin
test('a browser page on another site cannot place an order', () =>
  withMail({}, async (mail) => {
    const env = makeEnv({ ALLOW_ORIGIN: 'https://mercymillsourdough.com' });
    const bad = await worker.fetch(orderReq(sampleOrder(), { Origin: 'https://evil.example' }), env);
    assert.equal(bad.status, 403);
    assert.equal((await bad.json()).code, 'bad_origin');
    assert.equal(mail.sent.length, 0);

    const good = await worker.fetch(orderReq(sampleOrder(), { Origin: 'https://mercymillsourdough.com' }), env);
    assert.equal(good.status, 200);
    assert.equal(good.headers.get('access-control-allow-origin'), 'https://mercymillsourdough.com');
  }));

test('ALLOW_ORIGIN can list several origins, and the matching one is echoed back', () =>
  withMail({}, async () => {
    const env = makeEnv({ ALLOW_ORIGIN: 'https://mercymillsourdough.com, https://www.mercymillsourdough.com' });
    const www = await worker.fetch(orderReq(sampleOrder(), { Origin: 'https://www.mercymillsourdough.com' }), env);
    assert.equal(www.status, 200);
    assert.equal(www.headers.get('access-control-allow-origin'), 'https://www.mercymillsourdough.com');
    assert.equal(www.headers.get('vary'), 'Origin');
  }));

test('requests with no Origin (curl, the smoke test) are allowed', () =>
  withMail({}, async () => {
    const env = makeEnv({ ALLOW_ORIGIN: 'https://mercymillsourdough.com' });
    assert.equal((await worker.fetch(orderReq(), env)).status, 200);
  }));

// ---------------------------------------------------------------- body size
test('an oversized body is refused before it is parsed', () =>
  withMail({}, async (mail) => {
    const huge = sampleOrder({ notes: 'x'.repeat(50000) });
    const res = await worker.fetch(orderReq(huge), makeEnv());
    assert.equal(res.status, 413);
    assert.equal(mail.sent.length, 0);
  }));

// ------------------------------------------------------- fail closed on config
test('ordering is refused, loudly, when anything it needs is missing', () =>
  withMail({}, async (mail) => {
    for (const missing of ['ORDERS', 'SIGNING_SECRET', 'OWNER_EMAIL', 'RESEND_API_KEY', 'FROM_EMAIL']) {
      const env = { ...makeEnv(), [missing]: undefined };
      const res = await worker.fetch(post('/api/order', sampleOrder()), env);
      const body = await res.json();
      assert.equal(res.status, 503, `without ${missing}`);
      assert.equal(body.code, 'unavailable');
      assert.match(body.error, /email us/i, 'the customer is given a way to order anyway');

      const health = await (await worker.fetch(new Request(ORIGIN + '/'), env)).text();
      assert.match(health, /Warning/, `health check warns without ${missing}`);
      assert.ok(health.includes(missing), `and names ${missing}: ${health}`);
    }
    assert.equal(mail.sent.length, 0, 'an order we cannot deliver is not accepted');
  }));

test('the health check reports the order-API version the smoke test relies on', async () => {
  const res = await worker.fetch(new Request(ORIGIN + '/'), makeEnv());
  assert.equal(res.headers.get('x-mms-orders'), '2');
});

test('health check is clean when everything is configured', async () => {
  const text = await (await worker.fetch(new Request(ORIGIN + '/'), makeEnv())).text();
  assert.doesNotMatch(text, /Warning/);
});

test('DRY_RUN lets local development run without real mail', () =>
  withMail({}, async (mail) => {
    const env = { ...makeEnv(), RESEND_API_KEY: undefined, DRY_RUN: 'true' };
    const res = await worker.fetch(post('/api/order', sampleOrder()), env);
    assert.equal(res.status, 200);
    assert.equal(mail.attempts.length, 0, 'nothing reaches Resend in dry-run mode');
  }));

// ------------------------------------------------- every product is orderable
test('every menu item, size and choice can be ordered at its menu price', () =>
  withMail({}, async (mail) => {
    // Guards against the site and the Worker drifting apart: if someone adds a
    // product, changes a price or renames a flavour, this fails until the
    // Worker agrees with the page.
    const env = makeEnv();
    let lines = 0;
    for (const p of menu) {
      const sizes = p.sizes?.length ? p.sizes : [null];
      const optionSets = (p.options || []).reduce(
        (acc, o) => acc.flatMap((set) => o.choices.map((c) => ({ ...set, [o.label]: c.label }))),
        [{}]
      );
      for (const size of sizes) {
        for (const options of optionSets) {
          const price = size ? size.price : p.price;
          const body = sampleOrder({
            items: [{ id: p.id, name: p.name, qty: 2, price, ...(size ? { size: size.label } : {}), options }],
          });
          const res = await worker.fetch(post('/api/order', body), env);
          const j = await res.json();
          assert.equal(res.status, 200, `${p.id} ${size?.label || ''} ${JSON.stringify(options)}: ${j.error}`);
          const stored = JSON.parse(await env.ORDERS.get(`order:${j.id}`));
          assert.equal(stored.total, price * 2, `${p.id} total`);
          assert.equal(stored.items[0].name, p.name);
          lines++;
        }
      }
    }
    assert.ok(lines >= menu.length, `${lines} product variations ordered`);
    assert.equal(mail.sent.filter(toOwner).length, lines);
  }));

test('every product shows its choices in the owner email', () =>
  withMail({}, async (mail) => {
    const env = makeEnv();
    for (const p of menu) {
      mail.sent.length = 0;
      const size = p.sizes?.[0];
      await worker.fetch(
        post('/api/order', sampleOrder({ items: [{ id: p.id, qty: 1, price: size ? size.price : p.price, ...(size ? { size: size.label } : {}) }] })),
        env
      );
      const html = ownerMail(mail).html;
      assert.ok(html.includes(p.name.replace(/&/g, '&amp;')), `${p.id} name`);
      for (const o of p.options || []) assert.ok(html.includes(o.choices[0].label), `${p.id} ${o.label}`);
      if (size) assert.ok(html.includes(size.label), `${p.id} size`);
    }
  }));

test('a full realistic order from a Mandarin-speaking customer works end to end', () =>
  withMail({}, async (mail) => {
    const env = makeEnv();
    const res = await worker.fetch(
      post('/api/order', sampleOrder({
        lang: 'zh',
        customer: { name: '陳小明', email: CUSTOMER, phone: '778-555-0199' },
        notes: '請在 Fraser Heights Recreation Centre 取貨。對堅果過敏。',
        items: [
          { id: 'artisan-loaf', qty: 2, price: 11, options: { Shape: 'Sandwich (loaf)' } },
          { id: 'bagels', qty: 1, size: '6 bagels', price: 15, options: { Flavour: 'Everything' } },
          { id: 'mantou', qty: 1, price: 25 },
        ],
      })),
      env
    );
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(await env.ORDERS.get(`order:${body.id}`)).total, 62);
    assert.match(ownerMail(mail).html, /對堅果過敏/);
    assert.match(customerMail(mail).html, /陳小明/);
  }));
