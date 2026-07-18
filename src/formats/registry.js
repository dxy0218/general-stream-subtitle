GSS.Formats = (function createFormatRegistry() {
  var registry = {};
  function register(id, format) { registry[id] = format; }
  function list() { return Object.keys(registry).map(function (id) { return { id: id, name: registry[id].name || id, binary: !!registry[id].binary }; }); }
  function enabled(id, config) {
    var raw = String(config.formats || "all").toLowerCase();
    if (!raw || raw === "all") return true;
    return raw.split(/[,|]/).map(function (item) { return item.trim(); }).indexOf(id) >= 0;
  }
  function detect(body, url, contentType, config) {
    var ids = Object.keys(registry);
    for (var i = 0; i < ids.length; i += 1) {
      if (!enabled(ids[i], config)) continue;
      if (registry[ids[i]].detect(body, url, contentType)) return registry[ids[i]];
    }
    return null;
  }
  function extension(url) { return GSS.Url.extension(url); }
  function stripTags(text) { return String(text || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim(); }
  function escapeXml(text) { return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function uniqueTexts(cues) {
    var texts = [], indexes = {};
    cues.forEach(function (cue) {
      var key = String(cue.text || "");
      if (indexes[key] === undefined) { indexes[key] = texts.length; texts.push(key); }
      cue.translationIndex = indexes[key];
    });
    return texts;
  }
  return { register: register, list: list, detect: detect, enabled: enabled, extension: extension, stripTags: stripTags, escapeXml: escapeXml, uniqueTexts: uniqueTexts };
})();
