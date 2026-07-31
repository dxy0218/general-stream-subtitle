GSS.VTT = (function createVTTTools() {
  function stripTags(text) {
    return String(text || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  }

  function isTimestampLine(line) {
    return /^\s*(?:\d{2,}:)?\d{2}:\d{2}\.\d{3}\s+-->\s+(?:\d{2,}:)?\d{2}:\d{2}\.\d{3}(?:\s|$)/.test(String(line || ""));
  }

  function translatedLines(text) {
    return String(text || "").replace(/\r\n/g, "\n").split("\n").map(function (line) {
      return line.trim();
    }).filter(function (line) { return !!line; });
  }

  function parse(body) {
    var normalized = String(body || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    var lines = normalized.split("\n"), cues = [];

    for (var timestampLine = 0; timestampLine < lines.length; timestampLine += 1) {
      if (!isTimestampLine(lines[timestampLine])) continue;
      var startLine = timestampLine + 1;
      var endLine = startLine;
      // A blank line terminates a WebVTT cue. Stopping at the next timestamp
      // incorrectly captures that cue's optional identifier ("1", "2", ...)
      // as text and produces a malformed translated segment.
      while (endLine < lines.length && lines[endLine].trim() && !isTimestampLine(lines[endLine])) endLine += 1;
      var originalLines = lines.slice(startLine, endLine);
      var plain = stripTags(originalLines.join("\n"));
      if (plain) {
        cues.push({
          timestampLine: timestampLine,
          startLine: startLine,
          endLine: endLine,
          originalLines: originalLines,
          text: plain
        });
      }
    }

    return { lines: lines, cues: cues };
  }

  function uniqueTexts(cues) {
    var texts = [], indexes = {};
    cues.forEach(function (cue) {
      if (indexes[cue.text] === undefined) { indexes[cue.text] = texts.length; texts.push(cue.text); }
      cue.translationIndex = indexes[cue.text];
    });
    return texts;
  }

  function render(parsed, translations, mode, order) {
    var lines = parsed.lines.slice();
    var cues = parsed.cues.slice().sort(function (a, b) { return b.startLine - a.startLine; });
    cues.forEach(function (cue) {
      var translated = translatedLines(translations[cue.translationIndex]);
      if (!translated.length) return;
      var replacement;
      if (mode === "bilingual") {
        replacement = order === "original-first"
          ? cue.originalLines.concat(translated)
          : translated.concat(cue.originalLines);
      } else replacement = translated;
      lines.splice.apply(lines, [cue.startLine, Math.max(0, cue.endLine - cue.startLine)].concat(replacement));
    });
    return lines.join("\n");
  }

  return { parse: parse, uniqueTexts: uniqueTexts, render: render, stripTags: stripTags, isTimestampLine: isTimestampLine };
})();

GSS.Formats.register("vtt", {
  id: "vtt", name: "WebVTT", contentType: "text/vtt; charset=utf-8",
  detect: function (body, url, contentType) {
    return /^\s*WEBVTT/i.test(String(body || "")) || /text\/vtt/i.test(String(contentType || "")) || /\.(vtt|webvtt)$/i.test(String(url || "").split(/[?#]/)[0]);
  },
  parse: GSS.VTT.parse,
  render: GSS.VTT.render
});
