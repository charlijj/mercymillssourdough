// ============================================================================
//  Mercy Mill Sourdough — order backend (Cloudflare Worker)
//
//  Routes:
//    POST /api/order        → receive an order; email the customer + email mom
//                             with signed Accept/Decline links.
//    GET  /api/decide       → mom opens Accept/Decline; shows the order. Sends
//                             nothing (mail scanners prefetch links).
//    POST /api/decide/code  → emails a one-time security code to OWNER_EMAIL.
//    POST /api/decide       → token + security code (+ optional message):
//                             email the customer; show mom a done page.
//    GET  /                 → health check.
//
//  Why a code as well as the signed link: the link travels inside an email,
//  and emails get replied to and forwarded with the original quoted. A signed
//  link proves only that someone *has* the email. The code goes to the owner's
//  inbox alone, so a leaked link — quoted in a reply to the customer, say —
//  cannot accept or decline anything on its own.
//
//  Secrets (set with `npx wrangler secret put NAME`):
//    RESEND_API_KEY   Resend API key (if absent, emails are logged, not sent)
//    SIGNING_SECRET   random string used to sign links and hash codes
//    OWNER_EMAIL      where orders and security codes are sent (mom's email)
//  Vars (wrangler.toml):
//    FROM_EMAIL, FROM_NAME, SITE_URL, ALLOW_ORIGIN
//  KV binding `ORDERS` — REQUIRED. Holds orders, decisions and security codes.
//  Without it the decision pages refuse to work rather than run unprotected.
// ============================================================================

import {
  customerReceived,
  ownerNewOrder,
  ownerSecurityCode,
  customerConfirmed,
  customerDeclined,
  subscriberWelcome,
  ownerNewSubscriber,
  decisionForm,
  decisionPage,
  messagePage,
} from './templates.js';
import { validateOrder } from './validate.js';

// Decision-link and security-code limits.
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // links work for 30 days
const CODE_TTL_SECONDS = 10 * 60; // a code is good for 10 minutes
const MAX_TRIES_PER_CODE = 5; // wrong guesses before a code is thrown away
const MAX_CODES_PER_ORDER = 5; // codes that can ever be sent for one order
const MAX_FAILS_PER_ORDER = 10; // wrong guesses ever, before the order locks
const RECORD_TTL_SECONDS = 60 * 60 * 24 * 30;

// Order-intake limits.
// Bump when the order API changes in a way the smoke test must know about.
const ORDER_API_VERSION = '2';
const MAX_BODY_CHARS = 20000; // a full 15-item order is under 4,000
const MAX_ORDERS_PER_IP_PER_HOUR = 10;
const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env, request);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      if (url.pathname === '/api/order' && request.method === 'POST') {
        return await handleOrder(request, env, cors);
      }
      if (url.pathname === '/api/decide' && request.method === 'GET') {
        return await handleDecideForm(url, env);
      }
      if (url.pathname === '/api/decide/code' && request.method === 'POST') {
        return await handleSendCode(request, env);
      }
      if (url.pathname === '/api/decide' && request.method === 'POST') {
        return await handleDecide(request, env);
      }
      if (url.pathname === '/api/subscribe' && request.method === 'POST') {
        return await handleSubscribe(request, env, cors);
      }
      if (url.pathname === '/') {
        const off = orderingUnavailable(env);
        const text = off
          ? `Mercy Mill Sourdough order service is running.\nWarning: ${off}`
          : 'Mercy Mill Sourdough order service is running.';
        // x-mms-orders names the generation of the order API: 2 = validates
        // orders against the menu. The smoke test refuses to send order-shaped
        // requests to a Worker that does not say so.
        return new Response(text, { headers: { 'content-type': 'text/plain', 'x-mms-orders': ORDER_API_VERSION } });
      }
      return json({ success: false, error: 'Not found' }, 404, cors);
    } catch (err) {
      console.error(err);
      return json({ success: false, error: 'Server error' }, 500, cors);
    }
  },
};

