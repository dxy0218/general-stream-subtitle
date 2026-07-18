GSS.Formats.register("ttml", (function createTtmlFormat() {
  function detect(body, url, contentType) {
    var clean = String(url || "").split(/[?#]/)[0];
    return /\.(ttml2?|dfxp|xml)$/i.test(clean) || /(application|text)\/(ttml\+xml|xml)/i.test(String(contentType || "")) || /<tt(?:\s|>)[\s\S]*<body(?:\s|>)/i.test(String(body || ""));
  }
  function decode(text) {
    return GSS.Formats.stripTags(String(text || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
  }
  function parse(body) {
    var source = String(body || ""), cues = [], regex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi, match;
    while ((match = regex.exec(source))) {
      var text = decode(match[2]);
      if (!text) continue;
      cues.push({ start: match.index, end: regex.lastIndex, attrs: match[1], inner: match[2], text: text });
    }
    return { source: source, cues: cues };
  }
  function render(parsed, translations, mode, order) {
    var source = parsed.source, replacements = [];
    parsed.cues.forEach(function (cue) {
      var translated = GSS.Formats.escapeXml(String(translations[cue.translationIndex] || "").trim()).replace(/\n/g, "<br/>");
      if (!translated) return;
      var original = cue.inner;
      var inner = mode === "bilingual" ? (order === "original-first" ? original + "<br/>" + translated : translated + "<br/>" + original) : translated;
      replacements.push({ start: cue.start, end: cue.end, value: "<p" + cue.attrs + ">" + inner + "</p>" });
    });
    for (var i = replacements.length - 1; i >= 0; i -= 1) source = source.slice(0, replacements[i].start) + replacements[i].value + source.slice(replacements[i].end);
    return source;
  }
  return { id: "ttml", name: "TTML / DFXP / IMSC Text", contentType: "application/ttml+xml; charset=utf-8", detect: detect, parse: parse, render: render };
})());
