// Measures WCAG contrast for every text/mark pairing used on the Canadian Salad canvas.
const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lum = (h) => { const [r, g, b] = hex(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (fg, a, bg) => toHex(hex(fg).map((v, i) => v * a + hex(bg)[i] * (1 - a)));
console.assert(Math.abs(ratio('#000000', '#ffffff') - 21) < 0.01, 'ratio self-check');

const rows = [];
const check = (label, fg, bg, min = 4.5) => { const r = ratio(fg, bg); rows.push([r >= min ? 'ok ' : 'FAIL', r.toFixed(2), min, label, fg, bg]); };

// House UI (cream glass, Crossix/Bomb)
const cream = '#f6f3ec', glassL = over('#ffffff', 0.62, cream), black = '#000000', glassD = over('#2c2c2e', 0.6, black);
check('light ink on cream', '#1d1d1f', cream); check('light ink2 on cream', '#6e6e73', cream);
check('light ink2 on glass', '#6e6e73', glassL); check('accent text on glass', '#0071e3', glassL);
check('white on primary', '#ffffff', '#0071e3'); check('dark ink2 on glass', '#a1a1a6', glassD);
check('dark ink on glass', '#f5f5f7', glassD); check('dark accent text on glass', '#2997ff', glassD);
check('ink2 on fill (light, disabled start)', '#55555a', over('#787880', 0.13, glassL));
check('felt-green accent text on cream', '#1a6b40', cream); check('felt-green accent on glass', '#1a6b40', glassL);
check('dark felt accent #5fc08a on dark glass', '#5fc08a', glassD);
check('white on danger badge', '#ffffff', '#d70015');
check('final-row tile ink on 14% tile', '#1d1d1f', over('#1f6fd6', 0.14, '#ffffff'));
check('dark tile ink on 22% tile over #1c1c1e', '#f5f5f7', over('#2997ff', 0.22, '#1c1c1e'));

// Table themes: text on table, panel ink on table glass, card face edge vs table (3:1 mark)
const themes = {
  'Classic Green Felt': ['#1d5a39', '#27704a', '#ffffff', '#d4e8db'],
  'Dark Charcoal': ['#26282c', '#35383d', '#ffffff', '#c9ccd1'],
  'Navy Blue': ['#182a4a', '#22395f', '#ffffff', '#c8d4ea'],
  'Warm Wood': ['#5e3920', '#70452a', '#ffffff', '#efd9c4'],
  'Minimal Light': ['#e9e6df', '#f2f0ea', '#1d1d1f', '#55555a'],
  'Minimal Dark': ['#141416', '#1f1f22', '#f5f5f7', '#a8a8ad'],
  'NordgrenLabs Signature': ['#1b2040', '#262c55', '#ffffff', '#cdd2ee'],
};
for (const [n, [edge, mid, ink, ink2]] of Object.entries(themes)) {
  for (const bg of [edge, mid]) { check(n + ' ink on table ' + bg, ink, bg); check(n + ' ink2 on table ' + bg, ink2, bg); }
  const light = ink === '#1d1d1f';
  if (!light) check(n + ' white card face vs table (mark)', '#ffffff', mid, 3);
  else check(n + ' card face edge #b9b5ab vs table (mark)', '#8a867c', mid, 3);
  const pl = over('#ffffff', 0.9, mid), pd = over('#1c1c1e', 0.88, mid);
  check(n + ' light panel ink2 #5f5f64', '#5f5f64', pl); check(n + ' dark panel ink2', '#a1a1a6', pd);
}
check('felt dark-mode edge white', '#ffffff', '#123a25'); check('felt dark-mode ink2', '#c4dccc', '#123a25');

// Card faces per theme: [face, black suit, red suit, dimmed face, dimmed red, dimmed black]
const faces = {
  Classic: ['#ffffff', '#1d1d1f', '#c8102e'], 'Minimal Modern': ['#ffffff', '#111111', '#d0021b'],
  'Dark Luxury': ['#17171a', '#ece6d6', '#ff7b7b'], Vintage: ['#f3e9d2', '#2a2420', '#a3262a'],
  Nordic: ['#fbfaf7', '#2e3440', '#b3352f'], 'NordgrenLabs Signature': ['#ffffff', '#1d1d1f', '#c8102e'],
};
for (const [n, [f, b, r]] of Object.entries(faces)) { check(n + ' black suit', b, f); check(n + ' red suit', r, f); }
check('Dark Luxury gold court line (mark)', '#d4af37', '#17171a', 3);
check('unplayable card: dim face, black', '#3a3a3c', '#d7d7d2'); check('unplayable card: dim face, red', '#9e1a2c', '#d7d7d2');
check('unplayable card label ink on dim face', '#3a3a3c', '#d7d7d2');

// Player colours: ink on colour; colour as a ring/avatar vs light panel and dark panel (3:1)
const players = [['Cobalt', '#1f6fd6', '#ffffff'], ['Tangerine', '#cf6900', '#1d1d1f'], ['Forest', '#1c7f3e', '#ffffff'], ['Violet', '#9850dc', '#ffffff'],
  ['Teal', '#0c7c78', '#ffffff'], ['Rose', '#cc2f7c', '#ffffff'], ['Gold', '#b07f00', '#1d1d1f'], ['Indigo', '#6064e0', '#ffffff'],
  ['Scarlet', '#d42f3a', '#ffffff'], ['Slate', '#62738a', '#ffffff'], ['Sky', '#1f93c9', '#1d1d1f'], ['Lime', '#62970f', '#1d1d1f']];
for (const [n, c, ink] of players) {
  check('player ' + n + ' ink on colour', ink, c);
  check('player ' + n + ' vs light panel (mark)', c, over('#ffffff', 0.9, '#27704a'), 3);
  check('player ' + n + ' vs dark panel (mark)', c, over('#1c1c1e', 0.88, '#27704a'), 3);
}
// Round colours on final tiles (border marks vs white tile ground, 3:1)
for (const [n, c] of [['R1 Tricks', '#1f6fd6'], ['R2 Hearts', '#d42f3a'], ['R3 Queens', '#9046d6'], ['R4 King', '#3a3a3c'], ['R5 Last', '#c45f00'], ['R6 Salad', '#1c7f3e']]) {
  check(n + ' border vs tile ground', c, over(c, 0.14, '#ffffff'), 3);
  check(n + ' label text on cream glass', c === '#c45f00' ? '#b35500' : c, glassL);
}
check('dark R4 border #8e8e93 vs dark tile', '#8e8e93', over('#8e8e93', 0.22, '#1c1c1e'), 3);

// Extra pairs added after drawing the artboards.
check('winning ring #ffd23f vs felt centre (mark)', '#ffd23f', '#27704a', 3);
check('winning ring #ffd23f vs dark felt (mark)', '#ffd23f', '#1a4a30', 3);
check('dark card face red', '#c8102e', '#f2f2f4'); check('dark card face black', '#1d1d1f', '#f2f2f4');
check('Round6 small label #55555a on hearts tile', '#55555a', over('#d42f3a', 0.14, '#ffffff'));
check('Round6 small label #55555a on R1 tile', '#55555a', over('#1f6fd6', 0.14, '#ffffff'));
check('Round6 total small #d1d1d6 on ink', '#d1d1d6', '#1d1d1f');
check('felt-green #1a6b40 tick/toggle vs glass (mark)', '#1a6b40', glassL, 3);
check('toggle off border #8a8a8e vs glass (mark)', '#8a8a8e', glassL, 3);
check('warn text on tangerine 12% over glass', '#1d1d1f', over('#cf6900', 0.12, glassL));
check('Join found-box text on felt 10%', '#1d1d1f', over('#1a6b40', 0.10, glassL));
check('Join found-box ink2', '#55555a', over('#1a6b40', 0.10, glassL));
check('white on felt-green tag #1a6b40', '#ffffff', '#1a6b40');
check('table ink2 #5f5f64 on who-chip panel over felt', '#5f5f64', over('#ffffff', 0.9, '#1d5a39'));
for (const [n, c] of [['R1', '#3d8bf0'], ['R2', '#f0535d'], ['R3', '#b07ff0'], ['R4', '#8e8e93'], ['R5', '#f08a2c'], ['R6', '#3db86a']]) {
  const tile = over(c, 0.22, '#1c1c1e');
  check('dark final ' + n + ' tile ink', '#f5f5f7', tile);
  check('dark final ' + n + ' border vs tile (mark)', c, tile, 3);
}
for (const [n, c] of [['R1', '#1f6fd6'], ['R2', '#d42f3a'], ['R3', '#9046d6'], ['R4', '#3a3a3c'], ['R5', '#c45f00'], ['R6', '#1c7f3e']]) check('light final ' + n + ' tile ink', '#1d1d1f', over(c, 0.14, '#ffffff'));
check('dark glass ink2 on dark final', '#a1a1a6', glassD);

check('dark felt centre on2', '#c4dccc', '#1a4a30'); check('dark felt centre white', '#ffffff', '#1a4a30');
let fails = 0;
for (const r of rows) { if (r[0] !== 'ok ') fails++; console.log(r.join('  ')); }
console.log(fails ? fails + ' FAIL' : 'all pass');
