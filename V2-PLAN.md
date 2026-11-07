# The Trump Force: v2 plan

v2 takes the game from 10 to **30 levels** across three worlds and adds more Trump-themed set pieces and power-ups. It stays a single static `game.js` with no image or audio assets. It is built on branch `v2`, and nothing is pushed or deployed until the user says "go live".

## Worlds

| World | Levels | Name |
|---|---|---|
| 1 | 1–10 | Drain the Swamp |
| 2 | 11–20 | The Comeback Tour |
| 3 | 21–30 | Swamp Strikes Back |

## World 2: The Comeback Tour

| Level | Name | Theme | Boss |
|---|---|---|---|
| 11 | Hole in One | golf | |
| 12 | The Golden Escalator | tower | |
| 13 | Big Beautiful Wall | wall | |
| 14 | Fake News Network | studio | Fake News Anchorbot |
| 15 | Boardwalk Empire State | casino | |
| 16 | Rally Round the Flag | rally | |
| 17 | Eighteen Holes of Doom | golf | |
| 18 | Deep State Basement | bunker | The Deep State Agent |
| 19 | The Nexico Wall Deal | wall | The Generalissimo of Nexico (fictional) |
| 20 | Tower of Power | tower | Obama rematch ("Obama 2: The Sequel") |

## World 3: Swamp Strikes Back

| Level | Name | Theme | Boss |
|---|---|---|---|
| 21 | Sewer Rats | sewer | |
| 22 | Kraken the Code | sewer | Swamp Kraken |
| 23 | Space Force Academy | space | |
| 24 | Fly Me to the Moon | moon (low gravity) | |
| 25 | Rushmore or Less | rushmore | |
| 26 | Lawn Order | whitehouse | Harris rematch |
| 27 | Casino Royale with Cheese | casino | |
| 28 | Breaking More News | studio | |
| 29 | The Swamp Throne | final | |
| 30 | Swamp Emperor | final | Swamp Emperor mech, with Biden and Harris in the cockpit |

## New Trump elements
- **Power-ups**
  - **MAGA cap**: 8 seconds of gold invincibility plus double fire rate.
  - **Diet Coke**: a speed and jump boost.
  - **Big Beautiful Wall**: raises a steel wall in front of you.
  - **TARIFF!**: every enemy on screen stops firing for a while.
  - **Gold bars**: score.
- **Set pieces**
  - Golf flags and sand traps.
  - The golden escalator at the level start in tower levels.
  - Wall-building cranes.
  - Crowds holding signs at rallies.
  - TV screens showing "FAKE NEWS".
  - Gold toilets.
  - Moon low gravity.
  - Mount Rushmore with a gold fifth face.
- **Truth posts**: occasional "TRUTH:" banners that pop up mid-level.

## Rules carried over from v1
- Real politicians are only ever defeated comedically: "YOU'RE FIRED!" and a cage. New antagonists are fictional (the Anchorbot, the Deep State Agent and the Kraken).
- Saves stay compatible. The highest unlocked level is clamped to 1–30.

## Status (2026-11-07)
Done on branch `v2` (not pushed):
- 30 levels, 12 new themes and the World 1–3 tabs on the level select.
- Power-ups: MAGA cap, Diet Coke, TARIFF!, Big Beautiful Wall and gold bars.
- Truth-post pop-ups and set-dressing props.
- Bosses: the Anchorbot, the Deep State Agent, Obama 2, the Kraken, Harris 2, the fictional Generalissimo of Nexico (L19) and the Swamp Emperor tag-team finale.
- The Golden Shop, paid for with golden passports (saved). Upgrades: armour, guns, grenades, extra lives and an eagle escort.
- Music rewritten as a slower, majestic anthem.
- Fixed: dying in a boss arena respawned you outside the locked wall.
- All 30 levels pass the headless run-through.

Storyline and cutscenes: done. Scenes play before level 1 (intro), before levels 11 and 21 (world openers), before every boss level (Pete's intel briefing) and after level 30 (ending). They use letterbox bars and a typewriter caption, and can be skipped with SKIP, a tap or a key.

Content line, agreed with the user: the Generalissimo stays a generic cartoon dictator, not an ethnic stereotype. No level treats immigrants as the enemy.

## World 4: World Tour (levels 31–40), done
| Levels | Theme | What's there |
|---|---|---|
| 31, 36 | Lincoln Memorial Reflecting Pool | Swim mode: buoyancy, JUMP is a swim stroke or a leap out at the surface. Frogman divers, lily-pad platforms, underwater barrels. |
| 32, 37 | Giga Factory | The friendly T-Bot (laser rifle) is in the cages and playable. No real brand logos. |
| 33, 38 | Parade grounds | Uniformed regime soldiers. Boss: the Supreme Parade Tank, a fictional machine. |
| 34, 39 | Robot Republic | Robot armies. Boss: Mecha Dragon 9000. |
| 35, 40 | Oil Drum Steppe | Chain-reacting drum fields and oil derricks. Boss: the Oil Baron's Drill Rig, which throws exploding drums. |

Other changes:
- The ending cutscene now plays after level 40.
- Blood: henchmen bleed when hit and when killed, and the blood leaves splats. Robots and turrets spark instead. Politician bosses are never killed, so they never bleed.
