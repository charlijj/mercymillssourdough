// ============================================================================
//  End-to-end tests: a real browser, the real built site, the real Worker.
//
//    npm run test:e2e
//
//  What runs:
//    1. The Worker, in-process, behind a local HTTP server (so the browser makes
//       genuine cross-origin requests, CORS preflight included). Its KV is a Map
//       and Resend is stubbed, so mail is captured rather than sent.
//    2. The site, built into .e2e-dist with PUBLIC_ORDER_API pointing at (1).
//       It never touches ./dist, so nothing here can leak into a deploy.
//    3. Chromium, driving the page like a customer and like the owner.
//
//  Needs Playwright with a browser installed:
//    npm i -D playwright && npx playwright install chromium
//  or set E2E_CHROMIUM to the path of an existing Chromium/Chrome binary.
// ============================================================================

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import worker from '../../worker/src/index.js';
import { makeEnv, captureMail, ownerMail, customerMail } from '../../worker/test/helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, '.e2e-dist');
const OWNER = 'mercymillsourdough@gmail.com';

// ------------------------------------------------------------------ Playwright
function loadPlaywright() {
  const tries = [
    () => createRequire(path.join(ROOT, 'package.json'))('playwright'),
    () => createRequire(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), '/'))('playwright'),
  ];
  for (const t of tries) {
    try {
      return t();
    } catch {}
  }
  throw new Error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
}
const { chromium } = loadPlaywright();

// --------------------------------------------------------------------- servers
let env, mail, apiServer, siteServer, browser, SITE, API;
const apiState = { down: false, delayMs: 0 };

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

// Node request -> Fetch Request -> Worker -> Node response.
function apiHandler(req, res) {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    if (apiState.down) return req.socket.destroy(); // the Worker is unreachable
    if (apiState.delayMs) await new Promise((r) => setTimeout(r, apiState.delayMs));
    const body = Buffer.concat(chunks);
    const request = new Request(`${API}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    });
    const out = await worker.fetch(request, env);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
function siteHandler(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(OUT, p);
  if (!file.startsWith(OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

before(async () => {
  apiServer = http.createServer(apiHandler);
  siteServer = http.createServer(siteHandler);
  const [apiPort, sitePort] = [await listen(apiServer), await listen(siteServer)];
  API = `http://127.0.0.1:${apiPort}`;
  SITE = `http://127.0.0.1:${sitePort}`;

  env = makeEnv({ ALLOW_ORIGIN: SITE, SITE_URL: SITE });
  mail = captureMail();

  fs.rmSync(OUT, { recursive: true, force: true });
  execFileSync('npx', ['astro', 'build', '--outDir', OUT], {
    cwd: ROOT,
    env: { ...process.env, PUBLIC_ORDER_API: API },
    stdio: 'pipe',
  });
  assert.ok(fs.existsSync(path.join(OUT, 'index.html')), 'the site built');

  browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
});

after(async () => {
  await browser?.close();
  mail?.restore();
  apiServer?.close();
  siteServer?.close();
  fs.rmSync(OUT, { recursive: true, force: true });
});

// --------------------------------------------------------------------- helpers
async function open(width = 1280, lang = 'en') {
  mail.sent.length = 0;
  apiState.down = false;
  apiState.delayMs = 0;
  env.ORDERS.store.clear();
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(SITE, { waitUntil: 'networkidle' });
  if (lang !== 'en') {
    await page.click('#lang-toggle');
    await page.waitForFunction((l) => document.documentElement.dataset.lang === l, lang);
  }
  page.ctx = ctx;
  return page;
}

const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
const qty = (page, id, n) => card(page, id).locator('select[data-role="qty"]').selectOption(String(n));
const text = (page, sel) => page.locator(sel).innerText();

