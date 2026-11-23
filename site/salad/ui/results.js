// Scores: the live scoreboard sheet, round results, the final results (Crossix's counting finish, lowest wins) and
// the detailed scorecard. Counting runs once per round per device; a reload shows the end state.
import * as net from './net.js';
import { avatar, color } from './colors.js';
import { prefs, still } from './prefs.js';
import { ROUNDS, CATEGORIES, POINTS, standings } from '../engine/score.js';
import { $, el, toast, plural, listOf, ordinal, errText } from './dom.js';
import { cardName, short } from './cards.js';
import { sound } from './sound.js';

// Round scores are hidden while a round is played when the room says so, or when this device prefers it.
export const scoresHidden = g => g.phase === 'play' && (g.scoreDisplay === 'roundEnd' || prefs.scores === 'end');
export const roundPts = (g, s) => (scoresHidden(g) ? null : g.seats[s].roundScore?.points.total ?? 0);

const CAT = { tricks: ['Tricks', 'trick', '--r1'], hearts: ['Hearts', 'heart', '--r2'], queens: ['Queens', 'queen', '--r3'], kings: ['K♠︎', 'King of Spades', '--r4'], last: ['Last', 'last trick', '--r5'] };
const RULE = { tricks: '10 a trick', hearts: '10 a heart', queens: '25 a queen', kings: '100 for the K♠︎', last: '100 for the last trick', salad: 'all of them' };
const NEXT = { tricks: '10 for each trick you win.', hearts: '10 for each heart you take.', queens: '25 for each queen you take.', kings: '100 for each King of Spades you take.', last: '100 for winning the last trick.', salad: 'Every penalty at once: tricks, hearts, queens, the King of Spades and the last trick.' };
const rankOf = (totals, s) => 1 + totals.filter(t => t < totals[s]).length;
const nameOf = (v, s) => (s === v.you.seat ? 'You' : v.game.players[s].name);

// ---- Counting engine shared by round and final results (after Crossix's runReveal): columns count up one after
// another for everyone, rows re-sort (FLIP) after the columns that change totals, then the leader glows.
let token = 0, running = false;
export const stopReveals = () => { token++; running = false; };
const seen = key => { try { return sessionStorage.getItem('nl-salad-seen-' + key) === '1'; } catch { return false; } };
const markSeen = key => { try { sessionStorage.setItem('nl-salad-seen-' + key, '1'); } catch {} };
const wait = ms => new Promise(r => setTimeout(r, ms));
function tick(els, from, to, ms, fmt, live) {
  return new Promise(done => {
    const t0 = performance.now();
    const step = () => {
      if (!live()) return done();
      const p = Math.min(1, (performance.now() - t0) / ms);
      els.forEach((e, i) => { e.textContent = fmt(Math.round(from[i] + (to[i] - from[i]) * p)); });
      p < 1 ? setTimeout(step, 16) : done(); // timers, so a background tab still finishes
    };
    step();
  });
}
function place(list, rows, key, slide) {
  const before = new Map(rows.map(r => [r, r.row.getBoundingClientRect().top]));
  const sorted = [...rows].sort((a, b) => key(a) - key(b) || a.s - b.s);
  list.append(...sorted.map(r => r.row));
  const totals = rows.map(r => key(r)), bySeat = new Map(rows.map((r, i) => [r.s, totals[i]]));
  for (const r of rows) {
    const rank = 1 + rows.filter(o => bySeat.get(o.s) < bySeat.get(r.s)).length;
    r.rank.textContent = rank;
    r.rank.classList.toggle('first', rank === 1);
  }
  if (!slide || still()) return;
  for (const r of rows) {
    const dy = before.get(r) - r.row.getBoundingClientRect().top;
    if (dy) r.row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 400, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }
}

