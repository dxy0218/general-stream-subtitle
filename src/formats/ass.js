GSS.Formats.register("ass", (function createAssFormat() {
  function detect(body, url) { return /\.(ass|ssa)$/i.test(String(url || "").split(/[?#]/)[0]) || /\[Script Info\][\s\S]*\[Events\]/i.test(String(body || "")); }
  function strip(text) { return String(text || "").replace(/\{[^}]*\}/g, "").replace(/\\N/g, "\n").trim(); }
  function parse(body) {
    var lines = String(body || "").replace(/\r\n/g, "\n").split("\n"), cues = [], inEvents = false, textIndex = 9;
    lines.forEach(function (line, index) {
      if (/^\[Events\]/i.test(line)) { inEvents = true; return; }
      if (/^\[/.test(line) && !/^\[Events\]/i.test(line)) inEvents = false;
      if (!inEvents) return;
      if (/^Format\s*:/i.test(line)) {
        var fields = line.slice(line.indexOf(":") + 1).split(",").map(function (item) { return item.trim().toLowerCase(); });
        var found = fields.indexOf("text"); if (found >= 0) textIndex = found;
        return;
      }
      if (!/^Dialogue\s*:/i.test(line)) return;
      var prefix = line.slice(0, line.indexOf(":") + 1), raw = line.slice(line.indexOf(":") + 1), parts = raw.split(",");
      if (parts.length <= textIndex) return;
      var before = parts.slice(0, textIndex), original = parts.slice(textIndex).join(","), text = strip(original);
      if (text) cues.push({ lineIndex: index, prefix: prefix, before: before, original: original, text: text });
    });
    return { lines: lines, cues: cues };
  }
  function render(parsed, translations, mode, order) {
    parsed.cues.forEach(function (cue) {
      var translated = String(translations[cue.translationIndex] || "").replace(/\r?\n/g, "\\N").trim();
      if (!translated) return;
      var text = mode === "bilingual" ? (order === "original-first" ? cue.original + "\\N" + translated : translated + "\\N" + cue.original) : translated;
      parsed.lines[cue.lineIndex] = cue.prefix + cue.before.join(",") + "," + text;
    });
    return parsed.lines.join("\n");
  }
  return { id: "ass", name: "ASS / SSA", contentType: "text/plain; charset=utf-8", detect: detect, parse: parse, render: render };
})());
