// Combat arithmetic (system 6; RB 8.4, RB 8.8, SP 7). Pure functions, no state.

export const LETTERS = ['A', 'B', 'C'];
export const BEATS = { A: 'B', B: 'C', C: 'A' }; // A beats B, B beats C, C beats A

// RB 8.4, SP 7: one exchange. D13 (explicit rule): matching letters always deal 1 to both sides.
// A winning card deals 2 only when its own data lists the losing letter in doubleAgainst.
export function abcExchange(heroLetter, monsterLetter, heroDoubles = [], monsterDoubles = []) {
  if (heroLetter === monsterLetter) return { heroDmg: 1, monsterDmg: 1 };
  if (BEATS[heroLetter] === monsterLetter) return { heroDmg: 0, monsterDmg: heroDoubles.includes(monsterLetter) ? 2 : 1 };
  return { heroDmg: monsterDoubles.includes(heroLetter) ? 2 : 1, monsterDmg: 0 };
}

// RB 8.8, SP 7: manual physical-target result entry (the original solo combat, D17).
// placement: where the die came to rest; a die partly over the inner circle but inside the outer
// circle is entered as 'outer'. face: the symbol facing up.
export const PLACEMENTS = ['inner', 'outer', 'outside', 'corner', 'corner-skull', 'unclear'];
export const FACES = ['sword', 'skull', 'other'];
export function targetThrow(placement, face) {
  if (!PLACEMENTS.includes(placement) || !FACES.includes(face)) throw new Error(`Bad target result ${placement}/${face}`);
  if (placement === 'unclear') return { rethrow: true, heroDmg: 0, monsterDmg: 0 }; // borderline: rethrow, never guess
  let monsterDmg = { inner: 2, outer: 1 }[placement] || 0;
  let heroDmg = { corner: 1, 'corner-skull': 2 }[placement] || 0;
  // Doubling multiplies damage the placement already caused; zero stays zero.
  if (face === 'sword') monsterDmg *= 2;
  if (face === 'skull') heroDmg *= 2;
  return { rethrow: false, heroDmg, monsterDmg };
}
