# Krepost

An idle tower defense game for the browser. One fortress in the middle, endless
waves from every side. No ads, no purchases, no tracking: everything is earned
by playing.

**Play:** https://nudoarmetudor.github.io/krepost-game/ (works on a phone; use
"Add to Home Screen" to install it and play offline).

## What is in it

- **Runs**: the tower fires on its own; spend cash on 34 Attack, Defense and
  Utility upgrades during the run. A boss every tenth wave.
- **Workshop**: permanent upgrades bought with coins. Some stats (multishot,
  bounce shots, orbs, shockwave, land mines, lifesteal, interest, packages)
  are unlocked here first.
- **Labs**: 22 research lines on real-time timers, including game speed (up to
  ×5) and Auto Perk. They keep running while the game is closed.
- **Cards**: 21 cards with seven star levels, bought with gems and equipped in
  slots.
- **Ultimate weapons**: nine, unlocked and upgraded with stones (Annihilation
  Wave, Arc Storm, Seeker Missiles, Singularity, Midas Keep, Searchlight,
  Time Field, Mine Ring, Venom Marsh).
- **Perks**: a choice every few waves, including trade-offs.
- **Modules**: four slots, five rarities, special effects from Epic up; level
  with shards, merge three into a rarer one.
- **Tiers**: ten difficulty tiers that pay more.
- **Stats panel** (the bars icon, at home and in battle): every tower number
  with the upgrade level it starts from, each lab, card, module and perk that
  multiplies or adds to it, and the total; expected DPS, effective health and
  what an enemy hit costs; and every enemy type at any wave and tier.
- **Idle coins** while away, daily gems, milestones, save export and import.
  Saves from earlier versions keep working (`tests/fixtures/save-v1.json`).

Gems come from daily visits, milestones, bosses and a floating gem during runs.

The online layer of similar games (tournaments, guilds, leaderboards) is not
included: GitHub Pages hosts static files only.

## How it is built

Plain JavaScript modules and a canvas, no build step and no dependencies. GitHub
Pages serves the repository root as it is.

- `js/data.js` every number in the game
- `js/game.js` the run simulation (no DOM, also runs in Node)
- `js/state.js` the save, workshop, labs, cards, modules, idle earnings
- `js/stats.js` folds everything into the stats a run uses, and records how
  each one was built; `js/statspanel.js` shows that record
- `js/render.js` canvas drawing; `js/main.js` and `js/screens.js` the interface
- `sw.js` offline cache; progress is saved in the browser's local storage

## Develop

```
python3 -m http.server 8000      # then open http://localhost:8000
node --test tests/*.test.mjs     # unit tests, also run in CI
node tools/sim.mjs 8             # balance check: a bot plays 8 runs
node tools/smoke.mjs             # phone-size browser test with screenshots (needs Playwright)
```

When files change, bump `CACHE` in `sw.js` (and list new files in `FILES`) so
installed copies refresh; they switch to the new version at the next quiet
moment, never mid-battle.
