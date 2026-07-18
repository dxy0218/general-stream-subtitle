GSS.M3U8 = (function createM3U8Tools() {
  function parseAttributes(line) {
    var colon = line.indexOf(":"), source = colon >= 0 ? line.slice(colon + 1) : line;
    var items = [], buffer = "", quoted = false;
    for (var i = 0; i < source.length; i += 1) {
      var char = source[i];
      if (char === '"') quoted = !quoted;
      if (char === "," && !quoted) { items.push(buffer); buffer = ""; } else buffer += char;
    }
    if (buffer) items.push(buffer);
    var attributes = [];
    items.forEach(function (item) {
      var equals = item.indexOf("=");
      if (equals < 0) return;
      var key = item.slice(0, equals).trim(), raw = item.slice(equals + 1).trim();
      var isQuoted = raw.length >= 2 && raw[0] === '"' && raw[raw.length - 1] === '"';
      attributes.push({ key: key, value: isQuoted ? raw.slice(1, -1) : raw, quoted: isQuoted });
    });
    return attributes;
  }

  function get(attributes, key) {
    key = key.toUpperCase();
    for (var i = 0; i < attributes.length; i += 1) if (attributes[i].key.toUpperCase() === key) return attributes[i].value;
    return null;
  }

  function set(attributes, key, value, quoted) {
    var upper = key.toUpperCase();
    for (var i = 0; i < attributes.length; i += 1) {
      if (attributes[i].key.toUpperCase() === upper) { attributes[i].value = value; attributes[i].quoted = quoted; return; }
    }
    attributes.push({ key: key, value: value, quoted: quoted });
  }

  function serialize(tag, attributes) {
    return tag + ":" + attributes.map(function (attribute) {
      var value = attribute.quoted ? '"' + String(attribute.value).replace(/"/g, "") + '"' : attribute.value;
      return attribute.key + "=" + value;
    }).join(",");
  }

  function isSourceTrack(attributes, sourceLanguage) {
    var language = String(get(attributes, "LANGUAGE") || "").toLowerCase();
    var name = String(get(attributes, "NAME") || "").toLowerCase();
    var wanted = String(sourceLanguage || "en").toLowerCase();
    return language === wanted || language.indexOf(wanted + "-") === 0 || (wanted === "en" && /\benglish\b/.test(name));
  }

  function duplicateTrack(line, requestUrl, mode, config) {
    var tag = line.slice(0, line.indexOf(":"));
    var attributes = parseAttributes(line);
    var originalUri = get(attributes, "URI");
    if (!originalUri) return null;
    var absoluteOrigin = GSS.Url.resolve(requestUrl, originalUri);
    var name = mode === "bilingual" ? config.trackName : config.translatedTrackName;
    set(attributes, "NAME", name, true);
    set(attributes, "LANGUAGE", config.target, true);
    set(attributes, "DEFAULT", "NO", false);
    set(attributes, "AUTOSELECT", "YES", false);
    set(attributes, "FORCED", "NO", false);
    set(attributes, "URI", GSS.Url.virtual(config.virtualOrigin, "/playlist", {
      origin: absoluteOrigin,
      mode: mode,
      source: config.source,
      target: config.target,
      version: GSS.VERSION
    }), true);
    return serialize(tag, attributes);
  }

  function injectTracks(body, requestUrl, config, logger) {
    if (!config.enabled || !body || body.indexOf("#EXTM3U") < 0) return body;
    if (body.indexOf("gss.local/playlist") >= 0) return body;
    var lines = body.replace(/\r\n/g, "\n").split("\n"), output = [], injected = 0;
    lines.forEach(function (line) {
      output.push(line);
      if (line.indexOf("#EXT-X-MEDIA:") !== 0) return;
      var attributes = parseAttributes(line);
      if (String(get(attributes, "TYPE") || "").toUpperCase() !== "SUBTITLES") return;
      if (String(get(attributes, "FORCED") || "").toUpperCase() === "YES") return;
      if (!get(attributes, "URI") || !isSourceTrack(attributes, config.source)) return;
      var bilingual = duplicateTrack(line, requestUrl, "bilingual", config);
      if (bilingual) { output.push(bilingual); injected += 1; }
      if (config.injectTranslated) {
        var translated = duplicateTrack(line, requestUrl, "translate", config);
        if (translated) { output.push(translated); injected += 1; }
      }
    });
    logger.info("master manifest inspected", { injected: injected, trackName: config.trackName });
    return injected ? output.join("\n") : body;
  }

  function decorateSubtitlePlaylist(body, originUrl, mode, source, target, config, logger) {
    if (!body || body.indexOf("#EXTM3U") < 0) return body;
    var changed = 0;
    var output = body.replace(/\r\n/g, "\n").split("\n").map(function (line) {
      var trimmed = line.trim();
      if (!trimmed || trimmed[0] === "#") return line;
      changed += 1;
      return GSS.Url.virtual(config.virtualOrigin, "/subtitle", {
        origin: GSS.Url.resolve(originUrl, trimmed),
        mode: mode,
        source: source,
        target: target,
        version: GSS.VERSION
      });
    });
    logger.info("subtitle playlist virtualized", { segments: changed, mode: mode });
    return changed ? output.join("\n") : body;
  }

  return {
    parseAttributes: parseAttributes,
    injectTracks: injectTracks,
    decorateSubtitlePlaylist: decorateSubtitlePlaylist
  };
})();
