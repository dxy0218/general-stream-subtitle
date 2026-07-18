# Changelog

## 0.5.0

- Add YouTube, Shorts, YouTube Live and YouTube TV player-response adapters.
- Inject `Translate-zh` into YouTube `captionTracks`.
- Support manual captions and YouTube ASR/auto-generated captions.
- Add direct timedtext interception and virtual-gateway fallback strategies.
- Add YouTube timedtext XML, srv3 and JSON3 subtitle formats.
- Forward live caption sequence parameters through the virtual gateway.
- Detect but do not decode binary-only embedded CEA-608/708 streams.

## 0.4.0

- Add pluggable translation providers, multiple text formats and experimental DASH/platform adapters.
