# Tanks delivery contract

Follow the adopted Lang Systems Core baseline in docs/CORE_BASELINE.md. The operator authorised implementation, main-branch publication and the public Pages link on 9 November 2026.

Keep the static browser app and its test tools separate. The simulation owns rules, the renderer owns artwork, and the app owns input and interaction. Treat shared turn URLs as untrusted. Store only validated, bounded, versioned replay commands. Preserve existing replay behaviour or introduce a new protocol version when modifying deterministic rules.

Run npm run verify and the browser smoke for game-flow changes. Record browser and physical-device evidence separately. Verify the public build before describing it as live.
