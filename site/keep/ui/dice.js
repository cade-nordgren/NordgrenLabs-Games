// Dice on screen: Bank's CSS cubes (site/bank/index.html, "On-screen dice"), numbered for a D12 or D6. They
// only present a roll the engine already made from its seeded generator; nothing here picks a number.
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const LAND = 950; // ms, Bank's .9s turn plus a beat

// One cube whose front face shows value (a number, or '?' before a roll). The other faces show other numbers of
// the die only so the tumble reads as a die; they are fixed, not drawn.
function cube(value, sides) {
  const d = document.createElement('div');
  d.className = 'cube';
  for (let k = 0; k < 6; k++) {
    const f = document.createElement('div');
    f.className = 'face';
    f.textContent = k === 0 || !Number.isInteger(value) ? value : ((value - 1 + 5 * k) % sides) + 1;
    d.append(f);
  }
  return d;
}

// Draws dice into host: items [{ value, label?, sides? }], each a cube with an optional caption. With animate, each cube
// tumbles from a tilt and lands on its value (skipped under reduced motion). Resolves once they have landed.
export function rollDice(host, items, { sides = 12, animate = true } = {}) {
  const row = document.createElement('div');
  row.className = 'dice';
  row.setAttribute('aria-hidden', 'true'); // the result is said in words (#said and the card text)
  const cubes = items.map(({ value, label, sides: n }) => {
    const fig = document.createElement('figure'), d = cube(value, n || sides);
    fig.append(d);
    if (label) fig.append(Object.assign(document.createElement('figcaption'), { textContent: label }));
    row.append(fig);
    return d;
  });
  host.replaceChildren(row);
  if (!animate || still()) return Promise.resolve();
  cubes.forEach((d, i) => {
    d.style.transition = 'none';
    d.style.transform = `rotateX(${-720 - 50 * i}deg) rotateY(${540 + 70 * i}deg)`;
  });
  row.getBoundingClientRect(); // lay out the tilt first, so the turn below is transitioned from it
  for (const d of cubes) { d.style.transition = ''; d.style.transform = 'rotateX(0deg) rotateY(0deg)'; }
  return new Promise(done => setTimeout(done, LAND));
}