// --------------------------------------------------------------------------
// POST /api/order
// --------------------------------------------------------------------------
async function handleOrder(request, env, cors) {
  // Never accept an order we could not deliver or act on. Taking the order and
  // silently dropping the owner's email is the worst failure this service has.
  const off = orderingUnavailable(env);
  if (off) {
    console.error(`Ordering unavailable: ${off}`);
    return json(
      {
        success: false,
        code: 'unavailable',
        error: 'Ordering is temporarily unavailable. Please email us to place your order.',
      },
      503,
      cors
    );
  }

  if (!originAllowed(request, env)) {
    return json({ success: false, code: 'bad_origin', error: 'This request is not allowed.' }, 403, cors);
  }

  // Read the body with a cap so nobody can make us parse a huge payload.
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) {
    return json({ success: false, code: 'too_large', error: 'That request is too large.' }, 413, cors);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, 400, cors);
  }

  // Honeypot: bots fill hidden fields. They get a normal-looking success.
  if (data && data.botcheck) return json({ success: true }, 200, cors);

  const checked = validateOrder(data);
  if (!checked.ok) {
    return json({ success: false, code: checked.code, error: checked.error }, checked.status, cors);
  }

  // A double-click, a retry after a slow response, or "back then submit again"
  // sends the same key. Answer it with the original order instead of emailing
  // the owner a second time.
  const idemKey = /^[A-Za-z0-9_-]{8,64}$/.test(String(data.orderKey || '')) ? `idem:${data.orderKey}` : null;
  if (idemKey) {
    const prior = await env.ORDERS.get(idemKey);
    if (prior) return json({ success: true, id: prior, duplicate: true, customerEmail: true }, 200, cors);
  }

  // Per-address hourly cap, so one client cannot flood the owner's inbox.
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) {
    const bucket = `rl:${ip}:${Math.floor(Date.now() / 3600000)}`;
    const used = Number(await env.ORDERS.get(bucket)) || 0;
    if (used >= MAX_ORDERS_PER_IP_PER_HOUR) {
      return json(
        { success: false, code: 'rate_limited', error: 'Too many orders from this connection. Please try again later, or email us.' },
        429,
        cors
      );
    }
    await env.ORDERS.put(bucket, String(used + 1), { expirationTtl: 3700 });
  }

  const order = {
    id: shortId(),
    items: checked.items,
    total: checked.total,
    customer: checked.customer,
    pickupDate: checked.pickupDate,
    notes: checked.notes,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  await env.ORDERS.put(`order:${order.id}`, JSON.stringify(order), { expirationTtl: RECORD_TTL_SECONDS });
  if (idemKey) await env.ORDERS.put(idemKey, order.id, { expirationTtl: IDEMPOTENCY_TTL_SECONDS });

  const apiBase = new URL(request.url).origin;
  const exp = Date.now() + TOKEN_TTL_MS;
  const acceptUrl = `${apiBase}/api/decide?token=${await makeToken({ id: order.id, action: 'accept', order, exp }, env.SIGNING_SECRET)}`;
  const declineUrl = `${apiBase}/api/decide?token=${await makeToken({ id: order.id, action: 'decline', order, exp }, env.SIGNING_SECRET)}`;
  const siteUrl = env.SITE_URL || 'https://mercymillsourdough.com';

  // 1. The owner first. If this fails the order is lost, so the customer must
  //    be told, and nothing is left behind that looks like a live order.
  try {
    const own = ownerNewOrder(order, acceptUrl, declineUrl, siteUrl);
    // Reply goes back to the owner, never to the customer: a reply quotes the
    // whole email, Accept and Decline buttons included. The email carries its
    // own "Email the customer" button that starts a fresh, unquoted message.
    await sendEmail(env, { to: env.OWNER_EMAIL, ...own, replyTo: env.OWNER_EMAIL });
  } catch (err) {
    console.error(`Owner email failed for ${order.id}: ${err.message}`);
    await env.ORDERS.delete(`order:${order.id}`);
    if (idemKey) await env.ORDERS.delete(idemKey);
    return json(
      {
        success: false,
        code: 'email_failed',
        error: 'We could not send your order just now. Please try again in a few minutes, or email us.',
      },
      502,
      cors
    );
  }

  // 2. The customer's confirmation. The owner already has the order, so a
  //    failure here is logged and reported but does not fail the order.
  let customerEmail = true;
  try {
    await sendEmail(env, { to: checked.customer.email, ...customerReceived(order, siteUrl) });
  } catch (err) {
    customerEmail = false;
    console.error(`Customer email failed for ${order.id}: ${err.message}`);
  }

  return json({ success: true, id: order.id, customerEmail }, 200, cors);
}

// --------------------------------------------------------------------------
// Shared checks for the three decision routes
// --------------------------------------------------------------------------

