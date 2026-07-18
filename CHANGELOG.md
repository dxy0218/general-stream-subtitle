# Changelog

## 0.5.0 Pluto hotfix

- Fix Pluto TV translated tracks disappearing when upstream subtitle requests require Pluto origin headers.
- Preserve compact live WebVTT cue boundaries and `X-TIMESTAMP-MAP`.
- Fall back to the original subtitle body when translation or format handling fails instead of returning an empty track.

## 0.4.0

- Add pluggable translation provider registry and fallback chains.
- Add Google Cloud Translation v2, DeepL, Azure Translator, LibreTranslate, OpenAI Responses, OpenAI-compatible, Gemini, and custom JSON adapters.
- Store provider secrets separately from ordinary settings and mask them in admin/health responses.
- Add WebVTT, SRT, TTML/DFXP/IMSC Text, ASS/SSA, and generic JSON cue adapters.
- Add experimental direct-BaseURL DASH/MPD subtitle track injection.
- Add BBC iPlayer, Viki, Tubi, Pluto TV, Crunchyroll/VRV, DAZN, Plex, generic, and custom-domain adapters.
- Expand local configuration UI and switch writes to POST requests.
- Add 19 automated tests.

## 0.3.0

- Add automatic source-language selection and multi-platform HLS adapters.
- Add Apple TV, Apple TV+, Apple Fitness+, Disney+, Prime Video, Hulu, Paramount+, Peacock, Discovery+, Fubo, and TED.

## 0.2.0

- Add visible `Translate-zh` bilingual track and the `gss.local` synthetic gateway.

## 0.1.0

- Initial Max HLS/WebVTT Google translation MVP.