async function fillDetails(page, over = {}) {
  await page.fill('[name="name"]', over.name ?? 'Test Customer');
  await page.fill('[name="email"]', over.email ?? 'customer@example.com');
  await page.fill('[name="phone"]', over.phone ?? '604-555-0142');
  await page.fill('[name="notes"]', over.notes ?? 'Fraser Heights Recreation Centre, please.');
}
async function pickDate(page) {
  await page.locator('#pickup-cal').scrollIntoViewIfNeeded();
  await page.locator('#pickup-cal button.cal-day:not([disabled])').first().click();
}
async function fullOrder(page) {
  await qty(page, 'artisan-loaf', 2);
  await card(page, 'bagels').locator('select[data-role="size"]').selectOption('12');
  await qty(page, 'bagels', 1);
  await fillDetails(page);
  await pickDate(page);
}
// Clears the previous message first, so status() below can only ever see the
// answer to this submit and never a stale one.
const clearStatus = (page) => page.evaluate(() => {
  const el = document.getElementById('order-status');
  el.textContent = '';
  el.className = 'order-status';
});
const submit = async (page) => {
  await clearStatus(page);
  await page.click('#order-form button[type="submit"]');
};
const status = (page) => page.waitForFunction(() => /ok|err/.test(document.getElementById('order-status').className) && document.getElementById('order-status').textContent.length > 0).then(() => text(page, '#order-status'));

// =============================================================== LAYOUT TESTS
test('the header never collapses into a menu, and fits at every width', async () => {
  for (const width of [320, 390, 600, 601, 768, 1024, 1440]) {
    const page = await open(width);
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const items = [...document.querySelectorAll('.site-nav > *')].map((e) => e.getBoundingClientRect());
      return {
        burger: !!document.querySelector('.nav-burger, .nav-toggle'),
        count: items.length,
        hidden: items.filter((r) => r.width === 0 || r.height === 0).length,
        outside: items.filter((r) => r.left < -0.5 || r.right > vw + 0.5).length,
        overflow: document.documentElement.scrollWidth > vw + 1,
        fs: parseFloat(getComputedStyle(document.querySelector('.site-nav')).fontSize),
      };
    });
    assert.equal(m.burger, false, `${width}px: no hamburger`);
    assert.equal(m.count, 5, `${width}px: all five nav items exist`);
    assert.equal(m.hidden, 0, `${width}px: none hidden`);
    assert.equal(m.outside, 0, `${width}px: none off-screen`);
    assert.equal(m.overflow, false, `${width}px: no sideways scroll`);
    assert.ok(m.fs >= 9.5, `${width}px: text stays legible (${m.fs}px)`);
    await page.ctx.close();
  }
});

test('header text shrinks as the window narrows', async () => {
  const sizes = [];
  for (const width of [1280, 860, 700]) {
    const page = await open(width);
    sizes.push(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.site-nav')).fontSize)));
    await page.ctx.close();
  }
  assert.ok(sizes[0] > sizes[1] && sizes[1] > sizes[2], `nav font shrinks: ${sizes.join(' > ')}`);
});

test('every menu card has the same plain style: no badges or tags', async () => {
  const page = await open();
  const m = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#menu .card')];
    return {
      count: cards.length,
      badges: document.querySelectorAll('.card-tag').length,
      // a tag is a short label standing on its own; descriptions may say "sweet-tart"
      words: [...document.querySelectorAll('#menu .card *')].some((e) =>
        /^(bestseller|sweet|seasonal|favou?rite|熱銷|甜點|季節限定)$/i.test(e.childElementCount === 0 ? e.textContent.trim() : '')),
      structure: [...new Set(cards.map((c) => ['img', 'h3', '.card-price', 'select[data-role="qty"]'].map((s) => !!c.querySelector(s)).join()))],
    };
  });
  assert.equal(m.count, 15);
  assert.equal(m.badges, 0, 'no badge elements');
  assert.equal(m.words, false, 'no tag wording anywhere in the menu');
  assert.deepEqual(m.structure, ['true,true,true,true'], 'every card has photo, name, price and quantity');
  await page.ctx.close();
});

test('review boxes in a row are the same height, and Read more expands', async () => {
  const page = await open(1440);
  const rows = await page.evaluate(() => {
    const byTop = {};
    document.querySelectorAll('.reviews-grid .review').forEach((c) => {
      const r = c.getBoundingClientRect();
      (byTop[Math.round(r.top)] ||= []).push(Math.round(r.height));
    });
    return Object.values(byTop);
  });
  assert.equal(rows.flat().length, 8);
  for (const heights of rows) assert.equal(new Set(heights).size, 1, `a row's boxes match: ${heights}`);

  const more = page.locator('.reviews-grid .review-more:not([hidden])').first();
  assert.ok(await more.count(), 'long reviews offer Read more');
  const box = more.locator('xpath=ancestor::figure');
  const before = (await box.boundingBox()).height;
  await more.click();
  assert.ok((await box.boundingBox()).height > before, 'the box grows to show the full review');
  assert.equal(await more.getAttribute('aria-expanded'), 'true');
  await more.click();
  assert.equal(await more.getAttribute('aria-expanded'), 'false');
  await page.ctx.close();
});

