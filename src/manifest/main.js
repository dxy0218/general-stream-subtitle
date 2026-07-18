(function manifestEntry() {
  var config = GSS.getConfig();
  var logger = GSS.Logger(config, "manifest");

  function record(platform, type, changed, details) {
    if (!GSS.Diagnostics) return;
    GSS.Diagnostics.record({
      scope: "manifest",
      url: GSS.Runtime.request.url || "",
      platform: platform ? platform.id : "unknown",
      type: type,
      changed: !!changed,
      details: details || {}
    });
  }

  try {
    var body = GSS.Runtime.response.body || "";
    if (!config.enabled) { GSS.Runtime.passThrough(); return; }
    var requestUrl = GSS.Runtime.request.url || "";
    var platform = GSS.Platforms.detect(requestUrl, config);
    if (!platform || !GSS.Platforms.enabled(platform, config)) { GSS.Runtime.passThrough(); return; }
    var output = body;
    var contentType = "";

    if (body.indexOf("#EXTM3U") >= 0) {
      var media = GSS.M3U8.isMediaPlaylist(body);
      var summary = GSS.M3U8.inspectTrackTypes(body.replace(/\r\n/g, "\n").split("\n"));
      output = GSS.M3U8.injectTracks(body, requestUrl, config, logger, platform);
      contentType = "application/vnd.apple.mpegurl; charset=utf-8";
      record(platform, media ? "hls-media" : "hls-master", output !== body, summary);
    } else if (/<MPD\b/i.test(body)) {
      output = GSS.MPD.injectTrack(body, requestUrl, config, logger, platform);
      contentType = "application/dash+xml; charset=utf-8";
      record(platform, "dash", output !== body, {});
    } else if (/^\s*[\[{]/.test(body) && /^(max|paramount|paramount-live)$/.test(platform.id)) {
      var jsonResult = GSS.PlaybackJson.inject(body, requestUrl, config, logger, platform);
      output = jsonResult.body;
      contentType = "application/json; charset=utf-8";
      record(platform, "playback-json", jsonResult.changed, jsonResult.summary);
    } else {
      record(platform, "unsupported-response", false, { prefix: String(body).slice(0, 32) });
      GSS.Runtime.passThrough(); return;
    }
    if (output === body) GSS.Runtime.passThrough();
    else GSS.Runtime.doneBody(output, GSS.Runtime.response.headers, contentType);
  } catch (error) {
    logger.error("manifest processing failed; original response preserved", { error: String(error), stack: error && error.stack });
    if (GSS.Diagnostics) GSS.Diagnostics.record({ scope: "manifest", url: GSS.Runtime.request.url || "", type: "exception", error: String(error) });
    GSS.Runtime.passThrough();
  }
})();
