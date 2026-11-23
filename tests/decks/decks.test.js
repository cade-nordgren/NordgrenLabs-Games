// Shared picture decks (site/decks): every listed deck has all its files, and the URL helpers refuse bad input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DECKS, deckOf, faceUrl, backUrl, jokerUrl } from '../../site/decks/decks.js';

const DIR = new URL('../../site/decks/', import.meta.url);
const LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const jpeg = f => { const b = readFileSync(f); return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff; };

test('every deck has 52 faces, a back and two jokers, all JPEGs, and nothing else', () => {
  assert.ok(DECKS.length >= 1);
  assert.equal(new Set(DECKS.map(d => d.id)).size, DECKS.length, 'ids are unique');
  for (const d of DECKS) {
    assert.match(d.id, /^[a-z0-9-]+$/);
    const want = [...'SHDC'].flatMap(s => LABELS.map(l => `${l}${s}.jpg`.toLowerCase())).concat('back.jpg', 'joker1.jpg', 'joker2.jpg');
    const have = readdirSync(new URL(`${d.id}/`, DIR));
    assert.deepEqual([...have].sort(), [...want].sort(), d.id);
    for (const f of have) assert.ok(jpeg(new URL(`${d.id}/${f}`, DIR)), `${d.id}/${f} is a JPEG`);
  }
});

test('every deck folder is listed', () => {
  const folders = readdirSync(DIR, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  assert.deepEqual(folders.sort(), DECKS.map(d => d.id).sort());
});

test('URL helpers: deck files under site/decks, null for anything unknown', () => {
  const id = DECKS[0].id;
  assert.match(faceUrl(id, '10', 'H'), new RegExp(`/decks/${id}/10h\\.jpg$`));
  assert.match(backUrl(id), /\/back\.jpg$/);
  assert.match(jokerUrl(id, 2), /\/joker2\.jpg$/);
  for (const bad of [[id, '1', 'H'], [id, '11', 'S'], [id, 'Q', 'X'], ['nope', 'Q', 'H'], ['classic', 'Q', 'H'], ['', 'A', 'S']])
    assert.equal(faceUrl(...bad), null, bad.join(' '));
  assert.equal(backUrl('classic'), null);
  assert.equal(jokerUrl(id, 3), null);
  assert.equal(deckOf(undefined), null);
});
