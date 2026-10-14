// ============================================================================
//  Order validation: the Worker must never trust the browser.
//  Every case here is something a customer — or someone with curl — could send.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/index.js';
import { menu } from '../../src/data/menu.js';
import { pickup } from '../../src/data/pickup.js';
import { validateOrder, validatePickupDate, todayInVancouver, LIMITS } from '../src/validate.js';
import { makeEnv, captureMail, sampleOrder, post, validPickupDate } from './helpers.mjs';

const line = (over = {}) => ({ id: 'artisan-loaf', qty: 1, price: 11, options: { Shape: 'Boule (round)' }, ...over });
const order = (over = {}) => sampleOrder({ items: [line()], ...over });

// Run an order through the real Worker and return { res, body, stored, mail }.
async function submit(body, envOver = {}) {
  const mail = captureMail();
  const env = makeEnv(envOver);
  try {
    const res = await worker.fetch(post('/api/order', body), env);
    const json = await res.json();
    const stored = json.id ? JSON.parse((await env.ORDERS.get(`order:${json.id}`)) || 'null') : null;
    return { res, body: json, stored, mail: mail.sent, env };
  } finally {
    mail.restore();
  }
}

const rejected = (r, status, code) => {
  assert.equal(r.res.status, status, `status ${r.res.status} (${r.body.error})`);
  assert.equal(r.body.success, false);
  if (code) assert.equal(r.body.code, code);
  assert.equal(r.mail.length, 0, 'nothing is emailed for a rejected order');
};

// ---------------------------------------------------------------- prices
test('the price comes from the menu, so a tampered price is refused', async () => {
  const r = await submit(order({ items: [line({ price: 0.01 })] }));
  rejected(r, 409, 'price_changed');
  assert.match(r.body.error, /refresh/i);
});

test('a stale page (menu price changed since it loaded) is told to refresh', async () => {
  const r = await submit(order({ items: [line({ price: 10 })] })); // the loaf used to be $10
  rejected(r, 409, 'price_changed');
});

test('a missing price is fine: the menu price is used', async () => {
  const { price, ...noPrice } = line();
  const r = await submit(order({ items: [noPrice] }));
  assert.equal(r.res.status, 200);
  assert.equal(r.stored.items[0].price, 11);
  assert.equal(r.stored.total, 11);
});

test('names and units on the stored order come from the menu, not the request', async () => {
  const r = await submit(order({ items: [line({ name: 'FREE BREAD <script>', unit: 'lifetime supply' })] }));
  assert.equal(r.res.status, 200);
  assert.equal(r.stored.items[0].name, 'Artisan Regular Loaf');
  assert.equal(r.stored.items[0].unit, 'loaf');
});

test('the total is recomputed and a client total is ignored', async () => {
  const r = await submit(order({ total: 1, items: [line({ qty: 3 })] }));
  assert.equal(r.stored.total, 33);
});

test('size changes the price, and a wrong price for that size is refused', async () => {
  const six = await submit(order({ items: [{ id: 'bagels', qty: 1, size: '6 bagels', price: 15, options: { Flavour: 'Plain' } }] }));
  assert.equal(six.stored.total, 15);
  const twelve = await submit(order({ items: [{ id: 'bagels', qty: 1, size: '12 bagels', price: 28, options: { Flavour: 'Plain' } }] }));
  assert.equal(twelve.stored.total, 28);
  const lying = await submit(order({ items: [{ id: 'bagels', qty: 1, size: '12 bagels', price: 15, options: { Flavour: 'Plain' } }] }));
  rejected(lying, 409, 'price_changed');
});

// ------------------------------------------------------------ items / qty
test('an item that is not on the menu is refused', async () => {
  rejected(await submit(order({ items: [line({ id: 'sourdough-buns', price: 5 })] })), 400, 'bad_item');
  rejected(await submit(order({ items: [line({ id: '../../admin' })] })), 400, 'bad_item');
  rejected(await submit(order({ items: [line({ id: undefined })] })), 400, 'bad_item');
});

test('quantities must be whole numbers from 1 to 5', async () => {
  for (const qty of [6, 99, 1.5, '7', 5.0001]) {
    rejected(await submit(order({ items: [line({ qty })] })), 400, 'bad_qty');
  }
  for (const qty of [1, 5, '3']) {
    assert.equal((await submit(order({ items: [line({ qty })] }))).res.status, 200, `qty ${qty}`);
  }
});

test('a zero, negative or non-numeric quantity means "not ordered"', async () => {
  // the dropdown's 0 is sent as 0; JSON turns NaN and Infinity into null
  for (const qty of [0, -2, 'lots', null, NaN, Infinity]) {
    const r = await submit(order({ items: [line({ qty }), line({ id: 'focaccia', price: 14, options: undefined })] }));
    assert.equal(r.res.status, 200);
    assert.deepEqual(r.stored.items.map((i) => i.id), ['focaccia'], `qty ${qty} is dropped`);
  }
});

