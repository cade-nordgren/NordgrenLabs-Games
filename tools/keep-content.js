// Dusk Keep content kit: check, report on and add to the owner's content files. No dependencies.
// Guide: docs/content-kit/README.md. Run from the repo root:
//   node tools/keep-content.js check            every slot's count, then each error by id; exits 1 on errors
//   node tools/keep-content.js report           the content status the title screen shows
//   node tools/keep-content.js new <slot>       add a blank draft entry with the next free id (slot: room, tiles, ...)
// Add --dir <folder> to work on another folder of slot files (the tests use this).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Script } from 'node:vm';
import { CATEGORIES, loadSlots, ownerContent, contentStatus } from '../site/keep/content/schema.js';
import FIXTURES from '../site/keep/content/fixtures/fixtures.js';

const args = process.argv.slice(2);
const at = args.indexOf('--dir');
const dir = resolve(at >= 0 ? args.splice(at, 2)[1] || '' : 'site/keep/content/original');
const [cmd, slot] = args;
const fail = msg => { console.error(msg); process.exit(1); };

// Slot files are one `export default <data>;`, so a plain script parse finds the line of a syntax slip.
function where(file) {
  try {
    new Script(readFileSync(file, 'utf8').replace(/^export default/m, 'void'), { filename: file });
  } catch (err) {
    return err.stack.split(/\r?\n\s*\r?\n/)[0];
  }
  return '';
}

async function load() {
  try {
    return ownerContent(await loadSlots(pathToFileURL(dir + '/')));
  } catch (err) {
    // A typo in a file: name the file and, for a syntax slip, show the line it is on.
    const file = err.message.split(':')[0];
    const syntax = err.cause?.name === 'SyntaxError' ? where(join(dir, file)) : '';
    fail(`Could not read the content: ${err.message}${syntax ? `\n${syntax}` : ''}`);
  }
}

if (cmd === 'check' || cmd === 'report') {
  const s = contentStatus(await load(), FIXTURES);
  console.log(`Dusk Keep content ${cmd}: ${relative(process.cwd(), dir) || '.'}`);
  if (cmd === 'report') console.log(s.note);
  s.report.categories.forEach((c, i) => {
    console.log(s.lines[i]);
    if (cmd === 'check') for (const e of s.report.errors.filter(x => x.category === c.key)) console.log(`  ${e.message}`);
  });
  const n = s.report.errors.length;
  if (cmd === 'check') console.log(n ? `${n} ${n === 1 ? 'error' : 'errors'}.` : 'No errors.');
  console.log(s.start);
  console.log(s.play);
  process.exit(cmd === 'check' && n ? 1 : 0);
} else if (cmd === 'new') {
  const cat = CATEGORIES.find(c => c.key === slot || c.file === `${slot}.js`);
  if (!cat) fail(`Which slot? One of: ${CATEGORIES.map(c => c.file.slice(0, -3)).join(', ')}`);
  const file = join(dir, cat.file);
  const src = readFileSync(file, 'utf8');
  const block = src.match(/^\/\/ SKELETON START.*\n([\s\S]*?)^\/\/ SKELETON END/m);
  if (!block) fail(`${cat.file}: the SKELETON START / SKELETON END comment is missing, so there is nothing to copy.`);
  const content = await load();
  const used = new Set([content[cat.key]].flat().filter(Boolean).map(e => e.id));
  const id = cat.ids.find(x => !used.has(x));
  if (!id) fail(`${cat.file}: all ${cat.ids.length} ids are already used.`);
  let entry = block[1].replace(/^\/\/ ?/gm, '').replace(`id: '${cat.ids[0]}'`, `id: '${id}'`);
  if (cat.key === 'combat') {
    const [, set, letter] = id.split('_');
    entry = entry.replace("setId: 'S01'", `setId: '${set}'`).replace("letter: 'A'", `letter: '${letter}'`)
      .replace("owner: 'hero'", `owner: '${Number(set.slice(1)) <= 8 ? 'hero' : 'monster-group'}'`);
  }
  let out;
  if (cat.key === 'board' || cat.key === 'chamber') {
    if (!/^export default null;$/m.test(src)) fail(`${cat.file} already holds its one entry.`);
    out = src.replace(/^export default null;$/m, `export default ${entry.trimEnd()};`);
  } else {
    const end = src.lastIndexOf('];');
    if (end < 0) fail(`${cat.file}: cannot find the closing ]; of the list.`);
    out = src.slice(0, end) + entry.replace(/^(?=.)/gm, '  ') + src.slice(end);
  }
  writeFileSync(file, out);
  console.log(`Added ${id} to ${cat.file} as a draft. Fill it in, then run: node tools/keep-content.js check`);
} else {
  fail('Usage: node tools/keep-content.js check | report | new <slot>  [--dir <folder>]');
}
