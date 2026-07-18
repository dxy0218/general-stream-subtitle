# Changelog

## 0.3.0

- Make `source=auto` the default and allow arbitrary source language codes.
- Select one best non-forced source track instead of duplicating every matching track.
- Add language aliases and configurable automatic language priority.
- Add a platform registry and per-platform settings.
- Add Apple TV, Apple TV+ and Apple Fitness+ HLS/WebVTT adapters.
- Add Disney+, Prime Video HLS, Hulu, Paramount+, Peacock, Discovery+, Fubo and TED adapters.
- Add platform identity to virtual subtitle URLs and diagnostic logs.
- Expand Surge, Loon and Shadowrocket module patterns and MITM host lists.
- Keep Netflix, YouTube, DASH/MPD and TTML explicitly out of the supported set until dedicated parsers are implemented.

## 0.2.0

- Rename project to General Stream Subtitle.
- Add visible `Translate-zh` bilingual track.
- Translate only after the virtual track is selected.
- Replace signed-URL query mutation with the `gss.local` synthetic gateway.
- Add module arguments, persistent settings and a local configuration page.
- Replace `subtitle.js` response hook with `gateway.js` request hook.

## 0.1.0

- Initial Max HLS/WebVTT Google translation MVP.
