# Architecture

General Stream Subtitle keeps platform matching separate from subtitle processing.

## Runtime bundles

- `manifest.js`: response hook for known HLS master-manifest domains.
- `gateway.js`: request hook for virtual subtitle playlists, subtitle segments and the settings page.

## Source modules

- `src/platforms/registry.js`: platform detection and enable/disable logic.
- `src/shared/language.js`: language normalization, aliases, matching and automatic priority.
- `src/manifest/m3u8.js`: generic HLS subtitle-track selection and virtual-track injection.
- `src/subtitle/*`: WebVTT parsing and translation rendering.
- `src/gateway/*`: synthetic `gss.local` responses and settings UI.

Platform adapters do not contain subtitle parsing logic. A platform is supported by the generic path only when its master manifest exposes subtitle tracks through `#EXT-X-MEDIA:TYPE=SUBTITLES` and its subtitle payload is HLS/WebVTT.

The proxy tool returns synthetic responses for `https://gss.local`, so original signed CDN URLs remain unchanged. Future translation providers should implement the same interface used by `GSS.GoogleTranslate`. DASH/MPD, TTML/IMSC and non-HLS platforms should be added as separate parser modules rather than enlarging the HLS adapter with special cases.
