GSS.YouTube = (function createYouTubeAdapter() {
  function trackName(track) {
    var name = track && track.name;
    if (!name) return "";
    if (typeof name.simpleText === "string") return name.simpleText;
    if (Array.isArray(name.runs)) return name.runs.map(function (run) { return run.text || ""; }).join("");
    return "";
  }

  function detectPlatform(request) {
    var url = request && request.url || "", body = request && request.body || "";
    if (GSS.Url.host(url) === "tv.youtube.com" || /\"clientName\"\s*:\s*\"(?:TVHTML5|YOUTUBE_TV|TV)\"/i.test(body)) return { id: "youtube-tv", name: "YouTube TV" };
    return { id: "youtube", name: "YouTube" };
  }

  function findRenderers(root) {
    var found = [], seen = [], maxNodes = 3000;
    function walk(value, depth) {
      if (!value || typeof value !== "object" || depth > 12 || seen.length > maxNodes) return;
      if (seen.indexOf(value) >= 0) return;
      seen.push(value);
      if (value.playerCaptionsTracklistRenderer && typeof value.playerCaptionsTracklistRenderer === "object") found.push(value.playerCaptionsTracklistRenderer);
      Object.keys(value).forEach(function (key) { walk(value[key], depth + 1); });
    }
    walk(root, 0);
    return found;
  }

  function isLiveResponse(data) {
    return !!(data && data.videoDetails && data.videoDetails.isLiveContent)
      || !!(data && data.playabilityStatus && data.playabilityStatus.liveStreamability)
      || !!(data && data.microformat && data.microformat.playerMicroformatRenderer && data.microformat.playerMicroformatRenderer.liveBroadcastDetails);
  }

  function chooseTrack(renderer, config) {
    var tracks = renderer.captionTracks || [], defaultIndexes = {};
    (renderer.audioTracks || []).forEach(function (audio) {
      if (audio && audio.defaultCaptionTrackIndex !== undefined) defaultIndexes[Number(audio.defaultCaptionTrackIndex)] = true;
    });
    var candidates = [];
    tracks.forEach(function (track, index) {
      if (!track || !track.baseUrl || /(?:gss_mode=|gss\.local\/youtube)/.test(track.baseUrl)) return;
      var name = trackName(track), language = track.languageCode || "", asr = String(track.kind || "").toLowerCase() === "asr" || /auto-generated|automatic/i.test(name);
      if (asr && !config.youtubeUseAsr) return;
      if (!GSS.Language.matches(language, name, config.source)) return;
      var score = GSS.Language.priority(language, name, config.sourcePriority);
      if (defaultIndexes[index]) score += 100;
      if (config.youtubePreferManual) score += asr ? 0 : 30;
      else score += asr ? 10 : 0;
      candidates.push({ track: track, index: index, score: score, asr: asr, language: language, name: name });
    });
    candidates.sort(function (a, b) { return b.score !== a.score ? b.score - a.score : a.index - b.index; });
    return candidates[0] || null;
  }

  function appendDirect(origin, mode, source, target, platform, live) {
    return GSS.Url.appendParams(origin, {
      gss_mode: mode, gss_source: source, gss_target: target, gss_platform: platform,
      gss_live: live ? "1" : "0", gss_v: GSS.VERSION
    });
  }

  function virtualUrl(config, origin, mode, source, target, platform, live) {
    return GSS.Url.virtual(config.virtualOrigin, "/youtube", {
      origin: origin, mode: mode, source: source, target: target, platform: platform,
      live: live ? "1" : "0", version: GSS.VERSION
    });
  }

  function cloneTrack(candidate, mode, config, platform, live) {
    var source = GSS.Language.googleSource(candidate.language, config.source);
    var clone = {};
    Object.keys(candidate.track).forEach(function (key) { clone[key] = candidate.track[key]; });
    clone.name = { simpleText: mode === "translate" ? config.translatedTrackName : config.trackName };
    clone.languageCode = config.target;
    clone.vssId = ".gss." + String(config.target || "zh-CN").replace(/[^a-z0-9-]/gi, "");
    clone.isTranslatable = false;
    delete clone.kind;
    clone.baseUrl = config.youtubeStrategy === "virtual"
      ? virtualUrl(config, candidate.track.baseUrl, mode, source, config.target, platform.id, live)
      : appendDirect(candidate.track.baseUrl, mode, source, config.target, platform.id, live);
    return clone;
  }

  function attachIndex(renderer, sourceIndex, newIndex) {
    (renderer.audioTracks || []).forEach(function (audio) {
      if (!audio) return;
      if (!Array.isArray(audio.captionTrackIndices)) audio.captionTrackIndices = [];
      if (!audio.captionTrackIndices.length || audio.captionTrackIndices.indexOf(sourceIndex) >= 0) {
        if (audio.captionTrackIndices.indexOf(newIndex) < 0) audio.captionTrackIndices.push(newIndex);
      }
    });
  }

  function inject(data, request, config, logger) {
    var platform = detectPlatform(request);
    if (!GSS.Platforms.enabled(platform, config)) return { changed: false, data: data, platform: platform, reason: "platform disabled" };
    var live = isLiveResponse(data);
    if (live && !config.youtubeLive) return { changed: false, data: data, platform: platform, live: true, reason: "live disabled" };
    var renderers = findRenderers(data), injected = 0, selected = null;
    renderers.forEach(function (renderer) {
      if (!Array.isArray(renderer.captionTracks) || renderer.captionTracks.some(function (track) { return track && /(?:gss_mode=|gss\.local\/youtube)/.test(track.baseUrl || ""); })) return;
      var candidate = chooseTrack(renderer, config);
      if (!candidate) return;
      selected = candidate;
      var sourceIndex = candidate.index;
      var bilingualIndex = renderer.captionTracks.length;
      renderer.captionTracks.push(cloneTrack(candidate, "bilingual", config, platform, live));
      attachIndex(renderer, sourceIndex, bilingualIndex);
      injected += 1;
      if (config.injectTranslated) {
        var translatedIndex = renderer.captionTracks.length;
        renderer.captionTracks.push(cloneTrack(candidate, "translate", config, platform, live));
        attachIndex(renderer, sourceIndex, translatedIndex);
        injected += 1;
      }
    });
    logger.info("YouTube player response inspected", {
      platform: platform.id, live: live, renderers: renderers.length, injected: injected,
      selectedName: selected ? selected.name : "", selectedLanguage: selected ? selected.language : "",
      sourceType: selected ? (selected.asr ? "asr" : "manual") : "none", strategy: config.youtubeStrategy
    });
    return { changed: injected > 0, data: data, platform: platform, live: live, injected: injected, selected: selected };
  }

  return { inject: inject, chooseTrack: chooseTrack, detectPlatform: detectPlatform, findRenderers: findRenderers };
})();
