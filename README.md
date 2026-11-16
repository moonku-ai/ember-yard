# Ember Yard — a three.js tactical FPS

[![make.fun](https://make.fun/badge/entry.svg)](https://make.fun/bounty/threejs-fps-02)
[![make.fun](https://make.fun/badge/bounty-threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)

A complete round-based tactical FPS that runs offline from static files.
Five attackers against five defenders in a dusk freight yard: plant the bomb
at DEPOT or SILO, or eliminate the other team. First to 7 rounds wins.

## How to play

```sh
node serve.ts
# open http://localhost:8080
```

- **WASD** move, **mouse** look, **click** fire, **right-click** aim down sights
- **R** reload, **1/2** switch weapons, **4–7** throw grenades, **E** plant / defuse
- **B** buy menu (buy phase), **Shift** sprint, **Ctrl** crouch, **Space** jump, **Tab** scoreboard

## What is in the game

- **7 weapons** (P250, MP5, Nova, AK-47, M4A1, DMR, AWP) with recoil, bloom
  spread, damage falloff and headshots; **4 grenades** (HE, flash, smoke,
  molotov) plus kevlar, helmet and defuse kits.
- **Round economy**: win/loss money, loss-streak bonus, kill and plant
  rewards, MVP bonus, and a buy menu between rounds.
- **Bots with team plans** (rush A, rush B, mid, split, fake push), roles,
  lane routes, hearing, rotations, site retakes, utility use (smoke the
  entry, flash before pushing, molotov to flush holders), bomb plants with
  cover, defuses with cover, and saving when outnumbered.
- **The map**: a 72 × 52 m freight yard at dusk — container stacks, a grain
  silo, train cars, a rail cut, and a crane bridge with stairs for vertical
  play. Zone callouts, a live minimap, gunshot pings, and a dusk sky with
  fog, lamps and long shadows.
- **Gunplay**: hitscan with body/head boxes, tracers, muzzle flash, shell
  casings, impact puffs, procedural WebAudio sounds, and a fixed 60 Hz
  simulation kept apart from rendering.

## Layout

- `game/index.html` — page + HUD
- `game/src/` — one module per job: `sim` (rounds/economy), `bots` (AI),
  `combat` (hitscan), `grenades`, `bomb`, `map`, `render`, `hud`,
  `effects`, `audio`, `input`, `config`, `utils`
- `main.ts` — the grader entrypoint: copies `game/` + `screenshots/` to
  `/output` and writes `dossier.json`
- `serve.ts` — static dev server

## License

MIT — see [LICENSE](LICENSE).
