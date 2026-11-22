# Issue #153 – AltGr and narrow-screen input acceptance

Automated Chromium tests for the input binding system cover 320, 390 and 430 px touch viewports, keyboard chord capture, touch targets, map/inventory modal closure, restored settings, and synthetic AltGr event sequences. **Chromium-synthesized events are not a substitute for a physical keyboard.**

## Manual hardware acceptance (outstanding)

- [ ] Windows 11, Czech keyboard, current Chrome: open Controls, capture `AltGr + E` (if it produces `€` on the configured layout). Capture must remain active, report unsupported input, and not bind `AltRight`, `ControlLeft`, or `Ctrl+Alt+E`. After releasing AltGr, `Ctrl+M` must bind normally.
- [ ] Windows 11, Czech keyboard, Firefox: repeat the capture and verify game does not trigger `HOLD_POSITION` assigned to standalone AltRight when AltGr is held.
- [ ] Linux Czech keyboard (Chrome/Firefox): check AltGraph and Ctrl+Alt fallback behavior, including left/right physical modifier differences and key-release order.
- [ ] macOS keyboard with Option: confirm Option+key is handled according to actual platform events without claiming it is the Windows AltGr modifier.
- [ ] 320/390/430 px Android Chrome and iOS Safari on physical devices: controls panel fits viewport, is scrollable, its Back button is reachable, map zoom/close is operable, HUD quick actions can be tapped, and switching browser apps never leaves hold-position active.
- [ ] Test screen reader and keyboard-only Escape/back navigation separately on the supported physical browsers.

Do not mark #153 fully closed based solely on the CI emulator. If a platform emits an unexpected event sequence, record event `code`, `key`, `ctrlKey`, `altKey`, `shiftKey`, and `getModifierState('AltGraph')` (never log typed text or private content), then add an E2E regression before correcting the behavior.

Related: PR #154 mouse UI shortcuts, PR #155 held position, PR #156 chords; this acceptance track.