test('an order with nothing in it is refused', async () => {
  rejected(await submit(order({ items: [] })), 400, 'no_items');
  rejected(await submit(order({ items: [line({ qty: 0 })] })), 400, 'no_items');
  rejected(await submit(order({ items: 'bread' })), 400, 'no_items');
  rejected(await submit(order({ items: undefined })), 400, 'no_items');
  rejected(await submit(order({ items: [null, 5, 'x'] })), 400, 'no_items');
});

test('an absurdly large order is refused', async () => {
  const many = menu.map((p) => ({ id: p.id, qty: 5, size: p.sizes?.[0]?.label, price: p.sizes?.[0]?.price ?? p.price }));
  rejected(await submit(order({ items: many })), 400, 'too_many'); // 15 x 5 = 75 > 40
});

// ---------------------------------------------------------------- options
test('shape and flavour must be real choices', async () => {
  rejected(await submit(order({ items: [line({ options: { Shape: 'Pretzel' } })] })), 400, 'bad_option');
  rejected(await submit(order({ items: [line({ options: { Colour: 'Blue' } })] })), 400, 'bad_option');
  rejected(await submit(order({ items: [{ id: 'bagels', qty: 1, size: '99 bagels', price: 15 }] })), 400, 'bad_option');
  rejected(await submit(order({ items: [{ id: 'focaccia', qty: 1, price: 14, size: '6' }] })), 400, 'bad_option');
});

test('a missing choice falls back to the first, so the owner always sees one', async () => {
  const r = await submit(order({ items: [{ id: 'artisan-loaf', qty: 1, price: 11 }] }));
  assert.equal(r.res.status, 200);
  assert.deepEqual(r.stored.items[0].options, { Shape: 'Boule (round)' });
  const b = await submit(order({ items: [{ id: 'bagels', qty: 1, price: 15 }] }));
  assert.equal(b.stored.items[0].size, '6 bagels');
  assert.deepEqual(b.stored.items[0].options, { Flavour: 'Plain' });
});

test('hostile values in options are refused or ignored, never stored', async () => {
  rejected(await submit(order({ items: [line({ options: { Shape: { $gt: '' } } })] })), 400, 'bad_option');
  rejected(await submit(order({ items: [line({ options: { Shape: 5 } })] })), 400, 'bad_option');
  rejected(await submit(order({ items: [line({ options: { Shape: '<img src=x onerror=alert(1)>' } })] })), 400, 'bad_option');
  rejected(await submit(order({ items: [{ id: 'bagels', qty: 1, size: { n: 12 }, price: 15 }] })), 400, 'bad_option');
  // an array where an object belongs is ignored, leaving the default
  const r = await submit(order({ items: [line({ options: ['Boule (round)'] })] }));
  assert.equal(r.res.status, 200);
  assert.deepEqual(r.stored.items[0].options, { Shape: 'Boule (round)' });
});

// --------------------------------------------------------------- customer
test('customer fields are required, bounded and cleaned', async () => {
  rejected(await submit(order({ customer: { name: '   ', email: 'a@b.co' } })), 400, 'bad_customer');
  rejected(await submit(order({ customer: { name: 'A', email: 'nope' } })), 400, 'bad_customer');
  rejected(await submit(order({ customer: { name: 'A', email: 'a b@c.co' } })), 400, 'bad_customer');
  rejected(await submit(order({ customer: { name: 'A', email: `${'x'.repeat(250)}@b.co` } })), 400, 'bad_customer');
  rejected(await submit(order({ customer: 'me' })), 400, 'bad_customer');
  rejected(await submit(order({ customer: { name: { a: 1 }, email: 'a@b.co' } })), 400, 'bad_customer');

  const long = await submit(order({ customer: { name: 'N'.repeat(500), email: 'a@b.co', phone: '9'.repeat(500) }, notes: 'x'.repeat(5000) }));
  assert.equal(long.res.status, 200);
  assert.equal(long.stored.customer.name.length, LIMITS.name);
  assert.equal(long.stored.customer.phone.length, LIMITS.phone);
  assert.equal(long.stored.notes.length, LIMITS.notes);
});

test('whitespace is trimmed from the customer details', async () => {
  const r = await submit(order({ customer: { name: '  Mei Lin  ', email: '  mei@example.com ', phone: ' 604 ' } }));
  assert.equal(r.stored.customer.name, 'Mei Lin');
  assert.equal(r.stored.customer.email, 'mei@example.com');
  assert.equal(r.stored.customer.phone, '604');
});

