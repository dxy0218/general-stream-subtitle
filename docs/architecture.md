# Architecture

General Stream Subtitle keeps source modules small and emits two runtime bundles:

- `manifest.js`: response hook for platform master manifests.
- `gateway.js`: request hook for virtual subtitle playlists, subtitle segments and the settings page.

The Max adapter injects `https://gss.local` URLs. The proxy tool returns synthetic responses for those URLs, so the original signed CDN URLs remain unchanged. Future providers should implement the same translator interface used by `GSS.GoogleTranslate`.
