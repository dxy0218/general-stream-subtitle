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

  function candidateScore(attributes, config) {
    var name = String(get(attributes, "NAME") || "");
    var language = String(get(attributes, "LANGUAGE") || "");
    var score = 0;
    if (String(get(attributes, "DEFAULT") || "").toUpperCase() === "YES") score += 100;
    if (String(get(attributes, "AUTOSELECT") || "").toUpperCase() === "YES") score += 10;
    score += GSS.Language.priority(language, name, config.sourcePriority);
    if (/\b(sdh|cc|closed captions?|descriptive|audio description)\b/i.test(name)) score -= 8;
    return score;
  }

  function chooseSourceTrack(lines, config) {
    var candidates = [];
    lines.forEach(function (line, index) {
      if (line.indexOf("#EXT-X-MEDIA:") !== 0) return;
      var attributes = parseAttributes(line);
      if (String(get(attributes, "TYPE") || "").toUpperCase() !== "SUBTITLES") return;
      if (String(get(attributes, "FORCED") || "").toUpperCase() === "YES") return;
      if (!get(attributes, "URI")) return;
      var language = String(get(attributes, "LANGUAGE") || "");
      var name = String(get(attributes, "NAME") || "");
      if (!GSS.Language.matches(language, name, config.source)) return;
      candidates.push({
        index: index,
        line: line,
        attributes: attributes,
        language: language,
        name: name,
        score: candidateScore(attributes, config)
      });
    });
    if (!candidates.length) return null;
    candidates.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });
    return candidates[0];
  }

  function duplicateTrack(candidate, requestUrl, mode, config, platform) {
    var tag = candidate.line.slice(0, candidate.line.indexOf(":"));
    var attributes = parseAttributes(candidate.line);
    var originalUri = get(attributes, "URI");
    if (!originalUri) return null;
    var absoluteOrigin = GSS.Url.resolve(requestUrl, originalUri);
    var name = mode === "bilingual" ? config.trackName : config.translatedTrackName;
    var source = GSS.Language.googleSource(candidate.language, config.source);
    set(attributes, "NAME", name, true);
    set(attributes, "LANGUAGE", config.target, true);
    set(attributes, "DEFAULT", "NO", false);
    set(attributes, "AUTOSELECT", "YES", false);
    set(attributes, "FORCED", "NO", false);
    set(attributes, "URI", GSS.Url.virtual(config.virtualOrigin, "/playlist", {
      origin: absoluteOrigin,
      mode: mode,
      source: source,
      target: config.target,
      platform: platform ? platform.id : "unknown",
      version: GSS.VERSION
    }), true);
    return serialize(tag, attributes);
  }

  function injectTracks(body, requestUrl, config, logger, platform) {
    if (!config.enabled || !body || body.indexOf("#EXTM3U") < 0) return body;
    if (body.indexOf("gss.local/playlist") >= 0) return body;
    var lines = body.replace(/\r\n/g, "\n").split("\n");
    var selected = chooseSourceTrack(lines, config);
    if (!selected) {
      logger.info("master manifest inspected", {
        platform: platform ? platform.id : "unknown",
        injected: 0,
        source: config.source,
        reason: "no matching subtitle track"
      });
      return body;
    }

    var output = [], injected = 0;
    lines.forEach(function (line, index) {
      output.push(line);
      if (index !== selected.index) return;
      var bilingual = duplicateTrack(selected, requestUrl, "bilingual", config, platform);
      if (bilingual) { output.push(bilingual); injected += 1; }
      if (config.injectTranslated) {
        var translated = duplicateTrack(selected, requestUrl, "translate", config, platform);
        if (translated) { output.push(translated); injected += 1; }
      }
    });
    logger.info("master manifest inspected", {
      platform: platform ? platform.id : "unknown",
      injected: injected,
      trackName: config.trackName,
      selectedName: selected.name,
      selectedLanguage: selected.language || "auto",
      configuredSource: config.source
    });
    return injected ? output.join("\n") : body;
  }

  function decorateSubtitlePlaylist(body, originUrl, mode, source, target, config, logger, platform) {
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
        platform: platform || "unknown",
        version: GSS.VERSION
      });
    });
    logger.info("subtitle playlist virtualized", { segments: changed, mode: mode, platform: platform || "unknown" });
    return changed ? output.join("\n") : body;
  }

  return {
    parseAttributes: parseAttributes,
    chooseSourceTrack: chooseSourceTrack,
    injectTracks: injectTracks,
    decorateSubtitlePlaylist: decorateSubtitlePlaylist
  };
})();
