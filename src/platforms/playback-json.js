GSS.PlaybackJson = (function createPlaybackJsonAdapter() {
  var SPECIFIC_ARRAY = /^(subtitles?|subtitleTracks?|textTracks?|captionTracks?|captions?|closedCaptions?)$/i;
  var GENERIC_ARRAY = /^(tracks?|renditions?|mediaTracks?|assets?)$/i;
  var PARAMOUNT_ARRAY = /^(?:itemList|items)$/i;
  var CAPTION_URL_KEYS = ["webVTTCaptionURL", "webVttCaptionUrl", "closedCaptionURL", "closedCaptionUrl", "sMPTE-TTCCURL", "smpteTtccUrl", "subtitleUrl", "captionUrl"];
  var URL_KEYS = CAPTION_URL_KEYS.concat(["url", "uri", "src", "source", "href", "baseUrl", "downloadUrl", "manifestUrl", "streamUrl", "file"]);
  var LANGUAGE_KEYS = ["language", "lang", "languageCode", "languageTag", "srclang", "locale"];
  var LABEL_KEYS = ["label", "name", "displayName", "display_name", "title"];
  var ID_KEYS = ["id", "trackId", "assetId", "renditionId"];
  var SKIP_OBJECT = /^(ads?|advertising|analytics|beacons?|drm|images?|artwork|telemetry|tracking)$/i;

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

  function isVirtualUrl(value) {
    return /(?:gss\.local|example\.com)\/(?:manifest|playlist|subtitle)/.test(String(value || ""));
  }

  function isKnownParamountManifest(url) {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
    if (GSS.Url.extension(url) !== "m3u8") return false;
    var host = GSS.Url.host(url);
    return /(^|\.)(?:pplus\.paramount\.tech|paramount\.tech|cbsaavideo\.com|cbsivideo\.com)$/.test(host)
      || /^(?:[^.]+-pplus|cc)\.cbs\.com$/.test(host)
      || host === "cbsi.live.ott.irdeto.com"
      || host === "splice-media.paramountplus.com";
  }

  function isParamountSubtitleManifest(url, key) {
    var captionField = CAPTION_URL_KEYS.some(function (candidate) {
      return String(candidate).toLowerCase() === String(key || "").toLowerCase();
    });
    if (captionField) return true;
    var path = GSS.Url.path(url).toLowerCase();
    return /(?:^|\/)(?:stream_vtt|manifest_[^/]*|[^/]*(?:subtitle|caption|webvtt|text)[^/]*)\.m3u8$/.test(path)
      || /\/(?:subtitles?|captions?|webvtt|text)\//.test(path);
  }

  function virtualizeCaptionFields(item, requestUrl, config, platform, remaining) {
    if (!platform || !/^(?:paramount|paramount-live)$/.test(platform.id) || remaining <= 0) return 0;
    var changed = 0;
    var language = languageOf(item);
    if (language && !GSS.Language.matches(language, labelOf(item), config.source)) return 0;
    CAPTION_URL_KEYS.forEach(function (key) {
      if (changed >= remaining || typeof item[key] !== "string" || !item[key] || isVirtualUrl(item[key])) return;
      var absolute = GSS.Url.resolve(requestUrl, item[key]);
      if (!/^(?:m3u8|vtt|srt|ttml|dfxp|xml|json)$/.test(GSS.Url.extension(absolute))) return;
      item[key] = GSS.Url.virtual(config.virtualOrigin, GSS.Url.extension(absolute) === "m3u8" ? "/playlist" : "/subtitle", {
        origin: absolute,
        mode: "bilingual",
        source: GSS.Language.googleSource(language, config.source),
        target: config.target,
        platform: platform.id,
        strategy: "replace-source",
        version: GSS.VERSION
      });
      changed += 1;
    });
    return changed;
  }

  function virtualize(item, requestUrl, config, platform) {
    var urlField = firstString(item, URL_KEYS);
    if (!urlField) return false;
    var absolute = GSS.Url.resolve(requestUrl, urlField.value);
    item[urlField.key] = GSS.Url.virtual(config.virtualOrigin, routeFor(item, absolute), {
      origin: absolute,
      mode: "bilingual",
      source: GSS.Language.googleSource(languageOf(item), config.source),
      target: config.target,
      platform: platform ? platform.id : "unknown",
      strategy: "replace-source",
      version: GSS.VERSION
    });
    return true;
  }

  function hasInjected(array, config) {
    return array.some(function (item) {
      var url = item && typeof item === "object" ? firstString(item, URL_KEYS) : null;
      return item && typeof item === "object" && (item.gssTranslated === true || labelOf(item) === config.trackName
        || (url && /(?:gss\.local|example\.com)\/(?:playlist|subtitle)/.test(url.value)));
    });
  }

  function refreshParamountManifests(body, logger, platform, options) {
    options = options || {};
    var value;
    try { value = JSON.parse(String(body || "")); }
    catch (_) { return { body: body, changed: false, summary: { reason: "invalid json" } }; }

    var summary = { manifests: 0, unsignedManifests: 0, signedManifestsSkipped: 0, nodesVisited: 0 };
    var maxNodes = 5000;

    function refreshUrl(url) {
      if (!isKnownParamountManifest(url)) return url;
      summary.manifests += 1;
      // Do not alter signed CDN URLs. The observed tvOS VOD master is public
      // and query-free; changing an authenticated query could break playback.
      if (url.indexOf("?") >= 0) { summary.signedManifestsSkipped += 1; return url; }
      summary.unsignedManifests += 1;
      return url + "?gss_manifest_version=" + encodeURIComponent(GSS.VERSION);
    }

    function walk(node, depth) {
      summary.nodesVisited += 1;
      if (!node || depth > 9 || summary.nodesVisited > maxNodes) return;
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i += 1) {
          if (typeof node[i] === "string") node[i] = refreshUrl(node[i]);
          else walk(node[i], depth + 1);
        }
        return;
      }
      if (typeof node !== "object") return;
      Object.keys(node).forEach(function (key) {
        if (typeof node[key] === "string") node[key] = refreshUrl(node[key]);
        else walk(node[key], depth + 1);
      });
    }

    walk(value, 0);
    var changed = summary.unsignedManifests > 0;
    summary.reason = changed ? "unsigned HLS manifest cache refreshed"
      : (summary.manifests ? "only signed HLS manifests found" : "no supported HLS manifest URL");
    if (changed && options.logChanged !== false) logger.warn(options.changedMessage || "Paramount session HLS manifest cache refreshed", {
      platform: platform ? platform.id : "unknown",
      endpoint: options.endpoint || "session-token",
      manifests: summary.unsignedManifests,
      signedSkipped: summary.signedManifestsSkipped
    });
    else if (!changed && options.logMissing !== false) logger.warn(options.missingMessage || "Paramount session exposed no refreshable HLS manifest URL", {
      platform: platform ? platform.id : "unknown",
      endpoint: options.endpoint || "session-token",
      reason: summary.reason,
      manifests: summary.manifests,
      signedSkipped: summary.signedManifestsSkipped,
      nodesVisited: summary.nodesVisited
    });
    return { body: changed ? JSON.stringify(value) : body, changed: changed, summary: summary };
  }

  function proxyParamountManifests(body, config, logger, platform, endpoint) {
    var value;
    try { value = JSON.parse(String(body || "")); }
    catch (_) { return { body: body, changed: false, summary: { reason: "invalid json" } }; }

    var summary = { manifests: 0, unsignedManifests: 0, signedManifestsSkipped: 0, nodesVisited: 0 };
    var maxNodes = 5000;

    function proxyUrl(url, key) {
      if (!isKnownParamountManifest(url) || isVirtualUrl(url) || isParamountSubtitleManifest(url, key)) return url;
      summary.manifests += 1;
      if (url.indexOf("?") >= 0) { summary.signedManifestsSkipped += 1; return url; }
      summary.unsignedManifests += 1;
      return GSS.Url.virtual(config.virtualOrigin, "/manifest", {
        origin: url,
        mode: "bilingual",
        source: config.source,
        target: config.target,
        platform: platform ? platform.id : "paramount",
        version: GSS.VERSION
      });
    }

    function walk(node, depth, parentKey) {
      summary.nodesVisited += 1;
      if (!node || depth > 9 || summary.nodesVisited > maxNodes) return;
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i += 1) {
          if (typeof node[i] === "string") node[i] = proxyUrl(node[i], parentKey);
          else walk(node[i], depth + 1, parentKey);
        }
        return;
      }
      if (typeof node !== "object") return;
      Object.keys(node).forEach(function (key) {
        if (typeof node[key] === "string") node[key] = proxyUrl(node[key], key);
        else walk(node[key], depth + 1, key);
      });
    }

    walk(value, 0, "");
    var changed = summary.unsignedManifests > 0;
    summary.reason = changed ? "unsigned HLS manifest routed through Gateway"
      : (summary.manifests ? "only signed HLS manifests found" : "no supported HLS manifest URL");
    if (changed) logger.warn("Paramount playback manifest routed through Gateway", {
      platform: platform ? platform.id : "unknown",
      endpoint: endpoint || "playback-metadata",
      manifests: summary.unsignedManifests,
      signedSkipped: summary.signedManifestsSkipped
    });
    return { body: changed ? JSON.stringify(value) : body, changed: changed, summary: summary };
  }

  function adaptParamountPlayback(body, requestUrl, config, logger, platform, endpoint) {
    // Paramount tvOS strips or bypasses an added query string and resumes
    // directly at media segments. Give AVPlayer an unmistakably different
    // master URL whose response is produced by the local Gateway instead.
    var proxied = proxyParamountManifests(body, config, logger, platform, endpoint);
    var injected = inject(proxied.body, requestUrl, config, logger, platform);
    var summary = injected.summary || {};
    summary.manifests = proxied.summary && proxied.summary.manifests || 0;
    summary.unsignedManifests = proxied.summary && proxied.summary.unsignedManifests || 0;
    summary.signedManifestsSkipped = proxied.summary && proxied.summary.signedManifestsSkipped || 0;
    summary.manifestProxyReason = proxied.summary && proxied.summary.reason || "";
    return {
      body: injected.body,
      changed: !!(proxied.changed || injected.changed),
      summary: summary
    };
  }

  function inject(body, requestUrl, config, logger, platform) {
    var value;
    try { value = JSON.parse(String(body || "")); }
    catch (_) { return { body: body, changed: false, summary: { reason: "invalid json" } }; }

    var replaceSource = GSS.Platforms.useSourceReplacement(platform, config);
    var summary = { arraysInspected: 0, textTracks: 0, arraysChanged: 0, scalarCaptionUrls: 0, injected: 0, selectedLanguage: "", selectedName: "", strategy: replaceSource ? "replace-source" : "duplicate" };
    var maxInjections = 4;
    var maxNodes = 5000;
    var nodesVisited = 0;

    function walk(node, key, depth) {
      nodesVisited += 1;
      if (!node || depth > 9 || nodesVisited > maxNodes || summary.injected >= maxInjections) return;
      if (Array.isArray(node)) {
        var relevantKey = SPECIFIC_ARRAY.test(key || "") || GENERIC_ARRAY.test(key || "")
          || (/^(?:paramount|paramount-live)$/.test(platform && platform.id || "") && PARAMOUNT_ARRAY.test(key || ""));
        if (relevantKey) {
          summary.arraysInspected += 1;
          var count = node.filter(function (item) { return isTextTrack(item, key || ""); }).length;
          summary.textTracks += count;
          if (count && !hasInjected(node, config)) {
            var selected = choose(node, key || "", config);
            if (selected) {
              var changed = replaceSource
                ? virtualize(selected.item, requestUrl, config, platform)
                : duplicate(selected.item, requestUrl, config, platform);
              if (changed) {
                if (!replaceSource) node.splice(selected.index + 1, 0, changed);
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
        var scalarChanges = virtualizeCaptionFields(node, requestUrl, config, platform, maxInjections - summary.injected);
        if (scalarChanges) {
          summary.scalarCaptionUrls += scalarChanges;
          summary.injected += scalarChanges;
          summary.selectedLanguage = languageOf(node) || "auto";
          summary.selectedName = labelOf(node) || "";
        }
        Object.keys(node).forEach(function (childKey) {
          if (!SKIP_OBJECT.test(childKey)) walk(node[childKey], childKey, depth + 1);
        });
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
    summary.nodesVisited = nodesVisited;
    summary.reason = nodesVisited > maxNodes ? "node budget exceeded" : (summary.textTracks ? "no matching text track" : "no supported text-track array");
    logger.info("playback JSON inspected", { platform: platform ? platform.id : "unknown", injected: 0, reason: summary.reason, arrays: summary.arraysInspected, textTracks: summary.textTracks });
    return { body: body, changed: false, summary: summary };
  }

  return {
    inject: inject,
    refreshParamountManifests: refreshParamountManifests,
    proxyParamountManifests: proxyParamountManifests,
    adaptParamountPlayback: adaptParamountPlayback
  };
})();
