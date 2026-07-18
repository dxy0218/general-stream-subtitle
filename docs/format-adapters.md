# Subtitle Format Adapters

A format adapter implements:

```javascript
{
  id: "format-id",
  name: "Display name",
  contentType: "text/plain; charset=utf-8",
  detect: function (body, url, contentType) {},
  parse: function (body) { return { cues: [] }; },
  render: function (parsed, translations, mode, order) {}
}
```

Each cue must expose a plain `text` field. `GSS.Formats.uniqueTexts` adds `translationIndex` while deduplicating repeated captions.

Adapters should preserve timing, identifiers, styles, speaker tags, and document structure whenever possible. Unsupported binary formats must fail safely rather than being decoded as text.
