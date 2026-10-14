// ============================================================================
//  Order validation.
//
//  The order comes from a browser, so nothing in it is trusted. Every line is
//  checked against the real menu (src/data/menu.js) and the real pickup rules
//  (src/data/pickup.js) — the same files the website is built from, so the two
//  cannot drift apart. Names, prices and units on the stored order always come
//  from the menu, never from the request.
//
//  validateOrder() is pure (no network, no storage) so it is easy to test.
// ============================================================================

import { menu as defaultMenu } from '../../src/data/menu.js';
import { pickup as defaultPickup } from '../../src/data/pickup.js';

export const LIMITS = {
  maxQtyPerLine: 5, // matches the 0-5 quantity dropdown
  maxLines: 30,
  maxTotalQty: 40,
  name: 100,
  email: 254,
  phone: 40,
  notes: 1000,
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const fail = (status, error, code) => ({ ok: false, status, error, code });

// Plain bounded text from untrusted input; objects and arrays become ''.
export function cleanText(v, max = 120) {
  if (v === null || v === undefined || typeof v === 'object') return '';
  return String(v).trim().slice(0, max);
}

// Today's calendar date in the bakery's timezone, as YYYY-MM-DD.
export function todayInVancouver(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// A date-only string as a UTC timestamp, or null if it is not a real date
// (so 2026-02-30 is refused rather than rolled into March).
function parseDay(str) {
  if (!DATE_RE.test(str)) return null;
  const [y, m, d] = str.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return t;
}

export function validatePickupDate(str, { pickup = defaultPickup, now = new Date() } = {}) {
  const day = parseDay(String(str || '').trim());
  if (day === null) return fail(400, 'Please choose a pickup date from the calendar.', 'bad_date');

  // Same rules as the calendar: allowed weekdays, not blacked out, and between
  // "today + minLeadDays" and "today + monthsAhead".
  //
  // The calendar works from the visitor's own date and this runs on Vancouver
  // time, so a visitor a day behind could be offered a date that is a day early
  // here. One day of slack on each end keeps us from rejecting a date the
  // calendar genuinely offered; mom still approves every order by hand.
  const todayMs = parseDay(todayInVancouver(now));
  const minMs = todayMs + Math.max(0, (pickup.minLeadDays || 0) - 1) * DAY_MS;
  const maxDate = new Date(todayMs);
  maxDate.setUTCMonth(maxDate.getUTCMonth() + (pickup.monthsAhead || 3));
  const maxMs = maxDate.getTime() + DAY_MS;

  if (day < minMs || day > maxMs) {
    return fail(400, 'That pickup date is not available. Please choose a date from the calendar.', 'bad_date');
  }
  const weekday = new Date(day).getUTCDay();
  if (!pickup.availableWeekdays.includes(weekday)) {
    return fail(400, 'Pickup is not available on that day. Please choose a date from the calendar.', 'bad_date');
  }
  if ((pickup.blackoutDates || []).includes(String(str).trim())) {
    return fail(400, 'Pickup is not available on that date. Please choose another.', 'bad_date');
  }
  return { ok: true, value: String(str).trim() };
}

// Checks one cart line against its menu entry and rebuilds it from the menu.
function resolveLine(raw, byId) {
  if (!raw || typeof raw !== 'object') return fail(400, 'Invalid item.', 'bad_item');

  const product = byId.get(String(raw.id || ''));
  if (!product) return fail(400, 'One of the items is no longer on the menu. Please refresh the page.', 'bad_item');

  const qty = Number(raw.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > LIMITS.maxQtyPerLine) {
    return fail(400, `Please order between 1 and ${LIMITS.maxQtyPerLine} of each item.`, 'bad_qty');
  }

  // Size (changes the price) — e.g. 6 or 12 bagels.
  let price = product.price;
  let unit = product.unit || '';
  let size = '';
  if (raw.size !== undefined && raw.size !== null && typeof raw.size !== 'string') {
    return fail(400, `Please choose a valid size for ${product.name}.`, 'bad_option');
  }
  if (product.sizes && product.sizes.length) {
    const asked = cleanText(raw.size);
    const chosen = asked
      ? product.sizes.find((s) => s.label === asked || s.id === asked)
      : product.sizes[0];
    if (!chosen) return fail(400, `Please choose a valid size for ${product.name}.`, 'bad_option');
    price = chosen.price;
    unit = chosen.label;
    size = chosen.label;
  } else if (raw.size) {
    return fail(400, `${product.name} does not come in sizes.`, 'bad_option');
  }

  // Options (do not change the price) — shape, flavour. Anything the customer
  // did not choose falls back to the first choice, so the owner's email always
  // says exactly what to bake.
  const sent = raw.options && typeof raw.options === 'object' && !Array.isArray(raw.options) ? raw.options : {};
  const known = new Set((product.options || []).map((o) => o.label));
  for (const key of Object.keys(sent)) {
    if (!known.has(key)) return fail(400, `Unknown option "${cleanText(key, 40)}" for ${product.name}.`, 'bad_option');
  }
  const options = {};
  for (const opt of product.options || []) {
    // Present but not a string (an object, a number…) is garbage, not "unchosen".
    if (sent[opt.label] !== undefined && sent[opt.label] !== null && typeof sent[opt.label] !== 'string') {
      return fail(400, `Please choose a valid ${opt.label.toLowerCase()} for ${product.name}.`, 'bad_option');
    }
    const asked = cleanText(sent[opt.label]);
    const choice = asked ? opt.choices.find((c) => c.label === asked || c.id === asked) : opt.choices[0];
    if (!choice) return fail(400, `Please choose a valid ${opt.label.toLowerCase()} for ${product.name}.`, 'bad_option');
    options[opt.label] = choice.label;
  }

  // The price the customer saw must be the price on the menu. A mismatch is
  // either a stale page (the menu changed since it loaded) or tampering;
  // either way the right response is to stop and ask them to reload.
  if (raw.price !== undefined && Number(raw.price) !== price) {
    return fail(409, 'Our prices have changed since this page loaded. Please refresh the page and try again.', 'price_changed');
  }

  return { ok: true, item: { id: product.id, name: product.name, unit, size, options, price, qty } };
}

export function validateOrder(data, { menu = defaultMenu, pickup = defaultPickup, now = new Date() } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(400, 'Invalid order.', 'bad_request');

  const rawItems = Array.isArray(data.items) ? data.items.filter((it) => Number(it?.qty) > 0) : [];
  if (!rawItems.length) return fail(400, 'No items selected', 'no_items');
  if (rawItems.length > LIMITS.maxLines) return fail(400, 'Too many items in one order.', 'too_many');

  const byId = new Map(menu.map((p) => [p.id, p]));
  const items = [];
  for (const raw of rawItems) {
    const r = resolveLine(raw, byId);
    if (!r.ok) return r;
    items.push(r.item);
  }
  if (items.reduce((n, it) => n + it.qty, 0) > LIMITS.maxTotalQty) {
    return fail(400, 'That is a very large order. Please email us so we can plan it with you.', 'too_many');
  }

  const name = cleanText(data.customer?.name, LIMITS.name);
  const email = cleanText(data.customer?.email, LIMITS.email + 1);
  if (!name) return fail(400, 'Name is required', 'bad_customer');
  if (email.length > LIMITS.email || !EMAIL_RE.test(email)) return fail(400, 'Valid email is required', 'bad_customer');

  const date = validatePickupDate(data.pickupDate, { pickup, now });
  if (!date.ok) return date;

  return {
    ok: true,
    items,
    // Recomputed from menu prices; the total the browser sent is ignored.
    total: items.reduce((t, it) => t + it.price * it.qty, 0),
    customer: { name, email, phone: cleanText(data.customer?.phone, LIMITS.phone) },
    pickupDate: date.value,
    notes: cleanText(data.notes, LIMITS.notes),
  };
}
