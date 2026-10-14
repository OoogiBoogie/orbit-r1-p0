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

## capability-probe/ — what a stock r1 creation can play, record and say

A diagnostic for the r1's own browser. It plays and decodes only its own small synthetic test files: solid red pictures and 2-second red videos with a 440 Hz tone, in H.264, HEVC, VP8, VP9 and AV1 video; AAC, MP3, Opus, Vorbis, WAV and FLAC audio; and JPEG, PNG, WebP, GIF and AVIF images. It reports which of them really decode and render, and whether video may start without a tap. It also runs the ORBIT viewer's path on ten of its own files: one fetch, the body read as a stream, the SHA-256 checked, then a blob: URL decoded and revoked. It also lists what the browser can record, whether speech synthesis exists and how many voices are on-device. Only when you press Ask does it ask the browser whether speech recognition would run on the device or elsewhere (it never downloads a model). Listen starts recognition ONLY if the browser promises on-device processing, and keeps only the length of what it heard and whether it was the test words.

Only when you press does it play a beep, a tone or a short video, or say a fixed test phrase, and only with an on-device voice. Holding the side button records from the microphone ONLY while held, then shows the length, size and loudness. The clip is never kept or sent. Note that the r1 itself may hand speech to rabbit's assistant during a hold, so say only "one two three". Anything rabbit's system delivers to the page is shown as its SHAPE only (keys, types and lengths), never its words.

It never calls rabbit's `PluginMessageHandler` (no LLM call) and stores nothing. Its CSP is `connect-src 'self'`: it loads only its own files. Files are listed in capability-probe/MANIFEST.sha256.
