# Agent handover: The Trump Force

## What the user wants
A mobile-first parody run-and-gun platformer in the Broforce **genre**, starring a cartoon Donald Trump. It should also play on PC.
- Name: **The Trump Force**
- **10 levels**
- Deployed to **Vercel**, with a **playable mobile link** sent to the user
- Write in UK English when talking to the user

Repo: `calm032019/The-Trump-Force`. Branch: `ccr-cc043828-i6mw1n`. Commit and push to that branch only, and don't open a PR unless asked.

## Current state (pushed)
| File | Status |
|---|---|
| `index.html` | Done. Contains a full-screen `<canvas id="game">` and these DOM screens: `#title`, `#levels`, `#pause`, `#complete`, `#gameover`, `#victory`, `#rotate`. It loads `game.js`, which **doesn't exist yet**. Button ids: `btnPlay`, `btnLevels`, `btnSound`, `btnLevelsBack`, `btnResume`, `btnRestart`, `btnPauseSound`, `btnQuit`, `btnNext`, `btnCompleteMenu`, `btnRetry`, `btnOverMenu`, `btnVictoryMenu`, `btnRotateAnyway`. Containers: `#levelGrid`, `#completeStats`, `#completeQuote`, `#victoryStats`, `#titleArt` (a 160×110 canvas). `#safe` is used to measure the safe-area insets. |
| `style.css` | Done. Retro pixel UI using the Press Start 2P font. `.screen.show` makes a screen visible. A `body.touch` class switches between the touch and desktop hints. |
| `manifest.json`, `icon.svg` | Done. A PWA manifest (landscape, fullscreen) and an icon. |
| `game.js` | **To do: this is the whole game.** |

## Content the user asked for (all must be included)
**Player and allies**
- **Donald Trump**: the main playable character. Pixel caricature with a blue suit, red tie and golden swoop hair, carrying a gold gun and grenades.
- **Barron Trump**: a playable or rescuable ally. The tall one.
- **Barron's suitcase**: a collectible or weapon. Suggestion: thrown as a special attack, or a pickup that refills grenades or lives.
- **Don Jr** and **Eric**: playable allies. Suggestion: they're freed from cages, and rescuing one swaps you to that character, as in Broforce. Give each a different weapon. For example, Don Jr has a hunting rifle with piercing shots, and Eric has a shotgun spread.
- **Pete Hegseth**: an ally. Suggestion: an unlockable playable soldier, or he calls in airstrikes as a pickup.
- **Bald eagles**: support for Donald. Suggestion: a pickup that summons eagles to dive-bomb enemies on screen, or an eagle companion that attacks nearby enemies.
- **Trump Force One**: the plane. Use it for the level intro fly-in or drop-in, as the extraction vehicle at the end of each level, and for the victory screen.
- **American flags**: checkpoint flags that you raise, plus scenery and the victory screen.

**Antagonists:** the user asked for Joe Biden, Kamala Harris, Barack Obama, Hillary Clinton and Zohran Mamdani.
- **Recommended handling.** These are real, living politicians. Use them as cartoon **boss characters who are defeated comedically, not killed**. When beaten, a boss gets "YOU'RE FIRED!", gets knocked dizzy and flees, or is hauled away in a cage or a paddy wagon. Their attacks should be silly projectiles: memos, ice cream cones, campaign signs, ballot boxes, rent-freeze notices and so on.
- **Ordinary enemies** are generic henchmen ("Swamp goons" in balaclavas, dogs, rocket goons, heavies, turrets). They can be shot and blown up as in Broforce.
- Keep everything a caricature with no gore. Tell the user about this approach in one line when you report back.
- **Suggested boss order:**

  | Level | Boss |
  |---|---|
  | 2 | Mamdani |
  | 4 | Harris |
  | 6 | Clinton |
  | 8 | Obama |
  | 10 | Biden, alongside the final "Swamp King" mech |

  At least levels 5 and 10 must have a boss. You can rebalance the rest.

