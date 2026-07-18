GSS.Formats.register("srt", (function createSrtFormat() {
  function detect(body, url, contentType) {
    return /\.srt$/i.test(String(url || "").split(/[?#]/)[0]) || /application\/x-subrip/i.test(String(contentType || "")) || /(?:^|\n)\d+\s*\n\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->/.test(String(body || ""));
  }
  function parse(body) {
    var blocks = String(body || "").replace(/\r\n/g, "\n").trim().split(/\n{2,}/), cues = [];
    blocks.forEach(function (block, index) {
      var lines = block.split("\n"), timeIndex = -1;
      for (var i = 0; i < lines.length; i += 1) if (lines[i].indexOf("-->") >= 0) { timeIndex = i; break; }
      if (timeIndex < 0 || timeIndex >= lines.length - 1) return;
      var originalLines = lines.slice(timeIndex + 1), text = GSS.Formats.stripTags(originalLines.join("\n"));
      if (text) cues.push({ blockIndex: index, timeIndex: timeIndex, originalLines: originalLines, text: text });
    });
    return { blocks: blocks, cues: cues };
  }
  function render(parsed, translations, mode, order) {
    parsed.cues.forEach(function (cue) {
      var lines = parsed.blocks[cue.blockIndex].split("\n"), translated = String(translations[cue.translationIndex] || "").trim();
      if (!translated) return;
      var replacement = mode === "bilingual" ? (order === "original-first" ? cue.originalLines.concat([translated]) : [translated].concat(cue.originalLines)) : translated.split("\n");
      parsed.blocks[cue.blockIndex] = lines.slice(0, cue.timeIndex + 1).concat(replacement).join("\n");
    });
    return parsed.blocks.join("\n\n") + "\n";
  }
  return { id: "srt", name: "SubRip / SRT", contentType: "application/x-subrip; charset=utf-8", detect: detect, parse: parse, render: render };
})());