test('the footer is a compact strip', async () => {
  const page = await open(1440);
  const h = await page.locator('.site-footer').evaluate((e) => e.getBoundingClientRect().height);
  assert.ok(h < 160, `footer is ${Math.round(h)}px tall`);
  await page.ctx.close();
});

// ================================================================ ORDER TESTS
test('the order form refuses an empty order and a missing date, and sends nothing', async () => {
  const page = await open();
  await fillDetails(page);
  await submit(page);
  assert.match(await status(page), /quantity for at least one item/);
  await qty(page, 'artisan-loaf', 1);
  await submit(page);
  assert.match(await status(page), /pickup date/);
  assert.equal(mail.sent.length, 0);
  await page.ctx.close();
});

test('a customer places an order: the bakery is emailed, the page resets', async () => {
  const page = await open();
  await fullOrder(page);
  assert.equal(await text(page, '#order-total-amount'), '$50');

  await submit(page);
  const msg = await status(page);
  assert.match(msg, /Thank you/);
  assert.match(msg, /MM-[A-Z0-9]{7}/, 'the order reference is shown');

  const owner = ownerMail(mail);
  assert.ok(owner, 'Mercy received the order');
  assert.match(owner.html, /Artisan Regular Loaf/);
  assert.match(owner.html, /12 bagels/);
  assert.match(owner.html, /Fraser Heights Recreation Centre/);
  assert.ok(customerMail(mail), 'the customer got a copy');

  // everything is back to a blank slate, including the parts outside the form
  assert.equal(await text(page, '#order-total-amount'), '$0');
  assert.equal(await page.locator('.card.has-qty').count(), 0, 'no card is still highlighted');
  assert.equal(await card(page, 'artisan-loaf').locator('select[data-role="qty"]').inputValue(), '0');
  assert.equal(await page.inputValue('#pickup-date'), '');
  assert.equal(await page.locator('#pickup-cal .cal-day.is-selected').count(), 0, 'the calendar forgot the day');
  assert.equal(await page.inputValue('[name="name"]'), '');
  assert.deepEqual(page.errors, []);
  await page.ctx.close();
});

test('after an order, submitting again without re-choosing does not send a duplicate', async () => {
  const page = await open();
  await fullOrder(page);
  await submit(page);
  await status(page);
  const before = mail.sent.length;

  // The browser's own required-field check stops the now-empty form outright...
  await submit(page);
  await page.waitForTimeout(300);
  assert.equal(mail.sent.length, before, 'an emptied form cannot be re-sent');

  // ...and even with the details typed back in, there is nothing left to order.
  await fillDetails(page);
  await submit(page);
  assert.match(await status(page), /quantity for at least one item/, 'the cleared order cannot be re-sent');
  assert.equal(mail.sent.length, before);
  await page.ctx.close();
});

test('double-clicking Send places one order', async () => {
  const page = await open();
  await fullOrder(page);
  apiState.delayMs = 400; // slow enough that the second click lands mid-flight
  await clearStatus(page);
  await page.locator('#order-form button[type="submit"]').dblclick();
  await status(page);
  await page.waitForTimeout(600);
  assert.equal(mail.sent.filter((m) => m.to.includes(OWNER)).length, 1, 'Mercy got exactly one email');
  await page.ctx.close();
});

test('the button is disabled while sending and back afterwards', async () => {
  const page = await open();
  await fullOrder(page);
  apiState.delayMs = 500;
  await submit(page);
  assert.equal(await page.locator('#order-form button[type="submit"]').isDisabled(), true);
  await status(page);
  assert.equal(await page.locator('#order-form button[type="submit"]').isDisabled(), false);
  await page.ctx.close();
});

test('if the connection drops the order stays on the page, and retrying sends it once', async () => {
  const page = await open();
  await fullOrder(page);
  apiState.down = true;
  await submit(page);
  const dropped = await status(page);
  assert.match(dropped, /connection to our ordering system failed/i);
  assert.ok(dropped.includes('mercymillsourdough@gmail.com'), 'with the email as a fallback');
  assert.equal(await text(page, '#order-total-amount'), '$50', 'the order is still there');
  assert.equal(mail.sent.length, 0);

  apiState.down = false;
  await submit(page);
  assert.match(await status(page), /Thank you/);
  assert.equal(mail.sent.filter((m) => m.to.includes(OWNER)).length, 1);
  await page.ctx.close();
});