// The decision pages refuse to run without the pieces that make them safe,
// rather than quietly falling back to "the link alone is enough".
function decisionsUnavailable(env) {
  if (!env.ORDERS) {
    return 'order decisions are switched off because the ORDERS storage (KV) is not connected to the Worker.';
  }
  if (!env.SIGNING_SECRET) return 'order decisions are switched off because SIGNING_SECRET is not set.';
  if (!env.OWNER_EMAIL) return 'order decisions are switched off because OWNER_EMAIL is not set.';
  return null;
}

// Everything taking an order needs: the decision checks above, plus a way to
// send mail. Local development can opt out of real mail with DRY_RUN=true.
function orderingUnavailable(env) {
  const base = decisionsUnavailable(env);
  if (base) return base.replace('order decisions are', 'ordering is');
  if (env.DRY_RUN !== 'true') {
    if (!env.RESEND_API_KEY) return 'ordering is switched off because RESEND_API_KEY is not set.';
    if (!env.FROM_EMAIL) return 'ordering is switched off because FROM_EMAIL is not set.';
  }
  return null;
}

async function readDecisionToken(token, env) {
  const p = token ? await verifyToken(token, env.SIGNING_SECRET) : null;
  if (!p || !p.order || !p.order.id || !['accept', 'decline'].includes(p.action)) return null;
  // Links issued before expiry was added carry no `exp`; they still need a
  // security code, which is the real protection.
  if (p.exp && Date.now() > Number(p.exp)) return null;
  return p;
}

const invalidLink = () =>
  html(messagePage('Invalid link', 'This confirmation link is invalid or has expired.'), 400);

const unavailable = (reason) =>
  html(messagePage('Not available', `Sorry — ${reason} Please contact the site administrator.`), 503);

const alreadyHandled = (status) =>
  html(messagePage('Already handled', `This order was already ${status}. No further email was sent.`));

const lockedPage = () =>
  html(
    messagePage(
      'Order locked',
      'Too many security codes were requested or entered for this order, so the buttons are locked to keep it safe. Please reply to the customer by email directly.'
    ),
    429
  );

// --------------------------------------------------------------------------
// GET /api/decide?token=...  → show the order and the "email me a code" step.
// Nothing is sent on GET: link scanners/prefetchers must not trigger anything.
// --------------------------------------------------------------------------
async function handleDecideForm(url, env) {
  const off = decisionsUnavailable(env);
  if (off) return unavailable(off);

  const token = url.searchParams.get('token') || '';
  const payload = await readDecisionToken(token, env);
  if (!payload) return invalidLink();

  const already = await alreadyDecided(env, payload.order.id);
  if (already) return alreadyHandled(already);

  const guard = await readGuard(env, payload.order.id);
  if (isLocked(guard)) return lockedPage();

  const siteUrl = env.SITE_URL || 'https://mercymillsourdough.com';
  return html(decisionForm(payload.action, payload.order, token, siteUrl, { step: 'send' }));
}

// --------------------------------------------------------------------------
// POST /api/decide/code  (token) → email a one-time code to OWNER_EMAIL only.
// Whoever presses the button, the code only ever goes to the owner's inbox.
// --------------------------------------------------------------------------
async function handleSendCode(request, env) {
  const off = decisionsUnavailable(env);
  if (off) return unavailable(off);

  const form = await request.formData();
  const token = String(form.get('token') || '');
  const message = String(form.get('message') || '').slice(0, 2000);

  const payload = await readDecisionToken(token, env);
  if (!payload) return invalidLink();
  const { order, action } = payload;

  const already = await alreadyDecided(env, order.id);
  if (already) return alreadyHandled(already);

  const guard = await readGuard(env, order.id);
  if (isLocked(guard) || guard.sends >= MAX_CODES_PER_ORDER) return lockedPage();

  const code = randomCode();
  await env.ORDERS.put(
    codeKey(order.id, action),
    JSON.stringify({
      h: await codeHash(env, order.id, action, code),
      exp: Date.now() + CODE_TTL_SECONDS * 1000,
      tries: 0,
    }),
    { expirationTtl: CODE_TTL_SECONDS }
  );
  guard.sends += 1;
  await writeGuard(env, order.id, guard);

  const siteUrl = env.SITE_URL || 'https://mercymillsourdough.com';
  await sendEmail(env, { to: env.OWNER_EMAIL, ...ownerSecurityCode(order, action, code, siteUrl) });

  return html(
    decisionForm(action, order, token, siteUrl, {
      step: 'code',
      message,
      notice: `We emailed a 6-digit security code to ${maskEmail(env.OWNER_EMAIL)}. It works for 10 minutes.`,
    })
  );
}

