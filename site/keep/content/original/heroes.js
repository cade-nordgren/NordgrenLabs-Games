// Heroes: 8 heroes. Your own original content, never a copy of a published game's hero characters.
// How to fill this in: docs/content-kit/README.md, section "Heroes".
// Check it with:  node tools/keep-content.js check
// Add a blank entry with the next free id:  node tools/keep-content.js new heroes
//
// SKELETON START (a commented-out entry showing every field; copy it below, remove the // marks, fill it in)
// {
//   id: 'HERO_1',                 // a free id from HERO_1 to HERO_8
//   copies: 1,                    // how many identical copies of this one face are in the deck
//   status: 'draft',              // 'draft' while you work on it, 'approved' when it is final
//   name: '',                     // your own name for it
//   text: '',                     // optional: your own wording, shown in the game instead of the summary
//   notes: '',                    // optional: notes to yourself, never shown
//   class: '',                    // your own class word, for example a job or calling
//   stats: { STR: 5, AGI: 5, ARM: 5, LCK: 5 }, // strength, agility, armour, luck: whole numbers 1 to 12
//   hp: 10,                       // starting hit points, 1 or more
//   equipment: [],                // words for what they carry, for example ['rope']
//   combatSetId: 'S01',           // their hero combat set: 'S01' to 'S08'
//   specialWeaponId: null,        // null, or 'XBOW_1' | 'XBOW_2' if this hero has a special weapon card
//   art: null,                    // later: a picture file, or null
// },
// SKELETON END

export default [
  { id: 'HERO_1', copies: 1, status: 'draft', name: 'Sir Edric Vale', text: '',
    notes: 'Owner-verified from their own physical cards, 2026-11-19 (spec v5): stats, HP, name, class, starting equipment, combat set S01 (card A beats B for 2), no special weapon. Equipment is words only. Biography not written yet (a separate owner task). Draft until the owner approves.',
    class: 'Knight', stats: { STR: 6, AGI: 4, ARM: 9, LCK: 4 }, hp: 17, equipment: ['longsword', 'iron shield'], combatSetId: 'S01', specialWeaponId: null, art: null },
  { id: 'HERO_2', copies: 1, status: 'draft', name: 'Dame Elira Voss', text: '',
    notes: 'Owner-verified from their own physical cards, 2026-11-19 (spec v5): stats, HP, name, class, starting equipment, combat set S02 (card A beats B for 2), no special weapon. Equipment is words only. Biography not written yet (a separate owner task). Draft until the owner approves.',
    class: 'Knight', stats: { STR: 5, AGI: 5, ARM: 9, LCK: 5 }, hp: 16, equipment: ['longsword', 'iron shield'], combatSetId: 'S02', specialWeaponId: null, art: null },
  { id: 'HERO_3', copies: 1, status: 'draft', name: 'Halvar Ironfall', text: '',
    notes: 'Owner-verified from their own physical cards, 2026-11-19 (spec v5): stats, HP, name, class, starting equipment, combat set S03 (card C beats A for 2), no special weapon. Equipment is words only. Biography not written yet (a separate owner task). Draft until the owner approves.',
    class: 'Warrior', stats: { STR: 7, AGI: 5, ARM: 6, LCK: 5 }, hp: 16, equipment: ['double-bladed axe', 'leather shield'], combatSetId: 'S03', specialWeaponId: null, art: null },
  { id: 'HERO_4', copies: 1, status: 'draft', name: 'Brynja Stonehand', text: '',
    notes: 'Owner-verified from their own physical cards, 2026-11-19 (spec v5): stats, HP, name, class, starting equipment, combat set S04 (card C beats A for 2), no special weapon. Equipment is words only. Biography not written yet (a separate owner task). Draft until the owner approves.',
    class: 'Warrior', stats: { STR: 6, AGI: 6, ARM: 9, LCK: 6 }, hp: 15, equipment: ['double-bladed axe', 'leather shield'], combatSetId: 'S04', specialWeaponId: null, art: null },
  { id: 'HERO_5', copies: 1, status: 'draft', name: 'Rowan Fenmark', text: '',
    notes: 'Owner-verified from their own physical cards, 2026-11-19 (spec v5): stats, HP, name, class, starting equipment, combat set S05 (card A beats B for 2), special weapon XBOW_1. Equipment is words only. Biography not written yet (a separate owner task). Draft until the owner approves.',
    class: 'Hunter', stats: { STR: 3, AGI: 8, ARM: 5, LCK: 7 }, hp: 11, equipment: ['crossbow', 'shortsword', 'wooden shield'], combatSetId: 'S05', specialWeaponId: 'XBOW_1', art: null },
  { id: 'HERO_6', copies: 1, status: 'draft', name: 'Mira Quickthorn', text: '',
    notes: 'Owner-verified from their own physical cards, 2026-11-19 (spec v5): stats, HP, name, class, starting equipment, combat set S06 (card A beats B for 2), special weapon XBOW_2. Equipment is words only. Biography not written yet (a separate owner task). Draft until the owner approves.',
    class: 'Hunter', stats: { STR: 2, AGI: 9, ARM: 5, LCK: 8 }, hp: 10, equipment: ['crossbow', 'shortsword', 'wooden shield'], combatSetId: 'S06', specialWeaponId: 'XBOW_2', art: null },
  { id: 'HERO_7', copies: 1, status: 'draft', name: 'Corin Ashveil', text: '',
    notes: 'Owner-verified from their own physical cards, 2026-11-19 (spec v5): stats, HP, name, class, starting equipment, combat set S07 (card B beats C for 2), no special weapon. Equipment is words only. Biography not written yet (a separate owner task). Draft until the owner approves.',
    class: 'Warrior-Monk', stats: { STR: 4, AGI: 7, ARM: 4, LCK: 8 }, hp: 15, equipment: ['spiked club', 'staff'], combatSetId: 'S07', specialWeaponId: null, art: null },
  { id: 'HERO_8', copies: 1, status: 'draft', name: 'Talia Greyveil', text: '',
    notes: 'Owner-verified from their own physical cards, 2026-11-19 (spec v5): stats, HP, name, class, starting equipment, combat set S08 (card B beats C for 2), no special weapon. Equipment is words only. Biography not written yet (a separate owner task). Draft until the owner approves.',
    class: 'Warrior-Monk', stats: { STR: 3, AGI: 8, ARM: 4, LCK: 9 }, hp: 14, equipment: ['war club', 'staff'], combatSetId: 'S08', specialWeaponId: null, art: null },
];
