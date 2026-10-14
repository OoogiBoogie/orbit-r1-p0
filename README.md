# ORBIT companion P0 (synthetic) for the rabbit r1

This is a 240×282 demo page. It is meant to be installed on a rabbit r1 as a creation, by QR code.

- **Synthetic only.** The people, Orbits and files are made up. There is no ORBIT account or data, and no sign-in.
- **No network.** The page's Content-Security-Policy is `connect-src 'none'`. It never calls the r1's assistant, microphone or camera.
- **Not ORBIT itself.** This is a prototype of the controls: wheel and side button, "what changed", opening a file, and a hand-off back to the phone.

Controls on the r1: turn the scroll wheel to move, and press the side button to choose. "Device check" lists what the r1's browser supports.

The files are byte-identical to the tested set; see `MANIFEST.sha256`.

## capture/ — a separate camera/microphone check

Takes one photo or records one 3-second clip when asked, shows it on the r1, then throws it away. Nothing is sent (CSP connect-src 'none') and nothing is stored. The camera/mic is on only while capturing. Files listed in capture/MANIFEST.sha256.

## storage-probe/ — where and when the r1 gives a creation its storage

Two variants of one diagnostic: `a/` uses the same script policy as the ORBIT companion page (`script-src 'self'`); `b/` has no script restriction. Both have `connect-src 'none'`. It records only whether `window.creationStorage` (and its `secure`/`plain` methods) exists, and when it first appears (script start to 20 s after load), when each storage becomes usable, and one round trip of a random throwaway value per storage and key style (each step waits at most 5 s; a step that never answers can't be cancelled, so removing the test value is attempted, not guaranteed). It never shows or keeps a stored value, never calls `clear()`, and sends nothing. The result is a short code and plain words on the screen. Files listed in storage-probe/MANIFEST.sha256.
