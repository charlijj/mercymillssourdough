// ============================================================================
//  Mercy Mills Sourdough — order backend (Cloudflare Worker)
//
//  Routes:
//    POST /api/order   → receive an order; email the customer + email mom with
//                        signed Accept/Decline links.
//    GET  /api/decide  → mom clicks Accept/Decline; email the customer the
//                        confirmation/decline; show mom a done page.
//    GET  /            → health check.
//
//  Secrets (set with `npx wrangler secret put NAME`):
//    RESEND_API_KEY   Resend API key (if absent, emails are logged, not sent)
//    SIGNING_SECRET   random string used to sign the decision links
//    OWNER_EMAIL      where orders are sent (mom's email)
//  Vars (wrangler.toml):
//    FROM_EMAIL, FROM_NAME, SITE_URL, ALLOW_ORIGIN
//  Optional KV binding `ORDERS` for record-keeping + idempotency.
// ============================================================================

import {
  customerReceived,
  ownerNewOrder,
  customerConfirmed,
  customerDeclined,
  decisionPage,
  messagePage,
} from './templates.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      if (url.pathname === '/api/order' && request.method === 'POST') {
        return await handleOrder(request, env, cors);
      }
      if (url.pathname === '/api/decide' && request.method === 'GET') {
        return await handleDecide(url, env);
      }
      if (url.pathname === '/') {
        return new Response('Mercy Mills Sourdough order service is running.', {
          headers: { 'content-type': 'text/plain' },
        });
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
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, 400, cors);
  }

  // Honeypot: bots fill hidden fields.
  if (data.botcheck) return json({ success: true }, 200, cors);

  const items = Array.isArray(data.items)
    ? data.items.filter((it) => Number(it.qty) > 0)
    : [];
  const email = String(data.customer?.email || '').trim();
  const name = String(data.customer?.name || '').trim();

  if (!items.length) return json({ success: false, error: 'No items selected' }, 400, cors);
  if (!name) return json({ success: false, error: 'Name is required' }, 400, cors);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json({ success: false, error: 'Valid email is required' }, 400, cors);

  const total = items.reduce((t, it) => t + Number(it.price) * Number(it.qty), 0);

  const order = {
    id: shortId(),
    items: items.map((it) => ({
      id: String(it.id || ''),
      name: String(it.name || 'Item'),
      unit: String(it.unit || ''),
      price: Number(it.price) || 0,
      qty: Number(it.qty) || 0,
    })),
    total,
    customer: {
      name,
      email,
      phone: String(data.customer?.phone || '').trim(),
    },
    pickupDate: String(data.pickupDate || '').trim(),
    notes: String(data.notes || '').trim(),
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  // Optional record for idempotency + history.
  if (env.ORDERS) {
    await env.ORDERS.put(`order:${order.id}`, JSON.stringify(order), {
      expirationTtl: 60 * 60 * 24 * 30, // 30 days
    });
  }

  const apiBase = new URL(request.url).origin;
  const acceptUrl = `${apiBase}/api/decide?token=${await makeToken({ id: order.id, action: 'accept', order }, env.SIGNING_SECRET)}`;
  const declineUrl = `${apiBase}/api/decide?token=${await makeToken({ id: order.id, action: 'decline', order }, env.SIGNING_SECRET)}`;

  const siteUrl = env.SITE_URL || 'https://mercymillsourdough.com';
  const ownerEmail = env.OWNER_EMAIL;

  // Email the customer + the owner.
  const cust = customerReceived(order, siteUrl);
  await sendEmail(env, { to: email, ...cust });

  if (ownerEmail) {
    const own = ownerNewOrder(order, acceptUrl, declineUrl, siteUrl);
    await sendEmail(env, { to: ownerEmail, ...own });
  } else {
    console.warn('OWNER_EMAIL not set — owner notification skipped.');
  }

  return json({ success: true, id: order.id }, 200, cors);
}

// --------------------------------------------------------------------------
// GET /api/decide?token=...
// --------------------------------------------------------------------------
async function handleDecide(url, env) {
  const token = url.searchParams.get('token');
  const payload = token ? await verifyToken(token, env.SIGNING_SECRET) : null;
  if (!payload || !payload.order || !['accept', 'decline'].includes(payload.action)) {
    return html(messagePage('Invalid link', 'This confirmation link is invalid or has expired.'), 400);
  }

  const siteUrl = env.SITE_URL || 'https://mercymillsourdough.com';
  const order = payload.order;

  // Idempotency: if we have a store and it's already decided, don't re-email.
  if (env.ORDERS) {
    const raw = await env.ORDERS.get(`order:${order.id}`);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored.status && stored.status !== 'pending') {
        return html(
          messagePage(
            'Already handled',
            `This order was already ${stored.status}. No further email was sent.`
          )
        );
      }
      stored.status = payload.action === 'accept' ? 'accepted' : 'declined';
      await env.ORDERS.put(`order:${order.id}`, JSON.stringify(stored), {
        expirationTtl: 60 * 60 * 24 * 30,
      });
    }
  }

  const mail =
    payload.action === 'accept'
      ? customerConfirmed(order, siteUrl)
      : customerDeclined(order, siteUrl);
  await sendEmail(env, { to: order.customer.email, ...mail });

  return html(decisionPage(payload.action, order, siteUrl));
}

// --------------------------------------------------------------------------
// Email via Resend (dry-run/log if no API key, useful for local testing)
// --------------------------------------------------------------------------
async function sendEmail(env, { to, subject, html, replyTo }) {
  if (!env.RESEND_API_KEY) {
    console.log(`[dry-run email] to=${to} subject="${subject}"`);
    return { dryRun: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${env.FROM_NAME || 'Mercy Mills Sourdough'} <${env.FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

// --------------------------------------------------------------------------
// Helpers: signing, ids, responses
// --------------------------------------------------------------------------
function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...extra },
  });
}
function html(str, status = 200) {
  return new Response(str, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
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