// ---- Round results
let resKey = '';
export function renderResults(v) {
  const g = v.game, h = g.history.at(-1), r = h.round, n = g.players.length, key = `${v.room.id}:${g.history.length}:${JSON.stringify(g.cut)}`;
  const cats = r === 6 ? CATEGORIES : [ROUNDS[r - 1].key];
  const prev = g.totals.map((t, s) => t - h.breakdown[s].points.total);
  $('resCap').textContent = `Round ${r} of 6 complete`;
  $('resTitle').textContent = ROUNDS[r - 1].name;
  const handed = h.breakdown.reduce((a, b) => a + b.points.total, 0);
  $('resLede').textContent = `${handed} points handed out (${RULE[ROUNDS[r - 1].key]}). Lowest total ranks first.`;
  // Host moves on; everyone else waits. The scorecard is always there.
  const host = v.room.seats[v.room.host];
  $('nextRound').hidden = !v.you.host;
  $('nextRound').textContent = `Start round ${r + 1}`;
  $('resNote').textContent = v.you.host ? `Everyone else waits for you to start round ${r + 1}.` : `Waiting for ${host.name}, the host, to start round ${r + 1}.`;
  const nextKey = ROUNDS[r].key, dealer = (g.dealer + 1) % n, leader = (dealer + 1) % n;
  const nb = $('resNext');
  nb.style.setProperty('--c', `var(--r${r + 1})`);
  const txt = el('span'); txt.style.flex = '1';
  txt.append(el('strong', '', `Next: ${ROUNDS[r].name}`), el('span', 'cap soft', ` ${NEXT[nextKey]} ${nameOf(v, dealer)} ${dealer === v.you.seat ? 'deal' : 'deals'}, ${nameOf(v, leader)} ${leader === v.you.seat ? 'lead' : 'leads'}.`));
  txt.lastChild.style.display = 'block';
  nb.replaceChildren(Object.assign(el('span', 'n', String(r + 1)), { ariaHidden: 'true' }), txt);

  if (resKey === key && (running || $('resList').childElementCount)) return; // already drawn; counting or done
  resKey = key;
  stopReveals();
  const six = r === 6;
  const head = $('resHead');
  head.style.setProperty('--n', six ? 0 : 2);
  head.hidden = six;
  head.replaceChildren(...(six ? [] : [el('span'), Object.assign(el('span', '', 'Player'), { style: 'text-align: left' }), el('span', '', CAT[cats[0]][0]), el('span', '', 'Round'), el('span', '', 'Total')]));
  const rows = g.players.map((p, s) => {
    const b = h.breakdown[s], row = el('li', 'glass rrow');
    row.style.setProperty('--n', six ? 0 : 2);
    const rank = el('span', 'rank'), who = el('span', 'who2'), line = el('span'), mv = el('span', 'mv');
    line.append(avatar(p), el('strong', '', s === v.you.seat ? `${p.name} (you)` : p.name));
    who.append(line, mv);
    const tile = (c, label) => { const t = el('span', 't'); if (c) t.style.setProperty('--c', `var(${c})`); t.setAttribute('aria-label', label); return t; };
    let cols;
    if (six) {
      // Two lines: rank, name, total; then the five categories and the round sum.
      row.style.cssText += ';display: grid; grid-template-columns: 28px minmax(0, 1fr) 66px; gap: 6px 8px';
      const tiles = cats.map(c => tile(CAT[c][2], `${CAT[c][0]}: ${b[c]}, ${b.points[c]} points`));
      const sum = tile('--r6', `Round: ${b.points.total} points`), tot = tile(null, `Total ${g.totals[s]}`);
      tot.classList.add('total');
      const eq = el('div');
      eq.style.cssText = 'grid-column: 1 / -1; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px';
      for (const t of [...tiles, sum]) { t.style.height = '40px'; t.style.fontSize = '15px'; eq.append(t); }
      const labels = el('div', 'hd6');
      labels.style.cssText = 'grid-column: 1 / -1; padding: 0';
      labels.append(...cats.map(c => el('span', '', CAT[c][0])), el('span', '', 'Round'));
      labels.setAttribute('aria-hidden', 'true');
      row.append(rank, who, tot, labels, eq);
      cols = [...cats.map((c, i) => ({ el: tiles[i], from: 0, to: b.points[c], fmt: x => (x ? `+${x}` : '0') })), { el: sum, from: 0, to: b.points.total, fmt: x => `+${x}` }, { el: tot, from: prev[s], to: g.totals[s], fmt: String, total: true }];
    } else {
      const c = cats[0], count = tile(CAT[c][2], `${plural(b[c], CAT[c][1])}`), pts = tile(CAT[c][2], `plus ${b.points.total}`), tot = tile(null, `total ${g.totals[s]}`);
      tot.classList.add('total');
      row.append(rank, who, count, pts, tot);
      cols = [{ el: count, from: 0, to: b[c], fmt: x => (c === 'last' ? (x ? 'Yes' : 'No') : String(x)) }, { el: pts, from: 0, to: b.points.total, fmt: x => `+${x}` }, { el: tot, from: prev[s], to: g.totals[s], fmt: String, total: true }];
    }
    row.setAttribute('aria-label', `${p.name}: ${b.points.total} points this round, total ${g.totals[s]}, rank ${rankOf(g.totals, s)}`);
    return { row, rank, mv, cols, s };
  });
  const moves = s => {
    const was = rankOf(prev, s), now = rankOf(g.totals, s), joint = g.totals.filter(t => t === g.totals[s]).length > 1 ? 'joint ' : '';
    if (r === 1) return `${joint ? 'Joint ' : ''}${ordinal(now)} after round 1`;
    const what = now < was ? `Up from ${ordinal(was)}` : now > was ? `Down from ${ordinal(was)}` : `Still ${joint}${ordinal(now)}`;
    return `${what} · was ${prev[s]}`;
  };
  const list = $('resList');
  const finish = () => {
    rows.forEach(x => { x.cols.forEach(c => { c.el.textContent = c.fmt(c.to); c.el.classList.remove('now', 'mute'); }); x.mv.textContent = moves(x.s); });
    place(list, rows, x => g.totals[x.s], false);
    const best = Math.min(...g.totals);
    rows.forEach(x => x.row.classList.toggle('win', g.totals[x.s] === best));
    $('resSkip').hidden = true;
    running = false;
    markSeen(key);
  };
  list.replaceChildren(...rows.map(x => x.row));
  if (seen(key) || still()) return finish();
  run(rows, list, finish, async live => {
    rows.forEach(x => { x.cols.forEach(c => { c.el.textContent = c.fmt(c.from); c.el.classList.add('mute'); }); x.mv.textContent = r === 1 ? '' : `was ${prev[x.s]}`; });
    place(list, rows, x => prev[x.s], false);
    sound('round');
    await wait(350);
    const k = rows[0].cols.length;
    for (let col = 0; col < k && live(); col++) {
      rows.forEach(x => { x.cols[col].el.classList.remove('mute'); x.cols[col].el.classList.add('now'); });
      await tick(rows.map(x => x.cols[col].el), rows.map(x => x.cols[col].from), rows.map(x => x.cols[col].to), col === k - 1 ? 900 : 600, rows[0].cols[col].fmt, live);
      if (!live()) return;
      rows.forEach(x => x.cols[col].el.classList.remove('now'));
      if (rows[0].cols[col].total) { place(list, rows, x => g.totals[x.s], true); rows.forEach(x => { x.mv.textContent = moves(x.s); }); }
      await wait(250);
    }
  });
}