test('a tampered price is refused with a clear message', async () => {
  const page = await open();
  await fullOrder(page);
  await page.evaluate(() => {
    document.querySelector('.card[data-id="artisan-loaf"]').dataset.price = '0.01';
  });
  await submit(page);
  assert.match(await status(page), /prices have changed/i);
  assert.equal(mail.sent.length, 0);
  await page.ctx.close();
});

test('the Worker being misconfigured shows the customer an email-us message', async () => {
  const page = await open();
  await fullOrder(page);
  const saved = env.OWNER_EMAIL;
  env.OWNER_EMAIL = undefined;
  try {
    await submit(page);
    assert.match(await status(page), /temporarily unavailable.*email us/i);
  } finally {
    env.OWNER_EMAIL = saved;
  }
  await page.ctx.close();
});

test('the owner email failing tells the customer instead of pretending it worked', async () => {
  const page = await open();
  mail.restore();
  const failing = captureMail({ fail: (b) => b.to.includes(OWNER) });
  try {
    await fullOrder(page);
    await submit(page);
    assert.match(await status(page), /couldn.t send your order/i);
    assert.equal(await text(page, '#order-total-amount'), '$50', 'the order is kept so they can retry');
  } finally {
    failing.restore();
    mail = captureMail();
  }
  await page.ctx.close();
});

test('the order page works in Mandarin, including the messages', async () => {
  const page = await open(1280, 'zh');
  await fillDetails(page);
  await submit(page);
  assert.match(await status(page), /請至少為一項商品選擇數量/);
  await fullOrder(page);
  await submit(page);
  assert.match(await status(page), /謝謝/);
  await page.ctx.close();
});

// ========================================================== THE OWNER'S SIDE
test('the owner accepts an order with an emailed code, and the customer is told', async () => {
  const page = await open();
  await fullOrder(page);
  await submit(page);
  await status(page);

  const link = /href="([^"]*\/api\/decide\?token=[^"]+)"/.exec(ownerMail(mail).html)[1].replace(/&amp;/g, '&');
  mail.sent.length = 0;

  const owner = await browser.newPage();
  await owner.goto(link);
  assert.match(await owner.innerText('body'), /Confirm this order/);
  assert.equal(mail.sent.length, 0, 'opening the link sends nothing');

  await owner.click('text=Email me a security code');
  await owner.waitForSelector('#code');
  const codeMail = mail.sent.find((m) => m.to.includes(OWNER));
  assert.ok(codeMail, 'the code went to the owner');
  const code = /^(\d{6})/.exec(codeMail.subject)[1];
  assert.equal(mail.sent.some((m) => m.to.includes('customer@example.com')), false, 'and not to the customer');

  // a wrong code first
  await owner.fill('#code', code === '000000' ? '111111' : '000000');
  await owner.click('button:has-text("confirm order")');
  assert.match(await owner.innerText('body'), /isn.t right/);

  await owner.fill('#code', code);
  await owner.fill('#message', 'Ready Wednesday after 3pm!');
  await owner.click('button:has-text("confirm order")');
  await owner.waitForSelector('text=Order accepted');

  const confirmed = customerMail(mail);
  assert.ok(confirmed, 'the customer was emailed');
  assert.match(confirmed.html, /Ready Wednesday after 3pm!/);

  // pressing it again does nothing
  mail.sent.length = 0;
  await owner.goto(link);
  assert.match(await owner.innerText('body'), /already/i);
  assert.equal(mail.sent.length, 0);
  await owner.close();
  await page.ctx.close();
});

test('a quoted Accept link opened by someone else cannot accept the order', async () => {
  const page = await open();
  await fullOrder(page);
  await submit(page);
  await status(page);
  const link = /href="([^"]*\/api\/decide\?token=[^"]+)"/.exec(ownerMail(mail).html)[1].replace(/&amp;/g, '&');
  mail.sent.length = 0;

  const stranger = await browser.newPage();
  await stranger.goto(link);
  await stranger.click('text=Email me a security code');
  await stranger.waitForSelector('#code');
  for (const guess of ['123456', '654321', '111111']) {
    await stranger.fill('#code', guess);
    await stranger.click('button:has-text("confirm order")');
  }
  assert.equal(mail.sent.some((m) => m.to.includes('customer@example.com')), false, 'the customer was never emailed');
  assert.equal(JSON.parse(await env.ORDERS.get([...env.ORDERS.store.keys()].find((k) => k.startsWith('order:')))).status, 'pending');
  await stranger.close();
  await page.ctx.close();
});

