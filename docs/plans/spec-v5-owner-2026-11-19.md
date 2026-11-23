# Owner specification v5 (received 2026-11-19, verified hero, combat-card, crossbow and ring data)

The owner checked their own physical cards and typed out the mechanical data for the eight heroes, the 24 hero combat cards, the two crossbows and the four magic rings. Where this file disagrees with `spec-v4-owner-2026-11-19.md`, `spec-v3-owner-2026-11-19.md`, `spec-v2-owner-2026-11-19.md` or an earlier register ruling, this file wins. Owner text is quoted verbatim in the blocks; do not reinterpret it. The 12 monster combat cards and every other card deck are still not supplied.

How each part is built, and the interpretations it needed, is in the decision register (D45 to D50) and section 13 of `dungeon-game-plan.md`. The data is in `site/keep/content/original/` (`heroes.js`, `combat.js`, `special-weapons.js`, `rings.js`), all status draft until the owner approves it.

## 1. The overriding instruction

> Preserve mechanical fidelity. Do not rebalance, modify, or invent anything.

## 2. Heroes

Heroes are identified by slot and by the stat tuple already in `heroes.js` (STR/AGI/ARM/LCK, then HP). Stats and HP are unchanged. Names and classes are the owner's own.

| Slot | STR/AGI/ARM/LCK, HP | Name | Class | Double-hit card | Starting equipment | Special weapon |
|---|---|---|---|---|---|---|
| HERO_1 | 6/4/9/4, 17 | Sir Edric Vale | Knight | A beats B for 2 | longsword, iron shield | none |
| HERO_2 | 5/5/9/5, 16 | Dame Elira Voss | Knight | A beats B for 2 | longsword, iron shield | none |
| HERO_3 | 7/5/6/5, 16 | Halvar Ironfall | Warrior | C beats A for 2 | double-bladed axe, leather shield | none |
| HERO_4 | 6/6/9/6, 15 | Brynja Stonehand | Warrior | C beats A for 2 | double-bladed axe, leather shield | none |
| HERO_5 | 3/8/5/7, 11 | Rowan Fenmark | Hunter | A beats B for 2 | crossbow, shortsword, wooden shield | crossbow (XBOW_1) |
| HERO_6 | 2/9/5/8, 10 | Mira Quickthorn | Hunter | A beats B for 2 | crossbow, shortsword, wooden shield | crossbow (XBOW_2) |
| HERO_7 | 4/7/4/8, 15 | Corin Ashveil | Warrior-Monk | B beats C for 2 | spiked club, staff | none |
| HERO_8 | 3/8/4/9, 14 | Talia Greyveil | Warrior-Monk | B beats C for 2 | war club, staff | none |

> Normal starting weapons and shields should not gain invented abilities, bonuses, or durability mechanics.

Equipment is words only, except the crossbow, which is the special weapon card. Biographies are a separate, later owner task: every hero's `text` stays empty.

## 3. Hero combat cards

Sets S01 to S08 belong to HERO_1 to HERO_8, three cards each (A, B, C). For every hero: A beats B, B beats C, C beats A; the same letter on both sides deals 1 to both; a normal win deals 1; the hero's one double-hit pairing (the table above) deals 2. In the data that is `doubleAgainst` on the winning card only.

> No hero receives another hero's combat modifiers.

The 12 monster combat cards (4 monster types x 3) are not supplied, so the combat category stands at 24 of 36.

## 4. Crossbows

XBOW_1 belongs to HERO_5 and XBOW_2 to HERO_6.

> Each crossbow starts with 4 shots. Each firing attempt consumes exactly 1 shot. Track remaining ammunition separately for each hero. Once all 4 shots are consumed, the crossbow cannot be fired again.

> During a monster encounter, the hero may choose to Shoot instead of Attack. This is a pre-combat encounter choice. Follow the existing encounter and ambush rules.

> Roll one D6 when firing: 1-3: Miss; monster takes no damage. 4-5: Roll a second D6; monster takes floor(second roll / 2) damage. 6: Monster dies immediately. If the monster survives, resolve its reaction using the Attack column of the applicable monster card.

> Do not accidentally apply the double-hit combat-card effects to crossbow damage. Do not allow unlimited ammunition. Do not invent reload mechanics. Do not modify the crossbow's probabilities or damage formula. Do not reveal hidden monster combat decisions prematurely. Preserve the existing solo and multiplayer monster HP visibility rules.

## 5. Rings

Four rings, chosen at setup by the existing ring draft: "Strength Ring", "Opening Ring", "Thunder Ring", "Protection Ring".

> Strength Ring: Allows the hero to skip one turn to gain 5 HP markers. Consumes the ring. Does not increase the Strength attribute. Do not invent additional permanent stat bonuses.

> Opening Ring: Opens one door or portcullis. Consumes the ring after use. Do not add additional unlocking abilities.

> Thunder Ring: Causes a monster to flee during a normal monster encounter. Does not protect against attacks or surprise encounters. Consumes the ring after use.

> Protection Ring: Allows the hero to ignore one trap. Consumes the ring after use. Does not provide permanent immunity to traps.

> Preserve each ring's individual identity. All rings are single-use. Use the established ring-selection rules. Do not randomly assign ring effects outside those rules. A ring must be removed from the hero's usable inventory after consumption. Do not invent additional magical properties.

## 6. Clarifications received during the build (same day)

1. Strength Ring HP: the physical card says to skip one turn and gain five HP markers and gives no maximum. If the general rules state no HP cap, allow the full five HP even above the hero's starting HP, documented as an owner interpretation; if they do, apply it and cite the section. (Checked: the 2023 rules, 3.1, say a hero starts with the HP on their hero card and dies on losing the last; no maximum is printed. So no cap.)
2. > Respect the printed timing and restrictions for each ring. Do not add universal ring-use opportunities that override those restrictions.
3. > Before finalizing its implementation, inventory which actual card effects are explicitly traps. Do not automatically include wells, portcullises, or other obstacles without evidence or an owner ruling.
4. Biography and text fields stay empty.
5. Every unresolved interpretation is flagged for the owner rather than invented.
