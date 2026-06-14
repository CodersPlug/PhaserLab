# PhaserLab

Quick idea testing track. No install, no build step — just a local server.

## Run it

```bash
cd /Users/leo/Documents/Projects/PhaserLab
npx serve .
```

Open the URL it prints (usually http://localhost:3000) in any browser.

## Controls

| Key | Action |
|-----|--------|
| Arrow Left / A | Move left |
| Arrow Right / D | Move right |
| Arrow Up / W / Space | Jump |

## What's in it

- `index.html` — loads Phaser 3 from CDN, no npm needed
- `game.js` — single file with everything: player, platforms, coins, enemies, score, lives, respawn

## How to experiment

| Idea | Where to change |
|------|----------------|
| Player speed | `MOVE_SPEED` constant at the top |
| Jump height | `JUMP_FORCE` constant |
| Gravity | `GRAVITY` constant |
| Level layout | `platPositions` array |
| Coin positions | `coinPositions` array |
| Enemy speed | `setVelocityX(...)` in enemy creation |
| Add a new mechanic | New overlap/collider in `create()` |

## Debug mode

Set `debug: true` in the arcade physics config to see all hitboxes.

## Two-track workflow

- **PhaserLab** (this) — validate the idea fast in the browser
- **Gamer** (Unity) — rebuild it properly for mobile once it's proven fun