## Game design spec (planned)
- **Rendering:** draw the world into a low-resolution buffer about 13 tiles tall (16px tiles), then scale it up with smoothing off. Draw the HUD, floating text and touch controls on the full-resolution canvas. Build sprites from pixel-map strings at run time, so there are no image assets.
- **Physics:** fixed 60Hz timestep and AABB collision against tiles. Gravity about 900, jump about 330, run speed about 105. Add coyote time, a jump buffer, variable jump height, and wall-slide plus wall-jump so walls can be climbed.
- **Tiles:**

  | Tile | Hit points | Notes |
  |---|---|---|
  | dirt | 2 | |
  | stone | 5 | |
  | steel | — | Can't be destroyed |
  | crate | 1 | Can drop pickups |
  | explosive barrel | 1 | Chain explosions |
  | one-way plank | 2 | Drop through by pressing down |
  | brick | 3 | Bunkers |
  | pole | — | Decoration |

  Player bullets damage tiles and grenades leave craters.
- **Levels:** generated the same way every time from a fixed seed. Each is 150 to 220 tiles wide and 24 tall. They're built from segments: height changes of 3 tiles or less, pits 2 to 3 tiles wide, wider pits with plank bridges, bunkers, watchtowers, crate stacks, barrels and floating platforms. Each level gets two checkpoints (flags) and three cages. Boss levels end in a locked arena. Other levels end in an extraction zone where you board Trump Force One.
- **Themes and level names:**

  | Level | Name | Theme |
  |---|---|---|
  | 1 | Beachfront Property | beach |
  | 2 | The Art of the Jungle | jungle |
  | 3 | Make the Village Great | village |
  | 4 | Desert Deal | desert |
  | 5 | Breaking News | desert fortress |
  | 6 | Frozen Assets | snow |
  | 7 | Covfefe Mountain | snow base |
  | 8 | Hostile Takeover | night city |
  | 9 | Down the Swamp Hole | cave/swamp, with a ceiling |
  | 10 | Drain the Swamp | final |

- **Rules:** 3 lives, with 3 HP per life and brief invulnerability after a hit. Grenades start at 3, maximum 5. Rescuing someone gives +1 life and refills grenades. Falling into a pit costs a life. Running out of lives gives a game-over screen with a retry.
- **Quips** appear as floating text: "TREMENDOUS!", "BIGLY!", "YOU'RE FIRED!", "WINNING!", "BELIEVE ME!", and "SAD!" on death.
- **Controls:**
  - Touch: a floating joystick on the left 42% of the screen, with JUMP, FIRE and BOMB buttons on the right. Use pointer events and allow sliding between buttons. Show a pause button in the top right.
  - Keyboard: arrows or WASD to move, Space/W/↑ to jump, J/X to fire, K/C for a grenade, P/Esc to pause.
  - Show the `#rotate` screen when a touch device is in portrait.
- **Audio:** WebAudio sound effects synthesised in the browser, plus a short original chiptune march with mute. Don't use any copyrighted melodies.
- **Saving:** store unlocked levels and mute in `localStorage`, wrapping every access in try/catch.
- **Testing hook:** expose `window.__ttf` for Playwright tests.
- **Originality:** don't copy Broforce's assets, names or art.

## Deployment
- There is **no Vercel token or login** in the environment, and `vercel` isn't installed globally. It's plain static files, so no build step is needed.
- Options:
  1. The user imports the GitHub repo into Vercel (framework: "Other", root `/`).
  2. The user adds a `VERCEL_TOKEN` to the environment, then you run `npx vercel deploy --prod --yes --token $VERCEL_TOKEN`.
  3. As an interim link, publish to a claude.ai artifact. This needs everything inlined into one HTML file.

## Next steps
1. Write `game.js` to the spec above, including the requested characters.
2. Test with Playwright (Chromium is preinstalled): check the console for errors, take screenshots at phone landscape (844×390), phone portrait and desktop sizes, and try all 10 levels via `__ttf`.
3. Commit and push to `ccr-cc043828-i6mw1n`.
4. Deploy, then send the user the mobile link.
