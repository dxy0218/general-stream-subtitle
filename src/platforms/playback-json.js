GSS.PlaybackJson = (function createPlaybackJsonAdapter() {
  var SPECIFIC_ARRAY = /^(subtitles?|subtitleTracks?|textTracks?|captionTracks?|captions?|closedCaptions?)$/i;
  var GENERIC_ARRAY = /^(tracks?|renditions?|mediaTracks?|assets?)$/i;
  var URL_KEYS = ["url", "uri", "src", "source", "baseUrl", "downloadUrl", "manifestUrl", "file"];
  var LANGUAGE_KEYS = ["language", "lang", "languageCode", "srclang", "locale"];
  var LABEL_KEYS = ["label", "name", "displayName", "title"];
  var ID_KEYS = ["id", "trackId", "assetId", "renditionId"];

  function firstString(object, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      if (typeof object[keys[i]] === "string" && object[keys[i]]) return { key: keys[i], value: object[keys[i]] };
    }
    return null;
  }

  function descriptor(item) {
    return [item.kind, item.type, item.role, item.format, item.mimeType, item.codec, item.label, item.name]
      .filter(function (value) { return typeof value === "string"; }).join(" ");
  }

  function isTextTrack(item, parentKey) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    var url = firstString(item, URL_KEYS);
    if (!url) return false;
    if (SPECIFIC_ARRAY.test(parentKey)) return true;
    var details = descriptor(item);
    if (/(subtitle|caption|closed.?caption|text|webvtt|vtt|ttml|dfxp|imsc|srt)/i.test(details)) return true;
    var extension = GSS.Url.extension(url.value);
    return /^(vtt|srt|ttml|dfxp|xml|json)$/.test(extension);
  }

  function languageOf(item) {
    var found = firstString(item, LANGUAGE_KEYS);
    return found ? found.value : "";
  }

  function labelOf(item) {
    var found = firstString(item, LABEL_KEYS);
    return found ? found.value : "";
  }

  function score(item, config) {
    var language = languageOf(item), label = labelOf(item), value = 0;
    value += GSS.Language.priority(language, label, config.sourcePriority);
    if (item.default === true || item.isDefault === true || item.selected === true) value += 80;
    if (/forced/i.test(descriptor(item))) value -= 100;
    if (/(sdh|closed.?caption|cc)/i.test(label)) value -= 4;
    return value;
  }

  function choose(array, parentKey, config) {
    var candidates = [];
    array.forEach(function (item, index) {
      if (!isTextTrack(item, parentKey)) return;
      var language = languageOf(item), label = labelOf(item);
      if (!GSS.Language.matches(language, label, config.source)) return;
      candidates.push({ item: item, index: index, score: score(item, config) });
    });
    candidates.sort(function (a, b) { return b.score - a.score || a.index - b.index; });
    return candidates[0] || null;
  }

  function setExistingOrDefault(object, keys, value, fallbackKey) {
    var changed = false;
    keys.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(object, key)) { object[key] = value; changed = true; }
    });
    if (!changed && fallbackKey) object[fallbackKey] = value;
  }

  function routeFor(item, origin) {
    var details = descriptor(item);
    return GSS.Url.extension(origin) === "m3u8" || /hls/i.test(details) ? "/playlist" : "/subtitle";
  }

  function duplicate(item, requestUrl, config, platform) {
    var cloned = JSON.parse(JSON.stringify(item));
    var urlField = firstString(cloned, URL_KEYS);
    if (!urlField) return null;
    var absolute = GSS.Url.resolve(requestUrl, urlField.value);
    cloned[urlField.key] = GSS.Url.virtual(config.virtualOrigin, routeFor(cloned, absolute), {
      origin: absolute,
      mode: "bilingual",
      source: GSS.Language.googleSource(languageOf(cloned), config.source),
      target: config.target,
      platform: platform ? platform.id : "unknown",
      version: GSS.VERSION
    });
    setExistingOrDefault(cloned, LABEL_KEYS, config.trackName, "label");
    setExistingOrDefault(cloned, LANGUAGE_KEYS, config.target, "language");
    ID_KEYS.forEach(function (key) {
      if (typeof cloned[key] === "string" || typeof cloned[key] === "number") cloned[key] = String(cloned[key]) + "-gss";
    });
    ["default", "isDefault", "selected", "autoSelect", "autoselect", "forced", "isForced"].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(cloned, key)) cloned[key] = false;
    });
    cloned.gssTranslated = true;
    return cloned;
  }

  function hasInjected(array, config) {
    return array.some(function (item) {
      return item && typeof item === "object" && (item.gssTranslated === true || labelOf(item) === config.trackName);
    });
  }

  function inject(body, requestUrl, config, logger, platform) {
    var value;
    try { value = JSON.parse(String(body || "")); }
    catch (_) { return { body: body, changed: false, summary: { reason: "invalid json" } }; }

    var summary = { arraysInspected: 0, textTracks: 0, arraysChanged: 0, injected: 0, selectedLanguage: "", selectedName: "" };
    var maxInjections = 4;

    function walk(node, key, depth) {
      if (!node || depth > 9 || summary.injected >= maxInjections) return;
      if (Array.isArray(node)) {
        var relevantKey = SPECIFIC_ARRAY.test(key || "") || GENERIC_ARRAY.test(key || "");
        if (relevantKey) {
          summary.arraysInspected += 1;
          var count = node.filter(function (item) { return isTextTrack(item, key || ""); }).length;
          summary.textTracks += count;
          if (count && !hasInjected(node, config)) {
            var selected = choose(node, key || "", config);
            if (selected) {
              var cloned = duplicate(selected.item, requestUrl, config, platform);
              if (cloned) {
                node.splice(selected.index + 1, 0, cloned);
                summary.arraysChanged += 1;
                summary.injected += 1;
                summary.selectedLanguage = languageOf(selected.item) || "auto";
                summary.selectedName = labelOf(selected.item) || "";
              }
            }
          }
        }
        node.forEach(function (item) { walk(item, key, depth + 1); });
        return;
      }
      if (typeof node === "object") {
        Object.keys(node).forEach(function (childKey) { walk(node[childKey], childKey, depth + 1); });
      }
    }

    walk(value, "", 0);
    if (summary.injected) {
      logger.info("playback JSON inspected", {
        platform: platform ? platform.id : "unknown", injected: summary.injected,
        selectedName: summary.selectedName, selectedLanguage: summary.selectedLanguage
      });
      return { body: JSON.stringify(value), changed: true, summary: summary };
    }
    summary.reason = summary.textTracks ? "no matching text track" : "no supported text-track array";
    logger.info("playback JSON inspected", { platform: platform ? platform.id : "unknown", injected: 0, reason: summary.reason, arrays: summary.arraysInspected, textTracks: summary.textTracks });
    return { body: body, changed: false, summary: summary };
  }

  return { inject: inject };
})();
