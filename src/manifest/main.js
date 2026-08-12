(function manifestEntry() {
  var config = GSS.getConfig();
  var logger = GSS.Logger(config, "manifest");
  var requestId = GSS.Diagnostics ? GSS.Diagnostics.requestId() : "";

  function record(platform, type, changed, details, status, level) {
    if (!config.logEnabled || !GSS.Diagnostics) return;
    GSS.Diagnostics.record({
      requestId: requestId,
      scope: "manifest",
      url: GSS.Runtime.request.url || "",
      platform: platform ? platform.id : "unknown",
      type: type,
      level: level || "info",
      status: status || (changed ? "rewritten" : "unchanged"),
      group: type === "hls-media" ? (platform ? platform.id : "unknown") + "|hls-media" : "",
      throttleSeconds: type === "hls-media" ? 30 : 0,
      changed: !!changed,
      details: details || {}
    });
  }

  try {
    var body = GSS.Runtime.response.body || "";
    if (!config.enabled) { record(null, "module-disabled", false, {}, "bypassed"); GSS.Runtime.passThrough(); return; }
    var requestUrl = GSS.Runtime.request.url || "";
    var platform = GSS.Platforms.detect(requestUrl, config);
    if (!platform) { record(null, "platform-unmatched", false, {}, "bypassed"); GSS.Runtime.passThrough(); return; }
    if (!GSS.Platforms.enabled(platform, config)) { record(platform, "platform-disabled", false, {}, "bypassed"); GSS.Runtime.passThrough(); return; }
    var processingMode = "full";
    if (platform.id === "discovery") processingMode = String(config.discoveryMode || "full");
    else if (config.safePlayback && /^(max|pluto|prime|hulu)$/.test(platform.id)) processingMode = "hls-only";
    if (processingMode === "off") { record(platform, "adapter-off", false, { processingMode: processingMode }, "bypassed"); GSS.Runtime.passThrough(); return; }
    var output = body;
    var contentType = "";

    if (body.indexOf("#EXTM3U") >= 0) {
      var media = GSS.M3U8.isMediaPlaylist(body);
      var summary = GSS.M3U8.inspectTrackTypes(body.replace(/\r\n/g, "\n").split("\n"));
      output = GSS.M3U8.injectTracks(body, requestUrl, config, logger, platform);
      if (output !== body) {
        var outputSummary = GSS.M3U8.inspectTrackTypes(output.replace(/\r\n/g, "\n").split("\n"));
        summary.outputSubtitles = outputSummary.subtitles;
        summary.outputVirtualSubtitleUris = outputSummary.virtualSubtitleUris;
        summary.outputRenditions = outputSummary.renditions;
        summary.strategy = (platform.id === "max" && config.maxReplaceSource)
          || (/^(?:paramount|paramount-live)$/.test(platform.id) && config.paramountReplaceSource)
          ? "replace-source" : "duplicate";
      }
      contentType = "application/vnd.apple.mpegurl; charset=utf-8";
      record(platform, media ? "hls-media" : "hls-master", output !== body, summary, output !== body ? "rewritten" : "unchanged");
    } else if (processingMode === "hls-only") {
      record(platform, "safe-playback-bypass", false, { responseKind: /<MPD\b/i.test(body) ? "dash" : /^\s*[\[{]/.test(body) ? "json" : "unknown" }, "bypassed");
      GSS.Runtime.passThrough(); return;
    } else if (/<MPD\b/i.test(body)) {
      output = GSS.MPD.injectTrack(body, requestUrl, config, logger, platform);
      contentType = "application/dash+xml; charset=utf-8";
      record(platform, "dash", output !== body, {});
    } else if (/^\s*[\[{]/.test(body) && /^(max|discovery|paramount|paramount-live)$/.test(platform.id)) {
      var jsonResult = GSS.PlaybackJson.inject(body, requestUrl, config, logger, platform);
      output = jsonResult.body;
      contentType = "application/json; charset=utf-8";
      record(platform, "playback-json", jsonResult.changed, jsonResult.summary);
    } else {
      record(platform, "unsupported-response", false, { bodySize: String(body).length }, "bypassed", "warn");
      GSS.Runtime.passThrough(); return;
    }
    if (output === body) GSS.Runtime.passThrough();
    else GSS.Runtime.doneBody(output, GSS.Runtime.response.headers, contentType);
  } catch (error) {
    logger.error("manifest processing failed; original response preserved", { error: String(error), stack: error && error.stack });
    if (config.logEnabled && GSS.Diagnostics) GSS.Diagnostics.record({ requestId: requestId, scope: "manifest", url: GSS.Runtime.request.url || "", type: "exception", level: "error", status: "failed", error: String(error) });
    GSS.Runtime.passThrough();
  }
})();
