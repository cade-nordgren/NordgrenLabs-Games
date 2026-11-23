// A CSS cube that turns to the face rolled (copied from Crossix). Each die carries its own perspective; once settled
// only the front face stays visible (no seams, no outline).
const PIPS = [, [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
const ORDER = [1, 6, 2, 5, 3, 4]; // matches the .face:nth-child transforms
const SHOW = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] }; // cube turn that brings each face forward
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mountDie(slot) {
  const die = document.createElement('div');
  die.className = 'die settled';
  for (const v of ORDER) {
    const f = document.createElement('div');
    f.className = 'face';
    f.dataset.v = v;
    for (let p = 0; p < 9; p++) f.append(Object.assign(document.createElement('i'), { className: PIPS[v].includes(p) ? 'pip' : '' }));
    die.append(f);
  }
  slot.append(die);
  return die;
}

// Turns a die to value v; spin > 0 adds whole turns for a roll. Resolves once it has settled.
// The die remembers its angles (die._rx, die._ry): a roll turns on from where it rests to an angle that equals the
// new face's pose modulo 360, so it never jumps to the new face before spinning and always lands square on it.
export function showDie(die, v, spin = 0, k = 0) {
  for (const f of die.children) f.classList.toggle('front', +f.dataset.v === v);
  const [x, y] = SHOW[v], my = die._t = (die._t || 0) + 1; // a newer call makes an older one's settle step a no-op
  const pose = () => `perspective(320px) rotateX(${die._rx}deg) rotateY(${die._ry}deg)`;
  if (!spin || still()) {
    die._rx = x; die._ry = y;
    die.style.transition = 'none';
    die.style.transform = pose();
    die.classList.add('settled');
    void die.offsetWidth;
    die.style.transition = '';
    return Promise.resolve();
  }
  // The angle congruent to `to` nearest `from`, then `turns` whole turns further in direction d.
  const land = (from, to, turns, d) => to + 360 * Math.round((from - to) / 360) + d * 360 * turns;
  const dir = k % 2 ? -1 : 1;
  die._rx = land(die._rx ?? x, x, spin, dir);
  die._ry = land(die._ry ?? y, y, spin + (k % 3), -dir);
  die.classList.remove('settled');
  die.style.transform = pose();
  // Side faces hide only once this turn has ended (transitionend, or a fallback if the tab stalled the transition).
  const settle = () => { if (die._t === my) die.classList.add('settled'); };
  die.addEventListener('transitionend', e => { if (e.target === die) settle(); }, { once: true });
  setTimeout(settle, 1200);
  return new Promise(done => setTimeout(done, 780));
}
