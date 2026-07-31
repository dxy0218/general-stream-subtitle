# Changelog

## Unreleased

## 0.6.2

- Add a native Shadowrocket `HY_MT2` switch for a private OpenAI-compatible Hy-MT2 translation service.
- Preserve the private Endpoint and API Key in `gss.local` storage instead of publishing credentials in module arguments.
- Force one translation request at a time with smaller subtitle batches for low-memory CPU VPS deployments.
- Fall back to `google-free` when the private Hy-MT2 service is not configured or temporarily unavailable.

## 0.6.1

- Add an enabled-by-default, bounded persistent event log for manifest, gateway, translation, fallback, YouTube and exception stages.
- Add a native `LOGS` switch independently from verbose console `DEBUG` output.
- Add automatic redaction for signed query strings, tokens, cookies, authorization values, JWTs, passwords and API keys.
- Add a mobile-friendly `gss.local/logs` viewer with summary counts, expandable details, copy, JSON export and clear actions.
- Deduplicate repeated events, cap storage at 80 records/120 KB and add logging regression tests.

## 0.6.0

- Replace Shadowrocket string parameters with native boolean switches and a fixed Chinese subtitle preset.
- Make Shadowrocket platform switches override stale `gss.local` settings and enable fail-open HLS-only playback protection.
- Add dedicated Max/Discovery media-manifest, Prime Video HLS, Hulu VOD/live HLS, and expanded Pluto production-media rules.
- Remove broad Max/Discovery account, session, GraphQL and API matching; remove broad Amazon S3 interception.
- Default Discovery+ off on Shadowrocket while preserving an opt-in HLS-only adapter.
- Add regression coverage for five-platform HLS injection, non-HLS bypass, switch behavior and sensitive endpoint isolation.

## 0.5.7

- Declare candidate metadata for Shadowrocket module parameters. Shadowrocket continued to render non-boolean values as text fields, which v0.6.0 replaces with switches.
- Add documented candidate presets for source/target languages, providers, platforms and compatibility modes.

## 0.5.6

- Add `DISCOVERY_MODE=full|hls-only|off` for Apple TV compatibility isolation without clearing saved provider settings.
- Make the Discovery compatibility mode override stale `gss.local` settings while leaving normal configuration precedence unchanged.

## 0.5.5

- Restrict default Discovery+ HTTPS interception to identifiable media CDN hosts so Apple TV device and account setup requests bypass MITM.
- Add generated-rule regression coverage for Discovery+ account, device, and API hosts.

## 0.5.4

- Remove shared Apple Music/Apple TV hosts from the default MITM list to prevent Apple Music certificate validation errors.

## 0.5.3

- Match all responses on known Max and Discovery playback hosts so opaque and GraphQL playback paths reach the content-aware manifest adapter.
- Expand Discovery+ detection to regional Uplynk hosts, Discovery domains, and shared `dplus-*.h264.io` CDN hosts.
- Add current Max `discomax.com` playback coverage and isolate Max/Discovery rules from the generic manifest rule.
- Process Discovery+ playback JSON text-track arrays and broaden supported URL/language/label fields.
- Give injected Apple subtitle tracks unique `STABLE-RENDITION-ID` values and remove stale response validators after body rewrites.
- Bound playback-JSON traversal and skip DRM, ad, analytics, image, and tracking subtrees.
- Disable verbose diagnostics by default and suppress informational logs unless debugging is enabled.
- Translate independent Google-compatible batches with bounded concurrency while preserving cue order.

## 0.5.2

- Restrict Pluto TV interception to known master-playlist hosts and paths.
- Remove broad `*.pluto.tv` MITM coverage to reduce app and playback breakage.
- Add a conservative Max/Paramount playback-JSON text-track adapter.
- Add Paramount+ Live TV platform detection and dedicated manifest/playback rules.
- Add sanitized runtime diagnostics at `http://gss.local/diagnostics`.
- Expand automated coverage for Max JSON tracks, Paramount Live, rule isolation and diagnostics.

## 0.5.1

- Set injected translation tracks to `AUTOSELECT=NO` so Chinese-language Apple devices do not start live translation before the user selects the track.
- Fast-pass HLS media playlists to reduce overhead on frequently refreshed live streams such as Pluto TV.
- Add a Max-specific response rule for extensionless manifest, playlist, playback, HLS and DASH URLs.
- Log whether a manifest has no subtitle renditions, unmatched text subtitles, or only in-band CEA closed captions.

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
