GSS.Formats.register("youtube", (function createYouTubeFormat() {
  function decodeXml(text) {
    return GSS.Formats.stripTags(String(text || "")
      .replace(/&#(\d+);/g, function (_, code) { return String.fromCharCode(Number(code)); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, code) { return String.fromCharCode(parseInt(code, 16)); })
      .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'"));
  }

  function detect(body, url, contentType) {
    var text = String(body || "").trim();
    if (/^\{/.test(text)) {
      try {
        var data = JSON.parse(text);
        return Array.isArray(data.events) && data.events.some(function (event) { return event && (Array.isArray(event.segs) || event.tStartMs !== undefined); });
      } catch (_) {}
    }
    return /<transcript(?:\s|>)/i.test(text) || /<timedtext(?:\s|>)/i.test(text)
      || /<p\b[^>]*(?:\bt=|\bd=)[^>]*>[\s\S]*<\/p>/i.test(text)
      || (/\/api\/timedtext/i.test(String(url || "")) && /<(?:text|p)\b/i.test(text));
  }

  function parseJson(body) {
    var data = JSON.parse(String(body || "")), cues = [];
    (data.events || []).forEach(function (event, index) {
      if (!event || !Array.isArray(event.segs)) return;
      var original = event.segs.map(function (seg) { return seg && typeof seg.utf8 === "string" ? seg.utf8 : ""; }).join("");
      var text = GSS.Formats.stripTags(original);
      if (text) cues.push({ kind: "json3", index: index, original: original, text: text });
    });
    return { kind: "json3", data: data, cues: cues };
  }

  function parseXml(body) {
    var source = String(body || ""), cues = [], transcript = /<transcript(?:\s|>)/i.test(source);
    var regex = transcript ? /<text\b([^>]*)>([\s\S]*?)<\/text>/gi : /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
    var match;
    while ((match = regex.exec(source))) {
      var text = decodeXml(match[2]);
      if (!text) continue;
      cues.push({ kind: transcript ? "transcript" : "srv3", start: match.index, end: regex.lastIndex, attrs: match[1], inner: match[2], text: text });
    }
    return { kind: transcript ? "transcript" : "srv3", source: source, cues: cues };
  }

  function parse(body) {
    var text = String(body || "").trim();
    return /^\{/.test(text) ? parseJson(body) : parseXml(body);
  }

  function combine(original, translated, mode, order) {
    if (mode !== "bilingual") return translated;
    return order === "original-first" ? original + "\n" + translated : translated + "\n" + original;
  }

  function render(parsed, translations, mode, order) {
    if (parsed.kind === "json3") {
      parsed.cues.forEach(function (cue) {
        var translated = String(translations[cue.translationIndex] || "").trim();
        if (!translated) return;
        parsed.data.events[cue.index].segs = [{ utf8: combine(cue.original, translated, mode, order) }];
      });
      return JSON.stringify(parsed.data);
    }
    var source = parsed.source, replacements = [];
    parsed.cues.forEach(function (cue) {
      var translated = String(translations[cue.translationIndex] || "").trim();
      if (!translated) return;
      var original = decodeXml(cue.inner);
      var value = GSS.Formats.escapeXml(combine(original, translated, mode, order)).replace(/\n/g, "&#10;");
      var tag = cue.kind === "transcript" ? "text" : "p";
      if (cue.kind === "srv3") value = "<s>" + value + "</s>";
      replacements.push({ start: cue.start, end: cue.end, value: "<" + tag + cue.attrs + ">" + value + "</" + tag + ">" });
    });
    for (var i = replacements.length - 1; i >= 0; i -= 1) source = source.slice(0, replacements[i].start) + replacements[i].value + source.slice(replacements[i].end);
    return source;
  }

  function contentTypeFor(body, upstreamType) {
    return /^\s*\{/.test(String(body || "")) ? "application/json; charset=utf-8" : (upstreamType || "text/xml; charset=utf-8");
  }

  return { id: "youtube", name: "YouTube timedtext / JSON3 / srv3", contentType: "text/xml; charset=utf-8", detect: detect, parse: parse, render: render, contentTypeFor: contentTypeFor };
})());
