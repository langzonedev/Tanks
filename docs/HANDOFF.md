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


## Frontline 2.0

The operator expanded Tanks into a combined-arms game with a solo opponent. Frontline is the default battle type and Classic remains selectable. Equal forces, mirrored deployment and paired wind establish opening parity. First-turn initiative and battlefield balance remain playtest questions.

- Technical Architect / Developer (tanks_engine) owns Frontline rules, symmetry checks and replay verification.
- UX Designer (design_review) owns the unit silhouettes, faction markers, relay, air support effects and renderer review across desktop and narrow widths.
- Core / Integration (root) owns the setup and order interface, AI planning, persistence, release and handoff.
- QA / CISO (qa_security) owns independent rules, replay and bot legality checks.

A solo bot chooses among bounded legal candidates using the visible battlefield. The worker runs only in Solo, and a saved human order schedules one reply when resumed. Old Classic saves and v1 links preserve their results. Frontline links use v2 or v3 order tuples with strict unit ownership, resource and target checks. V3 gives both factions a deployment-only opening turn and requires a faction to keep control through the opposing turn before scoring. V2 matches keep their original immediate capture scoring.

The browser gate exercises the desktop battlefield dimensions, narrow touch layout, air support, Classic four-player turns, solo recovery, and cross-client turn links. Physical phone comfort and game balance are human playtest items.

## Frontline 2.0.3 responsive playtest

Live desktop play covered craters, a reinforcement drop and the AI response. At a compact browser viewport, choosing a weapon put the field above the visible page, so checking aim meant scrolling back and forth. The active battlefield now stays above the controls in phone portrait and sits beside them on tablets and in phone landscape. The canvas accepts normal scrolling when the selected order needs no aim. On short landscape screens, the order button stays within reach while the controls scroll.

The Chromium gate exercises deployment, canvas targeting and an air raid at 320×568, 390×844, 667×375, 844×390, 768×1024 and 1024×768, plus the existing 1366×900 desktop check. It verifies that the field stays visible after choosing the raid and during landscape playback. It also fires another shot after rotating into portrait.

For the next physical phone test, start a Solo Frontline match, reposition a squad during deployment, then select Air Raid and tap the field to target it. Rotate the phone during the match and check that the field and fire controls are comfortable to use. Play a few matches at both Recruit and Standard to compare the AI pressure.
