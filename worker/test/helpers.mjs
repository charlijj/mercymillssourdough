// Shared test helpers: a fake KV, a mail capture, order builders and the
// owner's decision flow. Imported by every test file in this folder.

import { createHmac } from 'node:crypto';
import worker from '../src/index.js';
import { pickup } from '../../src/data/pickup.js';
import { todayInVancouver } from '../src/validate.js';

// The soonest date the bakery would really offer: an allowed weekday, far
// enough ahead to clear the lead time, and not blacked out. Computed from the
// real pickup rules so these tests never go stale as the calendar moves on.
export function validPickupDate(extraDaysAfterLead = 2, now = new Date()) {
  const [y, m, d] = todayInVancouver(now).split('-').map(Number);
  for (let i = (pickup.minLeadDays || 0) + extraDaysAfterLead; i < 120; i++) {
    const t = new Date(Date.UTC(y, m - 1, d + i));
    const iso = t.toISOString().slice(0, 10);
    if (pickup.availableWeekdays.includes(t.getUTCDay()) && !(pickup.blackoutDates || []).includes(iso)) return iso;
  }
  throw new Error('no valid pickup date found');
}

// Mail is sent to the owner first, then the customer, so find messages by who
// they went to rather than by position.
export const mailTo = (mail, address) => mail.sent.find((m) => m.to.includes(address));
export const ownerMail = (mail) => mailTo(mail, 'mercymillsourdough@gmail.com');
export const customerMail = (mail) => mailTo(mail, 'customer@example.com');

// ---------------------------------------------------------------- fake world
export function makeKV() {
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

export function makeEnv(overrides = {}) {
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

// Captures outgoing mail instead of sending it. `fail` can be a function that
// receives each outgoing message and returns true to make Resend answer 500,
// so failure handling can be tested.
export function captureMail(opts = {}) {
  const sent = [];
  const attempts = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.resend.com')) {
      const body = JSON.parse(init.body);
      attempts.push(body);
      if (opts.fail && opts.fail(body)) {
        return new Response(JSON.stringify({ message: 'simulated outage' }), { status: 500 });
      }
      sent.push(body);
      return new Response(JSON.stringify({ id: 'msg_test' }), { status: 200 });
    }
    return real(url, init);
  };
  return {
    sent,
    attempts,
    restore() {
      globalThis.fetch = real;
    },
  };
}

export const ORIGIN = 'https://orders.example.workers.dev';

export const sampleOrder = (over = {}) => ({
  items: [
    { id: 'artisan-loaf', name: 'Artisan Regular Loaf', unit: 'loaf', price: 11, qty: 2, options: { Shape: 'Boule (round)' } },
    { id: 'bagels', name: 'Bagels', unit: '12 bagels', size: '12 bagels', price: 28, qty: 1, options: { Flavour: 'Plain' } },
  ],
  total: 50,
  lang: 'en',
  pickupDate: validPickupDate(),
  notes: 'Fraser Heights Recreation Centre, please. No nuts.',
  botcheck: false,
  customer: { name: 'Test Customer', email: 'customer@example.com', phone: '604-555-0142' },
  ...over,
});

export const post = (path, body) =>
  new Request(ORIGIN + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const postForm = (path, fields) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request(ORIGIN + path, { method: 'POST', body: fd });
};

// -------------------------------------------------------- the decision flow
export async function placeOrder(env, mail, over = {}) {
  const res = await worker.fetch(post('/api/order', sampleOrder(over)), env);
  const { id } = await res.json();
  const ownerHtml = ownerMail(mail).html;
  const links = [...ownerHtml.matchAll(/https?:\/\/[^"'\s]*\/api\/decide\?token=([^"'\s&]+)/g)].map(
    (m) => m[1]
  );
  mail.sent.length = 0; // only look at what the decision sends
  return { id, ownerHtml, acceptToken: links[0], declineToken: links[1] };
}

// Presses "Email me a security code" and reads the code out of the email
// that arrives in the owner's inbox.
export async function requestCode(env, mail, token) {
  const res = await worker.fetch(postForm('/api/decide/code', { token }), env);
  const email = mail.sent.at(-1);
  const code = email && /^(\d{6}) is your/.exec(email.subject)?.[1];
  mail.sent.length = 0;
  return { res, code, email };
}

// The whole owner path: request a code, then confirm with it.
export async function decide(env, mail, token, message = '') {
  const { code } = await requestCode(env, mail, token);
  return worker.fetch(postForm('/api/decide', { token, code, message }), env);
}

// Signs a decision token the same way the Worker does, so tests can build
// expired or legacy links.
export function sign(payloadObj, secret = 'test-signing-secret') {
  const p = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const s = createHmac('sha256', secret).update(p).digest('base64url');
  return `${p}.${s}`;
}