// Runs a count with a Skip button and tap-anywhere; `finish` draws the end state.
function run(rows, list, finish, body) {
  const my = ++token, live = () => my === token;
  running = true;
  const skipBtn = list.id === 'resList' ? $('resSkip') : $('finSkip');
  skipBtn.hidden = false;
  const skip = () => { if (!live() || !running) return; token++; finish(); };
  skipBtn.onclick = e => { e.stopPropagation(); skip(); };
  list.onclick = skip;
  body(live).then(() => { if (live()) finish(); });
}

$('nextRound').onclick = async () => {
  $('nextRound').disabled = true;
  const r = await net.act({ type: 'NEXT_ROUND' });
  $('nextRound').disabled = false;
  if (!r.ok) toast(errText(r.error));
};

// ---- Final results: start from zero, count each round in turn, re-sort after each, then the winner glows.
let finKey = '';
export function renderFinal(v) {
  const g = v.game, key = `${v.room.id}:final:${JSON.stringify(g.cut)}:${g.totals}`;
  const st = g.standings, winners = st.winners;
  drawRematch(v);
  if (finKey === key && (running || $('finList').childElementCount)) return;
  finKey = key;
  stopReveals();
  $('finHead').replaceChildren(...ROUNDS.map(r => el('span', '', ['No Tricks', 'Hearts', 'Queens', 'K♠︎', 'Last', 'Salad'][r.n - 1])));
  const rows = g.players.map((p, s) => {
    const row = el('li', 'glass rrow'), line = el('div', 'line'), rank = el('span', 'rank'), tot = el('span', 'tot', '0'), eq = el('div', 'eq');
    line.append(rank, avatar(p), el('strong', '', s === v.you.seat ? `${p.name} (you)` : p.name), tot);
    const tiles = g.history.map((h, i) => {
      const t = el('span', 't', '0');
      t.style.setProperty('--c', `var(--r${i + 1})`);
      t.setAttribute('aria-label', `${ROUNDS[i].name}: ${h.breakdown[s].points.total}`);
      return t;
    });
    eq.append(...tiles);
    eq.setAttribute('aria-hidden', 'true');
    row.append(line, eq);
    row.setAttribute('aria-label', `${p.name}: ${g.totals[s]} points, rank ${rankOf(g.totals, s)}`);
    const pts = g.history.map(h => h.breakdown[s].points.total);
    return { row, rank, tot, tiles, pts, s, sum: 0 };
  });
  const list = $('finList'), crown = $('crown');
  const finish = () => {
    rows.forEach(x => { x.tiles.forEach((t, i) => { t.textContent = x.pts[i]; t.classList.remove('now', 'mute'); }); x.tot.textContent = g.totals[x.s]; x.sum = g.totals[x.s]; });
    place(list, rows, x => g.totals[x.s], false);
    rows.forEach(x => { const w = winners.includes(x.s); x.row.classList.toggle('win', w); x.row.classList.toggle('dim', !w); });
    [...$('finHead').children].forEach(c => c.classList.remove('on'));
    const names = winners.map(s => g.players[s].name), first = g.players[winners[0]];
    crown.textContent = winners.length > 1 ? '=' : [...first.name][0].toUpperCase();
    crown.style.background = winners.length > 1 ? 'var(--ink)' : color(first.color).hex;
    crown.style.color = winners.length > 1 ? 'var(--canvas)' : color(first.color).ink;
    $('finTitle').textContent = winners.length > 1 ? `${listOf(names)} share the win!` : `${winners[0] === v.you.seat ? 'You win' : `${names[0]} wins`}!`;
    $('finLede').textContent = `Lowest score after six rounds: ${g.totals[winners[0]]}.${winners.length > 1 ? ' Equal totals share a rank.' : ''}`;
    $('finSkip').hidden = true;
    running = false;
    if (!seen(key)) sound('win');
    markSeen(key);
  };
  list.replaceChildren(...rows.map(x => x.row));
  if (seen(key) || still()) return finish();
  run(rows, list, finish, async live => {
    rows.forEach(x => { x.tiles.forEach(t => t.classList.add('mute')); x.row.classList.remove('win', 'dim'); });
    crown.textContent = ''; crown.style.background = 'var(--fill)';
    $('finTitle').textContent = 'Final count';
    $('finLede').textContent = 'Every round in turn. Lowest total wins.';
    place(list, rows, x => x.s, false);
    rows.forEach(x => { x.rank.textContent = ''; x.rank.classList.remove('first'); });
    await wait(400);
    for (let i = 0; i < 6 && live(); i++) {
      [...$('finHead').children].forEach((c, j) => c.classList.toggle('on', j === i));
      $('finLede').textContent = `Round ${i + 1}: ${ROUNDS[i].name}`;
      rows.forEach(x => { x.tiles[i].classList.remove('mute'); x.tiles[i].classList.add('now'); });
      const from = rows.map(x => x.sum);
      await Promise.all([
        tick(rows.map(x => x.tiles[i]), rows.map(() => 0), rows.map(x => x.pts[i]), 800, String, live),
        tick(rows.map(x => x.tot), from, rows.map((x, k) => from[k] + x.pts[i]), 800, String, live),
      ]);
      if (!live()) return;
      rows.forEach(x => { x.sum += x.pts[i]; x.tiles[i].classList.remove('now'); });
      place(list, rows, x => x.sum, true);
      await wait(500);
    }
  });
}