// --------------------------------------------------------------------------
// POST /api/decide  (token + code + optional message) → email the customer.
// --------------------------------------------------------------------------
async function handleDecide(request, env) {
  const off = decisionsUnavailable(env);
  if (off) return unavailable(off);

  const form = await request.formData();
  const token = String(form.get('token') || '');
  const code = String(form.get('code') || '').replace(/\s+/g, '');
  const message = String(form.get('message') || '').trim().slice(0, 2000);

  const payload = await readDecisionToken(token, env);
  if (!payload) return invalidLink();
  const { order, action } = payload;
  const siteUrl = env.SITE_URL || 'https://mercymillsourdough.com';

  // Idempotency: never decide (or email) twice.
  const already = await alreadyDecided(env, order.id);
  if (already) return alreadyHandled(already);

  const guard = await readGuard(env, order.id);
  if (isLocked(guard)) return lockedPage();

  const key = codeKey(order.id, action);
  const raw = await env.ORDERS.get(key);
  const rec = raw ? JSON.parse(raw) : null;

  if (!rec || Date.now() > rec.exp) {
    return html(
      decisionForm(action, order, token, siteUrl, {
        step: 'send',
        message,
        error: 'That security code has expired, or none has been sent yet. Send yourself a new one.',
      }),
      403
    );
  }

  const ok =
    /^\d{6}$/.test(code) && timingSafeEqual(await codeHash(env, order.id, action, code), rec.h);

  if (!ok) {
    rec.tries += 1;
    guard.fails += 1;
    await writeGuard(env, order.id, guard);
    if (isLocked(guard)) {
      await env.ORDERS.delete(key);
      return lockedPage();
    }
    if (rec.tries >= MAX_TRIES_PER_CODE) {
      await env.ORDERS.delete(key);
      return html(
        decisionForm(action, order, token, siteUrl, {
          step: 'send',
          message,
          error: 'Too many wrong tries for that code, so it has been cancelled. Send yourself a new one.',
        }),
        403
      );
    }
    const ttl = Math.max(60, Math.ceil((rec.exp - Date.now()) / 1000));
    await env.ORDERS.put(key, JSON.stringify(rec), { expirationTtl: ttl });
    const left = MAX_TRIES_PER_CODE - rec.tries;
    return html(
      decisionForm(action, order, token, siteUrl, {
        step: 'code',
        message,
        error: `That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
      }),
      403
    );
  }

  // Codes are single use.
  await env.ORDERS.delete(key);
  await markDecided(env, order, action === 'accept' ? 'accepted' : 'declined');

  const mail =
    action === 'accept'
      ? customerConfirmed(order, siteUrl, message)
      : customerDeclined(order, siteUrl, message);
  await sendEmail(env, { to: order.customer.email, ...mail });

  return html(decisionPage(action, order, siteUrl, message));
}

// Returns the existing status ("accepted"/"declined") if already handled.
async function alreadyDecided(env, orderId) {
  if (!env.ORDERS) return null;
  const raw = await env.ORDERS.get(`order:${orderId}`);
  if (!raw) return null;
  const stored = JSON.parse(raw);
  return stored.status && stored.status !== 'pending' ? stored.status : null;
}

// Records the decision. If the stored order is missing (placed before the
// storage was connected, say), the order from the signed link is written
// instead, so "never decide twice" still holds.
async function markDecided(env, order, status) {
  const raw = await env.ORDERS.get(`order:${order.id}`);
  const stored = raw ? JSON.parse(raw) : { ...order };
  stored.status = status;
  stored.decidedAt = new Date().toISOString();
  await env.ORDERS.put(`order:${order.id}`, JSON.stringify(stored), {
    expirationTtl: RECORD_TTL_SECONDS,
  });
}

// Per-order counters that cap how many codes can ever be sent and how many
// wrong guesses can ever be made. With 10 guesses at a one-in-a-million code,
// the odds of guessing in are about 1 in 100,000.
const guardKey = (orderId) => `guard:${orderId}`;
const codeKey = (orderId, action) => `code:${orderId}:${action}`;

async function readGuard(env, orderId) {
  const raw = await env.ORDERS.get(guardKey(orderId));
  const g = raw ? JSON.parse(raw) : {};
  return { sends: Number(g.sends) || 0, fails: Number(g.fails) || 0 };
}
async function writeGuard(env, orderId, guard) {
  await env.ORDERS.put(guardKey(orderId), JSON.stringify(guard), {
    expirationTtl: RECORD_TTL_SECONDS,
  });
}
const isLocked = (guard) => guard.fails >= MAX_FAILS_PER_ORDER;

// Only a keyed hash of the code is stored, bound to the order and the action,
// so a code requested for "accept" cannot be used to decline.
const codeHash = (env, orderId, action, code) =>
  hmac(env.SIGNING_SECRET, `code|${orderId}|${action}|${code}`);

// Uniform 6-digit code from the platform CSPRNG (rejection sampling avoids
// the slight bias of a plain modulo).
function randomCode() {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 1e6) * 1e6;
  let n;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return String(n % 1e6).padStart(6, '0');
}

// Shown on the decision page, which anyone holding the link can open.
function maskEmail(email) {
  const [user, domain] = String(email).split('@');
  if (!domain) return 'the bakery inbox';
  return `${user.slice(0, 1)}${'•'.repeat(Math.max(3, user.length - 1))}@${domain}`;
}

// --------------------------------------------------------------------------
// POST /api/subscribe  — newsletter signup
// --------------------------------------------------------------------------
async function handleSubscribe(request, env, cors) {
  if (!originAllowed(request, env)) {
    return json({ success: false, code: 'bad_origin', error: 'This request is not allowed.' }, 403, cors);
  }
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, 400, cors);
  }
  if (data.botcheck) return json({ success: true }, 200, cors);

  const email = String(data.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json({ success: false, error: 'Valid email required' }, 400, cors);

  const siteUrl = env.SITE_URL || 'https://mercymillsourdough.com';

  // De-duplicate with KV if available, so repeat signups don't re-email.
  let already = false;
  if (env.ORDERS) {
    already = (await env.ORDERS.get(`sub:${email}`)) !== null;
    if (!already) await env.ORDERS.put(`sub:${email}`, new Date().toISOString());
  }

  if (!already) {
    await sendEmail(env, { to: email, ...subscriberWelcome(email, siteUrl) });
    if (env.OWNER_EMAIL) {
      await sendEmail(env, { to: env.OWNER_EMAIL, ...ownerNewSubscriber(email, siteUrl) });
    }
  }
  return json({ success: true }, 200, cors);
}

// --------------------------------------------------------------------------
// Email via Resend (dry-run/log if no API key, useful for local testing)
// --------------------------------------------------------------------------
async function sendEmail(env, { to, subject, html, replyTo }) {
  if (env.DRY_RUN === 'true') {
    console.log(`[dry-run email] to=${to} subject="${subject}"`);
    return { dryRun: true };
  }
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${env.FROM_NAME || 'Mercy Mill Sourdough'} <${env.FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
    // Don't hang the customer's browser if the mail service stalls.
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

// --------------------------------------------------------------------------
// Helpers: signing, ids, responses
// --------------------------------------------------------------------------
// ALLOW_ORIGIN is the site's address, or several separated by commas (for
// example the bare domain and the www one). Unset means "anywhere", which is
// only appropriate for local development.
function allowedOrigins(env) {
  return String(env.ALLOW_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
function corsHeaders(env, request) {
  const list = allowedOrigins(env);
  const origin = request?.headers?.get('origin');
  let allow = '*';
  if (list.length) allow = origin && list.includes(origin) ? origin : list[0];
  return {
    'Access-Control-Allow-Origin': allow,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
// CORS only stops a browser from *reading* the answer; the request still
// arrives. So a browser page on some other site is refused outright. Requests
// with no Origin (curl, the smoke test) are not browsers and are let through.
function originAllowed(request, env) {
  const list = allowedOrigins(env);
  const origin = request.headers.get('origin');
  return !list.length || !origin || list.includes(origin);
}
function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...extra },
  });
}
// Every HTML page here is a decision page or follows one, and the decision
// link carries its token in the URL. So: never cached, never sent on as a
// Referer (the "back to website" link would otherwise hand the token to the
// site's host), never framed, never indexed, and forms may only post here.
function html(str, status = 200) {
  return new Response(str, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    },
  });
}
function shortId() {
  const t = Date.now().toString(36).slice(-4).toUpperCase();
  const r = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `MM-${t}${r}`;
}

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(b64) {
  b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret || ''),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  let bin = '';
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function makeToken(payloadObj, secret) {
  const payload = b64urlEncode(JSON.stringify(payloadObj));
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}
async function verifyToken(token, secret) {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(secret, payload);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    return JSON.parse(b64urlDecode(payload));
  } catch {
    return null;
  }
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