test('Chinese names and notes are kept intact', async () => {
  const r = await submit(order({ customer: { name: '林美玲', email: 'mei@example.com' }, notes: '請放在 Fraser Heights 社區中心，謝謝！' }));
  assert.equal(r.res.status, 200);
  assert.equal(r.stored.customer.name, '林美玲');
  assert.equal(r.stored.notes, '請放在 Fraser Heights 社區中心，謝謝！');
});

// ------------------------------------------------------------ pickup date
test('the pickup date is required and must be a real date', async () => {
  for (const d of [undefined, '', 'tomorrow', '2026-13-01', '2026-02-30', '14/10/2026', '2026-10-1', null, 20261014, {}]) {
    rejected(await submit(order({ pickupDate: d })), 400, 'bad_date');
  }
});

test('pickup must be on a day the bakery offers', async () => {
  const good = validPickupDate();
  const weekday = new Date(`${good}T00:00:00Z`).getUTCDay();
  assert.ok(pickup.availableWeekdays.includes(weekday));
  assert.equal((await submit(order({ pickupDate: good }))).res.status, 200);

  // the day after is a different weekday; find one that is not offered
  for (let i = 1; i < 7; i++) {
    const t = new Date(`${good}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + i);
    if (!pickup.availableWeekdays.includes(t.getUTCDay())) {
      rejected(await submit(order({ pickupDate: t.toISOString().slice(0, 10) })), 400, 'bad_date');
      return;
    }
  }
});

test('pickup dates in the past, too soon, or too far ahead are refused', async () => {
  const now = new Date();
  const iso = (days) => {
    const [y, m, d] = todayInVancouver(now).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  };
  const ok = (str) => validatePickupDate(str, { now }).ok;

  assert.equal(ok(iso(-7)), false, 'a week ago');
  assert.equal(ok(iso(0)), false, 'today');
  assert.equal(ok(iso(1)), false, 'tomorrow is inside the lead time');
  assert.equal(ok(iso(400)), false, 'over a year away');
});

test('lead time and weekday rules follow src/data/pickup.js', () => {
  // A fixed "now" makes this exact. 2026-10-14 is a Wednesday (Vancouver noon).
  const now = new Date('2026-10-14T19:00:00Z');
  const rules = { availableWeekdays: [0, 3], minLeadDays: 3, monthsAhead: 3, blackoutDates: ['2026-12-23'] };
  const ok = (d) => validatePickupDate(d, { pickup: rules, now }).ok;

  assert.equal(ok('2026-10-21'), true, 'next Wednesday');
  assert.equal(ok('2026-10-18'), true, 'Sunday, 4 days out');
  assert.equal(ok('2026-10-14'), false, 'today');
  assert.equal(ok('2026-10-15'), false, 'a Thursday');
  assert.equal(ok('2026-12-23'), false, 'blacked out');
  assert.equal(ok('2027-03-10'), false, 'a Wednesday more than 3 months out');
  assert.equal(ok('2026-10-17'), false, 'a Saturday');
});

test('one day of slack covers a customer whose clock is a day behind Vancouver', () => {
  const now = new Date('2026-10-14T19:00:00Z'); // Wed in Vancouver
  const rules = { availableWeekdays: [0, 3, 4], minLeadDays: 3, monthsAhead: 3 };
  // Today + 3 is Saturday (not offered), so use Sunday = today + 4 (fine) and
  // Thursday = today + 1 (inside slack? lead-1 = 2 days, so no).
  assert.equal(validatePickupDate('2026-10-18', { pickup: rules, now }).ok, true);
  assert.equal(validatePickupDate('2026-10-15', { pickup: rules, now }).ok, false);
  // A Thursday exactly lead-1 = 2 days out is allowed by the slack:
  const wed = new Date('2026-10-14T19:00:00Z');
  const rules2 = { availableWeekdays: [5], minLeadDays: 3, monthsAhead: 3 }; // Friday = today + 2
  assert.equal(validatePickupDate('2026-10-16', { pickup: rules2, now: wed }).ok, true);
});

test('the Vancouver date is used, not UTC', () => {
  // 03:00 UTC on the 15th is still the evening of the 14th in Vancouver.
  assert.equal(todayInVancouver(new Date('2026-10-15T03:00:00Z')), '2026-10-14');
  assert.equal(todayInVancouver(new Date('2026-10-15T08:00:00Z')), '2026-10-15');
});

// ------------------------------------------------------------ pure function
test('validateOrder returns a rebuilt order and never the raw input', () => {
  const r = validateOrder(order({ extra: 'ignored', items: [line({ qty: 2, evil: '<b>' })] }));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.items[0]).sort(), ['id', 'name', 'options', 'price', 'qty', 'size', 'unit']);
  assert.equal(r.total, 22);
  assert.equal('extra' in r, false);
});

test('garbage bodies are refused cleanly', () => {
  for (const bad of [null, undefined, 5, 'x', [], true]) {
    assert.equal(validateOrder(bad).ok, false);
  }
});
