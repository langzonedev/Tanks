# Tanks 1.0 handoff

The operator promoted the prior two-tank browser idea into Tanks on 9 November 2026. The October discussion specified alternating angle/power shots on destructible terrain and same-device multiplayer first. The adjacent parked autonomous toy-soldier concept is distinct. The first Tanks release implements pass & play plus manual exchange of turn links.

## Acceptance

- Start a two to four player match. Choose a map, move within fuel, aim, choose a weapon and fire. One command advances one turn.
- Hit terrain to see a crater. Tanks settle on the resulting surface. Hit a tank to reduce armour and eventually remove it from turn rotation.
- Start **Share turns**, fire, copy the turn link, and open it in another browser. Accept the link and send a reply after the opponent's turn. Returning to the original tab with a new link presents it for acceptance.
- Refresh after a shot and resume. The resolved turn is saved before its animation finishes.
- Use touch controls at narrow width or keyboard controls on the battlefield. Respect reduced-motion preference.
- Last surviving tank wins. The 120-turn limit resolves highest armour or a draw. Rematch is available.

## Design and release

The pure engine derives the battlefield from a seed and replays bounded commands. A share URL carries a version, seed, map, player count and command history in its fragment. It never carries player-supplied HTML, credentials, or server state. Import validates the payload and derives health, terrain, wind, ammo and active player. Sharing is a friendly, manual exchange. Players control their copies, so competitive anti-cheat and automatic synchronization would require a separate authority design.

The static package uses relative assets under `/Tanks/`. GitHub Actions verifies the game, packages only public app assets and publishes via Pages. Revert the release commit and rerun Pages for rollback. The browser stores a single local match. Clearing site data removes it. Version the replay protocol if rules change.

## Core team and evidence

| Role | Execution | Responsibility |
| --- | --- | --- |
| Core / Product / Integration | Root | Scope, UI, link exchange, release and user handoff |
| Technical Architect / Developer | tanks_engine | Deterministic simulation and geometry |
| UX Designer | design_review | Procedural artwork, renderer, design-to-build review |
| QA / CISO | qa_security | Independent engine and session tests, input boundary and recovery review |

The independent suite verifies deterministic replay, artillery damage and deformation, movement bounds, limited weapons, shield behaviour, elimination, termination and rejection of malformed shared commands. The renderer was inspected at desktop and narrow widths with actual engine states. The Pages workflow includes automated Chromium checks across local play, save recovery, two-client exchange, same-tab share import and touch emulation. Physical-phone comfort and performance remain for human playtesting.
