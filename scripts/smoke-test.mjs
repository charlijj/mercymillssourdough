#!/usr/bin/env node
// ============================================================================
//  Live smoke test for the order service.
//
//    npm run smoke                      checks only; sends no email
//    npm run smoke -- --place-order you@example.com
//                                       also places ONE real test order
//
//  Reads the Worker address from PUBLIC_ORDER_API in .env (or --api <url>).
//
//  The checks cover what can go wrong after a deploy: a missing secret or KV
//  store, a wrong CORS origin, the security headers, and that bad orders are
//  turned away.
//
//  The default run sends no email. To keep that true even against an old Worker,
//  it only sends order-shaped requests to one that reports order-API version 2
//  (the first to validate orders); against an older one it stops and says to
//  deploy first. Those requests also use an address on the reserved .invalid
//  domain, which can never receive mail.
//
//  --place-order does send two emails: the order to the bakery's inbox and a
//  copy to the address you give. Use it to prove delivery end to end, then
//  open the order email and try Accept (it asks for a code, which arrives in the
//  same inbox).
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { menu } from '../src/data/menu.js';
import { pickup } from '../src/data/pickup.js';
import { site } from '../src/data/menu.js';
import { todayInVancouver } from '../worker/src/validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? true;
};

function fromEnvFile() {
  try {
    const m = /^PUBLIC_ORDER_API\s*=\s*(.+)$/m.exec(fs.readFileSync(path.join(ROOT, '.env'), 'utf8'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

const API = String(flag('--api') || process.env.PUBLIC_ORDER_API || fromEnvFile()).replace(/\/+$/, '');
const SITE = `https://${site.domain}`;
const placeOrderTo = flag('--place-order');

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg, hint) => {
  failures++;
  console.log(`  ✗ ${msg}`);
  if (hint) console.log(`      → ${hint}`);
};
const check = (cond, pass, fail, hint) => (cond ? ok(pass) : bad(fail, hint));

if (!API) {
  console.error('No Worker address. Put PUBLIC_ORDER_API=https://…workers.dev in .env, or pass --api <url>.');
  process.exit(2);
}
if (/localhost|127\.0\.0\.1/.test(API)) {
  console.error(`PUBLIC_ORDER_API is ${API} — a local address. Real orders would never reach the bakery.`);
  process.exit(2);
}

async function call(pathname, init = {}) {
  try {
    const res = await fetch(API + pathname, { redirect: 'manual', ...init });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { res, text, json, status: res.status };
  } catch (err) {
    return { res: null, text: '', json: null, status: 0, error: err.message };
  }
}

console.log(`\nChecking ${API}\n`);

// ------------------------------------------------------------------ 1. alive
console.log('The service');
const health = await call('/');
if (health.status === 0) {
  bad(`Could not reach it (${health.error})`, 'Is the address right? Run `cd worker && npx wrangler deploy` and copy the URL it prints.');
  process.exit(1);
}
check(health.status === 200 && /running/i.test(health.text), 'It is running', `Unexpected answer (HTTP ${health.status})`);
const version = health.res.headers.get('x-mms-orders');
const hardened = Number(version) >= 2;
check(
  hardened,
  `It is the current version of the order service (API ${version})`,
  'This is an older version of the order service. It does not check orders against the menu.',
  'Deploy the latest: `cd worker && npx wrangler deploy`. Order-shaped checks are skipped until then, so this run cannot cause an email.'
);
const warning = /Warning: (.*)/.exec(health.text);
check(
  !warning,
  'Everything it needs is configured (KV store, signing secret, owner email, mail key)',
  `The Worker says: ${warning && warning[1]}`,
  'KV: `cd worker && npx wrangler kv namespace create ORDERS`, paste the id into wrangler.toml, uncomment the 3 lines, then `npx wrangler deploy`. Secrets: `npx wrangler secret put NAME`.'
);

// -------------------------------------------------------------------- 2. CORS
console.log('\nThe website can reach it');
const pre = await call('/api/order', {
  method: 'OPTIONS',
  headers: { Origin: SITE, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
});
const allowed = pre.res?.headers.get('access-control-allow-origin');
check(
  allowed === SITE || allowed === '*',
  `Allows ${SITE}`,
  `Answers with allow-origin "${allowed}", so browsers on ${SITE} will be blocked`,
  `Set ALLOW_ORIGIN = "${SITE}" in worker/wrangler.toml (comma-separate to add the www address) and redeploy.`
);
const stranger = await call('/api/order', {
  method: 'OPTIONS',
  headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
});
check(stranger.res?.headers.get('access-control-allow-origin') !== 'https://evil.example', 'Does not echo back a stranger’s site', 'It allows any origin');

// ----------------------------------------------------------- 3. rejects junk
console.log('\nIt turns away bad orders (no email is sent for any of these)');
const post = (body) =>
  call('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE }, body: JSON.stringify(body) });
const date = nextPickupDate();
// .invalid is reserved and can never receive mail.
const cust = { name: 'SMOKE TEST', email: 'smoke@mms-smoke-test.invalid' };

let r = await post({ items: [], customer: cust, pickupDate: date });
check(r.status === 400, 'An empty order is refused', `Empty order got HTTP ${r.status}`);

if (!hardened) {
  console.log('  - skipped the price, item and date checks: they would look like real orders to this older version.');
} else {

r = await post({ items: [{ id: menu[0].id, qty: 1, price: 0.01 }], customer: cust, pickupDate: date });
check(
  r.status === 409 || r.status === 400,
  'A tampered price is refused',
  `A $0.01 loaf got HTTP ${r.status} — the Worker still trusts the browser’s prices`,
  'Redeploy the Worker from the latest code: `cd worker && npx wrangler deploy`.'
);

r = await post({ items: [{ id: 'not-a-product', qty: 1, price: 5 }], customer: cust, pickupDate: date });
check(r.status === 400, 'An item that is not on the menu is refused', `Got HTTP ${r.status}`, 'Redeploy the Worker from the latest code.');

r = await post({ items: [{ id: menu[0].id, qty: 1, price: menu[0].price }], customer: cust, pickupDate: '2020-01-01' });
check(r.status === 400, 'A pickup date in the past is refused', `Got HTTP ${r.status}`, 'Redeploy the Worker from the latest code.');
}

// ------------------------------------------------------ 4. decision-page safety
console.log('\nThe Accept / Decline page is protected');
const dec = await call('/api/decide?token=not-a-real-token');
check(dec.status === 400 || dec.status === 503, 'A made-up link is refused', `Got HTTP ${dec.status}`);
const h = (n) => dec.res?.headers.get(n) || '';
check(h('referrer-policy') === 'no-referrer' && h('cache-control') === 'no-store', 'Not cached, and the link is not leaked in the Referer header', 'Missing security headers', 'Redeploy the Worker from the latest code.');
check(/frame-ancestors 'none'/.test(h('content-security-policy')) && h('x-frame-options') === 'DENY', 'Cannot be embedded in another page');
check(dec.status !== 503, 'Decisions are switched on', 'The page says it is switched off (see the warning above)');

// ---------------------------------------------------------- 5. real order, opt in
if (placeOrderTo && (!hardened || warning || failures)) {
  console.log('\nNot placing a test order: fix the problems above first, so a real order is not sent to a service that is not ready.');
} else if (placeOrderTo) {
  console.log('\nPlacing one REAL test order');
  console.log(`  This emails the bakery inbox and sends a copy to ${placeOrderTo}.`);
  const item = menu.find((p) => p.id === 'artisan-loaf') || menu[0];
  const o = await post({
    orderKey: `smoke-${Date.now().toString(36)}`,
    items: [{ id: item.id, qty: 1, price: item.price, options: Object.fromEntries((item.options || []).map((x) => [x.label, x.choices[0].label])) }],
    customer: { name: 'Smoke Test (please ignore)', email: String(placeOrderTo), phone: '000-000-0000' },
    pickupDate: date,
    notes: 'Automated smoke test — safe to decline.',
  });
  if (o.json?.success) {
    ok(`Order ${o.json.id} accepted`);
    check(o.json.customerEmail !== false, 'The customer copy was handed to the mail service', 'The customer email failed', 'Check the Resend dashboard and that FROM_EMAIL is on a verified domain.');
    console.log(`\n  Now check, by eye:\n    1. The bakery inbox has "New order from Smoke Test" (check Spam too).\n    2. ${placeOrderTo} has "We got your order".\n    3. Press Decline in the bakery email → "Email me a security code" → the code arrives → enter it.\n       The customer address should then get "Update on your order".`);
  } else {
    bad(`The order was refused (HTTP ${o.status}): ${o.json?.error || o.text.slice(0, 120)}`, o.json?.code === 'email_failed' ? 'The mail service rejected the message. Check RESEND_API_KEY and FROM_EMAIL.' : undefined);
  }
}

console.log(failures ? `\n${failures} problem${failures === 1 ? '' : 's'} found.\n` : '\nAll checks passed.\n');
process.exit(failures ? 1 : 0);

// ---------------------------------------------------------------------------
// The soonest date the calendar would offer, from the same rules the site uses.
function nextPickupDate() {
  const [y, m, d] = todayInVancouver().split('-').map(Number);
  for (let i = (pickup.minLeadDays || 0) + 2; i < 120; i++) {
    const t = new Date(Date.UTC(y, m - 1, d + i));
    if (pickup.availableWeekdays.includes(t.getUTCDay()) && !(pickup.blackoutDates || []).includes(t.toISOString().slice(0, 10))) {
      return t.toISOString().slice(0, 10);
    }
  }
  return '';
}
