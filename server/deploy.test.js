// Admission test for the deployment files (NL-ADR-0007 §7 evidence iii): they can name or mount no Clerk secret,
// and nothing that belongs to another NordgrenLabs app. The refusal to start on such a name is tested in server.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// shortcut: text matching instead of a YAML parser, enough for one small service; parse it if the file grows.
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8').replace(/#.*/g, '');
const compose = read('docker-compose.prod.yml');
const ALLOWED = ['CLERK_PUBLISHABLE_KEY', 'CLERK_JWT_KEY', 'CLERK_ISSUER'];

test('deployment files name no Clerk variable beyond the three public ones', () => {
  for (const text of [compose, read('Dockerfile')]) {
    for (const name of text.match(/CLERK_[A-Z0-9_]*/g) ?? []) assert.ok(ALLOWED.includes(name), name);
  }
});

test('the Compose file reads only the Games config directory', () => {
  const hostPaths = compose.match(/(?<![\w.:])\/[\w./-]+/g) ?? [];
  assert.ok(hostPaths.includes('/etc/nordgren-labs/games/games.env'));
  for (const p of hostPaths.filter(p => p.startsWith('/etc') || p.startsWith('/home') || p.startsWith('/var'))) {
    assert.ok(p.startsWith('/etc/nordgren-labs/games/'), p);
  }
  assert.doesNotMatch(compose, /control-center|ridelab|ascend|secrets/i);
  assert.doesNotMatch(compose, /^\s*environment:/m); // configuration arrives through the one env file only
});

test('the Compose file publishes the service on loopback only', () => {
  const ports = compose.match(/"[\d.:]+:\d+"/g) ?? [];
  assert.equal(ports.length, 1);
  assert.match(ports[0], /^"127\.0\.0\.1:\d+:3000"$/);
});
