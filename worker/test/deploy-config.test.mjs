// ============================================================================
//  Deploy configuration: checks worker/wrangler.toml against the rest of the
//  project, because a mistake there compiles and deploys fine and then fails
//  only for real customers.
//
//  Two real incidents are pinned here:
//    - ALLOW_ORIGIN omitted the Firebase addresses the site is also served at,
//      so customers on mercy-mills-sourdough.web.app saw "couldn't reach the
//      server" while mercymillsourdough.com worked.
//    - The KV block was left commented out, so the deployed Worker had nowhere
//      to keep orders and the Accept page refused to work.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { site } from '../../src/data/menu.js';
import worker from '../src/index.js';
import { makeEnv, sampleOrder, post, captureMail } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const toml = fs.readFileSync(path.join(ROOT, 'worker/wrangler.toml'), 'utf8');
const firebaserc = JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8'));

// Only the live (uncommented) lines count.
const live = toml
  .split('\n')
  .filter((l) => !l.trim().startsWith('#'))
  .join('\n');
const setting = (name) => new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, 'm').exec(live)?.[1];

const project = firebaserc.projects.default;
const origins = (setting('ALLOW_ORIGIN') || '').split(',').map((o) => o.trim()).filter(Boolean);

test('every address the website is served at is allowed to place orders', () => {
  const served = [
    `https://${site.domain}`,
    `https://www.${site.domain}`,
    `https://${project}.web.app`,
    `https://${project}.firebaseapp.com`,
  ];
  for (const address of served) {
    assert.ok(origins.includes(address), `ALLOW_ORIGIN is missing ${address}. Customers on that address would see "couldn't reach the server".`);
  }
});

test('ALLOW_ORIGIN is well formed: exact origins, no paths, no wildcards', () => {
  assert.ok(origins.length > 0, 'ALLOW_ORIGIN is set');
  for (const o of origins) {
    assert.match(o, /^https:\/\/[a-z0-9.-]+$/, `${o} must be https, a bare host, no trailing slash or path`);
    assert.ok(!o.includes('*'), `${o}: a wildcard would let anyone order`);
  }
  assert.equal(new Set(origins).size, origins.length, 'no duplicates');
});

test('the KV store is bound as ORDERS, with a real id', () => {
  const kv = /\[\[kv_namespaces\]\]\s*\n\s*binding\s*=\s*"([^"]+)"\s*\n\s*id\s*=\s*"([^"]+)"/.exec(live);
  assert.ok(kv, 'the [[kv_namespaces]] block is present and NOT commented out');
  assert.equal(kv[1], 'ORDERS', 'the code reads env.ORDERS, so the binding must be named exactly that');
  assert.match(kv[2], /^[0-9a-f]{32}$/, `the id must be the 32-character id from "wrangler kv namespace list" (got "${kv[2]}")`);
});

test('the mail sender and site address match the website', () => {
  assert.equal(setting('SITE_URL'), `https://${site.domain}`);
  assert.match(setting('FROM_EMAIL') || '', new RegExp(`@${site.domain.replace(/\./g, '\\.')}$`), 'FROM_EMAIL must be on the verified domain');
  assert.ok(setting('FROM_NAME'), 'FROM_NAME is set');
});

test('the Worker is named, and reachable on workers.dev', () => {
  assert.match(toml, /^name\s*=\s*"[a-z0-9-]+"/m);
  assert.match(live, /^workers_dev\s*=\s*true/m);
});

test('an order from each real address is accepted by the Worker using this very config', async () => {
  // Build the env from the file's own ALLOW_ORIGIN rather than a hand-typed one.
  const mail = captureMail();
  try {
    for (const origin of [`https://${site.domain}`, `https://${project}.web.app`, `https://${project}.firebaseapp.com`]) {
      const res = await worker.fetch(
        new Request('https://orders.example.workers.dev/api/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify(sampleOrder()),
        }),
        makeEnv({ ALLOW_ORIGIN: setting('ALLOW_ORIGIN') })
      );
      assert.equal(res.status, 200, `an order from ${origin}`);
      assert.equal(res.headers.get('access-control-allow-origin'), origin, `the browser is told it may read the answer on ${origin}`);
    }
    // ...and a stranger is still refused.
    const bad = await worker.fetch(
      new Request('https://orders.example.workers.dev/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
        body: JSON.stringify(sampleOrder()),
      }),
      makeEnv({ ALLOW_ORIGIN: setting('ALLOW_ORIGIN') })
    );
    assert.equal(bad.status, 403);
  } finally {
    mail.restore();
  }
});