function drawRematch(v) {
  const g = v.game, seats = v.room.seats, mine = seats[v.you.seat], ready = seats.filter(s => s.rematch);
  $('rematch').textContent = mine.rematch ? 'Not ready for a rematch' : 'Rematch';
  $('rematch').classList.toggle('primary', !mine.rematch);
  $('rematchNote').textContent = ready.length ? `Ready for a rematch: ${listOf(ready.map(s => s.name))} · ${ready.length} of ${seats.length}` : 'A rematch starts when everyone taps Rematch.';
  $('rematch').onclick = async () => {
    $('rematch').disabled = true;
    const r = await net.act({ type: 'REMATCH_READY', ready: !mine.rematch });
    $('rematch').disabled = false;
    if (!r.ok) toast(errText(r.error));
  };
  void g;
}

// ---- Live scoreboard sheet
export function openScores(v) {
  if (!v?.game) return;
  fillScores(v);
  $('scoresSheet').showModal();
}
function fillScores(v) {
  const g = v.game, hide = scoresHidden(g);
  const live = g.players.map((_, s) => g.totals[s] + (roundPts(g, s) ?? 0)), low = Math.min(...live);
  $('scoresLede').textContent = `Round ${g.round} of 6 · ${g.roundName} · ${g.phase === 'play' ? `Trick ${Math.min(g.config.tricks, g.tricksPlayed + 1)} of ${g.config.tricks}` : 'round over'} · ${hide ? 'This round hidden until it ends' : 'Live scores'} · lowest is best`;
  $('scoresBody').replaceChildren(...g.players.map((p, s) => {
    const tr = el('tr'), first = el('td'), pl = el('span', 'pl');
    pl.append(avatar(p), el('span', '', s === v.you.seat ? `${p.name} (you)` : p.name));
    first.append(pl);
    if (live[s] === low) first.append(' ', el('span', 'tag felt', 'Lowest'));
    const rp = roundPts(g, s);
    tr.append(first, el('td', '', String(g.seats[s].hand)), el('td', '', String(g.seats[s].tricks)), el('td', '', rp === null ? '–' : String(rp)), el('td', '', String(live[s])));
    if (rp === null) tr.children[3].setAttribute('aria-label', 'hidden until round end');
    return tr;
  }));
  const k = g.kitty;
  $('kittyNote').hidden = !k.count;
  $('kittyNote').textContent = !k.count ? '' : k.to === null ? `Kitty: ${plural(k.count, 'card')} face down, for the winner of trick 1.` : `Kitty: taken by ${nameOf(v, k.to)}: ${k.cards.map(short).join(' ')}.`;
  $('roundList').replaceChildren(...ROUNDS.map(r => {
    const d = el('div', 'rl' + (r.n === g.round ? ' now' : ''));
    const done = r.n < g.round || (r.n === g.round && g.phase !== 'play');
    const b = el('b', '', done ? '✓' : String(r.n));
    if (done) b.setAttribute('aria-label', 'done');
    const name = el('span', '', r.name);
    name.append(el('span', 'cap', ` · ${RULE[r.key]}`));
    name.lastChild.style.display = 'inline';
    d.append(b, name, r.n === g.round && g.phase === 'play' ? el('span', 'tag felt', 'Now') : el('span', 'cap', done ? 'Done' : ''));
    return d;
  }));
}
$('scorecardFromScores').onclick = () => { $('scoresSheet').close(); openScorecard(net.state.view); };
$('resScorecard').onclick = () => openScorecard(net.state.view);
$('finScorecard').onclick = () => openScorecard(net.state.view);

