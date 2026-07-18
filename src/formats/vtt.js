GSS.VTT = (function createVTTTools() {
  function stripTags(text) {
    return String(text || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  }
  function parse(body) {
    var normalized = String(body || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    var blocks = normalized.split(/\n{2,}/), cues = [];
    blocks.forEach(function (block, blockIndex) {
      var lines = block.split("\n"), timestampIndex = -1;
      for (var i = 0; i < lines.length; i += 1) if (lines[i].indexOf("-->") >= 0) { timestampIndex = i; break; }
      if (timestampIndex < 0 || timestampIndex >= lines.length - 1) return;
      var originalLines = lines.slice(timestampIndex + 1), plain = stripTags(originalLines.join("\n"));
      if (!plain) return;
      cues.push({ blockIndex: blockIndex, timestampIndex: timestampIndex, originalLines: originalLines, text: plain });
    });
    return { blocks: blocks, cues: cues };
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
    parsed.cues.forEach(function (cue) {
      var blockLines = parsed.blocks[cue.blockIndex].split("\n");
      var translated = String(translations[cue.translationIndex] || "").trim();
      if (!translated) return;
      var replacement;
      if (mode === "bilingual") {
        replacement = order === "original-first" ? cue.originalLines.concat([translated]) : [translated].concat(cue.originalLines);
      } else replacement = translated.split("\n");
      parsed.blocks[cue.blockIndex] = blockLines.slice(0, cue.timestampIndex + 1).concat(replacement).join("\n");
    });
    return parsed.blocks.join("\n\n");
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
