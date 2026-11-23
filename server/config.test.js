// Admission test for wrangler.jsonc (NL-ADR-0007 §7 evidence iii; docs/decisions/0002): no secret, only the three
// public Clerk values, one D1 binding plus the static assets binding, no paid-plan setting, and only site/ published. The Worker's refusal on any
// other CLERK_ name is tested in worker.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

const raw = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
// shortcut: strips whole-line // comments and trailing commas only, enough for this file; use a JSONC parser if it grows.
const config = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const dev = config.env.dev;
const CLERK = ['CLERK_ISSUER', 'CLERK_JWT_KEY', 'CLERK_PUBLISHABLE_KEY'];

test('no secret binding and no variable beyond the three public Clerk values', () => {
  assert.doesNotMatch(raw, /"secrets?"\s*:|secrets_store|secret_text/);
  for (const env of [config, dev]) assert.deepEqual(Object.keys(env.vars).sort(), CLERK);
  assert.doesNotMatch(raw, /SECRET|sk_live|sk_test/);
});

test('production carries the three public values; the JWT key is a usable public key', () => {
  for (const name of CLERK) assert.ok(config.vars[name].length > 0, name);
  assert.match(config.vars.CLERK_PUBLISHABLE_KEY, /^pk_live_/);
  assert.equal(config.vars.CLERK_ISSUER, 'https://clerk.nordgrenlabs.com');
  assert.equal(createPublicKey(config.vars.CLERK_JWT_KEY).asymmetricKeyType, 'rsa');
  for (const name of CLERK) assert.equal(dev.vars[name], '', name);
});

test('the authorized party is a build-time define, never a variable', () => {
  for (const env of [config, dev]) {
    for (const value of Object.values(env.vars)) assert.doesNotMatch(value, /games\.nordgrenlabs\.com|localhost/);
  }
  assert.equal(config.define.__GAMES_BUILD_MODE__, '"production"');
  assert.equal(dev.define.__GAMES_BUILD_MODE__, '"development"');
});

test('Workers, static assets and one D1 binding only, nothing that presumes a paid plan', () => {
  for (const key of ['r2_buckets', 'kv_namespaces', 'queues', 'durable_objects', 'hyperdrive', 'triggers', 'services',
    'analytics_engine_datasets', 'ai', 'vectorize', 'browser', 'workflows', 'containers', 'usage_model', 'limits',
    'placement', 'tail_consumers', 'logpush']) {
    assert.ok(!(key in config) && !(key in dev), key);
  }
  for (const env of [config, dev]) assert.deepEqual(env.d1_databases.map(d => d.binding), ['DB']);
  assert.equal(config.d1_databases[0].database_name, 'games');
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, [{ pattern: 'games.nordgrenlabs.com', custom_domain: true }]);
  assert.deepEqual(dev.routes, []);
});

test('only site/ is published, and it holds only site files', () => {
  assert.equal(config.assets.directory, './site');
  assert.equal(config.assets.binding, 'ASSETS');
  assert.equal(config.assets.run_worker_first, true); // the sign-in gate must see every request (decisions/0003)
  const files = readdirSync(new URL('../site/', import.meta.url), { recursive: true, withFileTypes: true })
    .filter(f => f.isFile()).map(f => f.name);
  // webp art and woff2 fonts for Dragon's Keep; the fonts' OFL licence texts ship beside them; jpg card art in decks/.
  for (const name of files) assert.match(name, /^([a-z0-9_-]+\.(html|css|js|png|jpg|svg|ico|webmanifest|webp|woff2)|OFL-[a-z]+\.txt|_headers)$/, name);
});
