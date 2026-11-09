# Tanks

A side-on turn-based strategy game from Lang Systems. Lead armour and infantry, call in air support, and use the changing terrain to your advantage.

**[Play Tanks on GitHub Pages](https://langzonedev.github.io/Tanks/)**

## Play

Choose **Frontline** for combined arms or **Classic** for the original tank artillery rules.

- **Solo** pits you against Ember AI at Recruit or Standard difficulty. It plays under the same rules and resource limits as you.
- **Pass & play** uses one device. Frontline has two factions. Classic supports two to four players.
- **Share turns** lets two people exchange a fresh turn link after each order. Open the link and choose **Open shared turn** to reconstruct the board.

### Frontline

Each faction deploys a tank, a rifle squad and an anti-armour squad on mirrored terrain. Each also has one air raid and one reinforcement drop. Both sides get a deployment turn to reposition one unit or hold. Combat and air support unlock after both deployments. Then choose one unit, reposition, and issue one order per turn.

| Unit or support | Tactical role |
| --- | --- |
| Tank | Lob shells over cover or spend a heavy round to open a larger crater |
| Rifle squad | Use direct fire against infantry and move quickly to the relay |
| Anti-armour squad | Use limited rockets against tanks |
| Air raid | Strike a grid position, including friendly units inside the blast |
| Air drop | Land a fresh rifle squad on clear ground |

Take the relay and hold it uncontested through the opponent’s turn. Each turn you finish with control after that scores one point. Reach four points or eliminate the enemy force to win. At 120 turns, relay points decide the match, followed by remaining force health and a draw if both tie.

### Classic

The original artillery rules retain fuel-limited movement, wind, five weapon choices, destructible terrain and last-tank-standing victory. Previous Classic turn links still open.

### Controls

Select a unit and order, then adjust movement, angle and power or set the target grid. Drag on the battlefield to aim. Tap the battlefield for targeted air support. The dotted trail shows the start of the shot. On a keyboard, focus the battlefield and use **A/D** to move, **←/→** to aim or adjust a target, **↑/↓** for power, and **Space** to confirm an order.

The game saves one match locally after each resolved order. Separate-device play uses manually exchanged links. Each link carries the map seed and validated order history.

## Developer handoff

```sh
npm run verify
npm start
```

Open http://localhost:4174/ after starting the static server. No build or runtime packages are required. `engine.js` owns Classic, `frontline.js` owns combined arms, `bot.js` plans solo turns in a browser worker, and `renderer.js` draws both scenarios. `app.js` owns interaction and `session.js` handles Classic v1 and Frontline v2/v3 replays. Preserve existing replay outcomes or add a protocol version when changing deterministic rules.

GitHub Pages publishes through the workflow in `.github/workflows/pages.yml`. For a new Pages setup, select **GitHub Actions** under **Settings → Pages → Source**, then run **Verify and publish Tanks**. See [handoff and verification](docs/HANDOFF.md).

All game art, sounds and code are original to this project.
