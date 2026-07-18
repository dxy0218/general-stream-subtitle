GSS.Formats.register("json", (function createJsonFormat() {
  function detect(body, url, contentType) {
    if (!(/\.json$/i.test(String(url || "").split(/[?#]/)[0]) || /application\/json/i.test(String(contentType || "")))) return false;
    try { var data = JSON.parse(String(body || "")); return Array.isArray(data) || Array.isArray(data.cues) || Array.isArray(data.subtitles) || Array.isArray(data.events); } catch (_) { return false; }
  }
  function locate(data) {
    if (Array.isArray(data)) return data;
    return data.cues || data.subtitles || data.events || [];
  }
  function field(row) {
    if (typeof row === "string") return "__string";
    var names = ["text", "content", "caption", "subtitle", "body", "value"];
    for (var i = 0; i < names.length; i += 1) if (typeof row[names[i]] === "string") return names[i];
    return null;
  }
  function parse(body) {
    var data = JSON.parse(String(body || "")), rows = locate(data), cues = [];
    rows.forEach(function (row, index) {
      var key = field(row), value = key === "__string" ? row : key ? row[key] : "";
      var text = GSS.Formats.stripTags(value);
      if (text) cues.push({ index: index, key: key, original: value, text: text });
    });
    return { data: data, rows: rows, cues: cues };
  }
  function render(parsed, translations, mode, order) {
    parsed.cues.forEach(function (cue) {
      var translated = String(translations[cue.translationIndex] || "").trim();
      if (!translated) return;
      var value = mode === "bilingual" ? (order === "original-first" ? cue.original + "\n" + translated : translated + "\n" + cue.original) : translated;
      if (cue.key === "__string") parsed.rows[cue.index] = value; else parsed.rows[cue.index][cue.key] = value;
    });
    return JSON.stringify(parsed.data);
  }
  return { id: "json", name: "Generic JSON Cues", contentType: "application/json; charset=utf-8", detect: detect, parse: parse, render: render };
})());
