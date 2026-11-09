# Tanks

A side-on turn-based artillery game from Lang Systems. Move into position, read the wind, and use one shot per turn to change the battlefield.

**[Play Tanks on GitHub Pages](https://langzonedev.github.io/Tanks/)**

## Play

- **Pass & play** — Two to four players take turns on one device.
- **Share turns** — Two people exchange a fresh turn link after each shot. Open the link and choose **Open shared turn** to resume the exact board.
- Choose **Redline Badlands**, **Relay Ridge**, or **Salt Basin**. The seed gives each match a new terrain layout.
- Move up to 90 units per turn, adjust angle and power, choose a weapon, then fire. A short trajectory guide shows the opening arc. On the battlefield, drag to aim.
- On a keyboard, focus the battlefield and use **A/D** to move, **←/→** to aim, **↑/↓** for power, and **Space** to fire.

| Weapon | Effect | Charges per player |
| --- | --- | --- |
| Field Shell | Dependable damage and a small crater | Unlimited |
| Bunker Buster | Large blast and a deep crater | 2 |
| Cluster Charge | Three submunitions spread across the target area | 2 |
| Groundbreaker | Cuts a narrow, deep trench | 2 |
| Reactive Shield | Uses the turn to halve the next damaging impact | 1 |

Last tank standing wins. At 120 turns the highest remaining armour wins, with a draw for tied leaders. The game saves one match locally after each resolved turn. Sharing uses a replay link exchanged between players, so there is no live room, account, or server-side match authority.

## Developer handoff

```sh
npm run verify
npm start
```

Open http://localhost:4174/ after starting the static server. No build or runtime packages are required. `engine.js` owns rules, `renderer.js` draws the scene, `app.js` owns interaction, and `session.js` serializes bounded, versioned replay commands. Preserve v1 replay outcomes or bump the replay version when changing deterministic rules.

GitHub Pages publishes through the workflow in `.github/workflows/pages.yml`. For a new Pages setup, select **GitHub Actions** under **Settings → Pages → Source**, then run **Verify and publish Tanks**. See [handoff and verification](docs/HANDOFF.md).

All game art, sounds and code are original to this project.
