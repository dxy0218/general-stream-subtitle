# Architecture

```text
Platform adapter
  ├─ HLS manifest adapter
  ├─ experimental simple DASH adapter
  └─ YouTube player/caption adapter
        ↓
Virtual gss.local subtitle URL or direct timedtext interception
        ↓
Format registry
  ├─ YouTube timedtext / JSON3 / srv3
  ├─ WebVTT
  ├─ SRT
  ├─ TTML/DFXP/IMSC Text
  ├─ ASS/SSA
  └─ JSON cues
        ↓
Provider registry and fallback chain
        ↓
Format renderer → translated or bilingual subtitle
```

Source files stay modular. GitHub Actions can produce runtime bundles; the checked-in runtime may use a versioned cached loader during development releases.