// ============================================ WHEN ORDERING CANNOT GO THROUGH
test('a page on an address the Worker does not allow shows a clear message with the email, and sends nothing', async () => {
  // Same site, same server, but reached as "localhost" instead of "127.0.0.1":
  // a different origin, which the Worker's allow-list (SITE only) refuses.
  mail.sent.length = 0;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(SITE.replace('127.0.0.1', 'localhost'), { waitUntil: 'networkidle' });
  await fullOrder(page);
  await submit(page);
  const msg = await status(page);
  assert.match(msg, /couldn.t send your order/i);
  assert.match(msg, /try again/i);
  assert.ok(msg.includes('mercymillsourdough@gmail.com'), `the message gives the customer another way to order: ${msg}`);
  assert.equal(mail.sent.length, 0, 'nothing was sent');
  assert.equal(await text(page, '#order-total-amount'), '$50', 'and their order is still on the page');
  await ctx.close();
});

test('once that address is allowed, the same page can order', async () => {
  const saved = env.ALLOW_ORIGIN;
  env.ALLOW_ORIGIN = `${saved},${SITE.replace('127.0.0.1', 'localhost')}`;
  try {
    mail.sent.length = 0;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(SITE.replace('127.0.0.1', 'localhost'), { waitUntil: 'networkidle' });
    await fullOrder(page);
    await submit(page);
    assert.match(await status(page), /Thank you/);
    assert.ok(ownerMail(mail), 'Mercy received it');
    await ctx.close();
  } finally {
    env.ALLOW_ORIGIN = saved;
  }
});

test('every failure message offers the email address; the ones a customer can fix do not', async () => {
  const page = await open();
  const EMAIL = 'mercymillsourdough@gmail.com';
  await fullOrder(page);

  // stuck: the customer cannot fix these, so they are given the email
  for (const [mutate, label] of [
    [() => { env.OWNER_EMAIL = undefined; }, 'service unavailable'],
  ]) {
    const saved = env.OWNER_EMAIL;
    mutate();
    await submit(page);
    assert.ok((await status(page)).includes(EMAIL), `${label} shows the email`);
    env.OWNER_EMAIL = saved;
  }

  // fixable: a stale price just needs a refresh
  await page.evaluate(() => { document.querySelector('.card[data-id="artisan-loaf"]').dataset.price = '1'; });
  await submit(page);
  const fixable = await status(page);
  assert.match(fixable, /refresh the page/i);
  assert.ok(!fixable.includes(EMAIL), 'a refreshable error does not send them away');
  await page.ctx.close();
});

test('a problem after the order is placed is never reported as a failed order', async () => {
  const page = await open();
  await fullOrder(page);
  // Make the post-order clean-up blow up. The order has already gone through.
  await page.evaluate(() => {
    const real = document.dispatchEvent.bind(document);
    document.dispatchEvent = (e) => { if (e.type === 'order:reset') throw new Error('boom'); return real(e); };
  });
  await submit(page);
  const msg = await status(page);
  assert.match(msg, /Thank you/, `still reported as a success: ${msg}`);
  assert.doesNotMatch(msg, /couldn.t/i);
  assert.equal(mail.sent.filter((m) => m.to.includes(OWNER)).length, 1, 'placed exactly once');
  await page.ctx.close();
});

test('the calendar opens on a month that has a day to pick, whatever today is', async () => {
  // Near the end of a month the next pickup day can already be in the next one.
  // The calendar must open there, not on a month of greyed-out days.
  const dates = ['2026-10-27', '2026-10-31', '2026-11-30', '2026-12-28', '2027-01-30', '2027-03-31'];
  for (const iso of dates) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date(`${iso}T20:00:00Z`) });
    await page.goto(SITE, { waitUntil: 'networkidle' });
    const open = await page.locator('#pickup-cal button.cal-day:not([disabled])').count();
    assert.ok(open > 0, `on ${iso} the calendar opens with ${open} pickable days`);
    await ctx.close();
  }
});

