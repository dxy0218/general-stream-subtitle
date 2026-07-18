GSS.VTT = (function createVTTTools() {
  function stripTags(text) {
    return String(text || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  }

  function parse(body) {
    var normalized = String(body || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    var lines = normalized.split("\n"), cues = [];
    var timestamps = [];

    for (var i = 0; i < lines.length; i += 1) {
      if (lines[i].indexOf("-->") >= 0) timestamps.push(i);
    }

    for (var t = 0; t < timestamps.length; t += 1) {
      var timestampLine = timestamps[t];
      var startLine = timestampLine + 1;
      var endLine = t + 1 < timestamps.length ? timestamps[t + 1] : lines.length;
      while (endLine > startLine && !lines[endLine - 1].trim()) endLine -= 1;
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
      var translated = String(translations[cue.translationIndex] || "").trim();
      if (!translated) return;
      var replacement;
      if (mode === "bilingual") {
        replacement = order === "original-first"
          ? cue.originalLines.concat(translated.split("\n"))
          : translated.split("\n").concat(cue.originalLines);
      } else replacement = translated.split("\n");
      lines.splice.apply(lines, [cue.startLine, Math.max(0, cue.endLine - cue.startLine)].concat(replacement));
    });
    return lines.join("\n");
  }

  return { parse: parse, uniqueTexts: uniqueTexts, render: render, stripTags: stripTags };
})();

GSS.Formats.register("vtt", {
  id: "vtt", name: "WebVTT", contentType: "text/vtt; charset=utf-8",
  detect: function (body, url, contentType) {
    return /^\s*WEBVTT/i.test(String(body || "")) || /text\/vtt/i.test(String(contentType || "")) || /\.(vtt|webvtt)$/i.test(String(url || "").split(/[?#]/)[0]);
  },
  parse: GSS.VTT.parse,
  render: GSS.VTT.render
});