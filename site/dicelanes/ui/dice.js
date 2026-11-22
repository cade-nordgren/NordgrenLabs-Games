// Six CSS cubes that turn to the faces rolled. Each die carries its own perspective, so none shows a side face
// because it sits off the tray's centre; once settled only the front face stays visible (no seams, no outline).
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
export function showDie(die, v, spin = 0, k = 0) {
  for (const f of die.children) f.classList.toggle('front', +f.dataset.v === v);
  const [x, y] = SHOW[v];
  const turns = still() ? 0 : spin;
  const dir = k % 2 ? -1 : 1;
  const target = `perspective(320px) rotateX(${x + 360 * turns * dir}deg) rotateY(${y + 360 * (turns + (k % 3)) * -dir}deg)`;
  if (!turns) {
    die.style.transition = 'none';
    die.style.transform = target;
    die.classList.add('settled');
    void die.offsetWidth;
    die.style.transition = '';
    return Promise.resolve();
  }
  die.classList.remove('settled');
  // Start from a plain pose each roll, so the cube always travels the full turns and lands exactly.
  die.style.transition = 'none';
  die.style.transform = `perspective(320px) rotateX(${x}deg) rotateY(${y}deg)`;
  void die.offsetWidth;
  die.style.transition = '';
  die.style.transform = target;
  // Hide the side faces only once the turn has really ended (a background tab can stall the transition).
  const settle = e => { if (e.target === die) { die.classList.add('settled'); die.removeEventListener('transitionend', settle); } };
  die.addEventListener('transitionend', settle);
  return new Promise(done => setTimeout(done, 780));
}