// ---- Detailed scorecard: rounds down, players across; each cell is the points and what was taken.
export function openScorecard(v) {
  if (!v?.game) return;
  const g = v.game, t = $('scTable');
  const head = el('tr');
  head.append(el('th', '', 'Round'));
  for (const [s, p] of g.players.entries()) { const th = el('th'); th.scope = 'col'; th.append(s === v.you.seat ? 'You' : p.name); head.append(th); }
  const thead = el('thead'); thead.append(head);
  const body = el('tbody');
  for (const r of ROUNDS) {
    const tr = el('tr'), h = g.history[r.n - 1];
    const th = el('td'); th.append(`${r.n}. ${r.name}`); tr.append(th);
    for (let s = 0; s < g.players.length; s++) {
      const td = el('td');
      if (h) {
        const b = h.breakdown[s], took = (r.key === 'salad' ? CATEGORIES : [r.key]).filter(c => b[c]).map(c => c === 'last' ? 'last' : `${b[c]} ${CAT[c][0].toLowerCase()}`);
        td.append(String(b.points.total), el('small', '', took.join(', ') || '–'));
      } else if (r.n === g.round && g.phase === 'play') {
        const rp = roundPts(g, s);
        td.append(rp === null ? '–' : String(rp), el('small', '', rp === null ? 'hidden' : 'so far'));
      } else td.textContent = '';
      tr.append(td);
    }
    body.append(tr);
  }
  const foot = el('tfoot'), ft = el('tr');
  ft.append(el('td', '', 'Total'));
  for (let s = 0; s < g.players.length; s++) ft.append(el('td', '', String(g.totals[s])));
  foot.append(ft);
  t.replaceChildren(thead, body, foot);
  $('scorecardSheet').showModal();
}
void POINTS; void cardName;
