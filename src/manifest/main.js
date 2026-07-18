(function manifestEntry() {
  var config = GSS.getConfig();
  var logger = GSS.Logger(config, "manifest");
  try {
    var body = GSS.Runtime.response.body || "";
    if (!config.enabled) { GSS.Runtime.passThrough(); return; }
    var platform = GSS.Platforms.detect(GSS.Runtime.request.url || "", config);
    if (!platform || !GSS.Platforms.enabled(platform, config)) { GSS.Runtime.passThrough(); return; }
    var output = body;
    var contentType = "";
    if (body.indexOf("#EXTM3U") >= 0) {
      output = GSS.M3U8.injectTracks(body, GSS.Runtime.request.url || "", config, logger, platform);
      contentType = "application/vnd.apple.mpegurl; charset=utf-8";
    } else if (/<MPD\b/i.test(body)) {
      output = GSS.MPD.injectTrack(body, GSS.Runtime.request.url || "", config, logger, platform);
      contentType = "application/dash+xml; charset=utf-8";
    } else {
      GSS.Runtime.passThrough(); return;
    }
    if (output === body) GSS.Runtime.passThrough();
    else GSS.Runtime.doneBody(output, GSS.Runtime.response.headers, contentType);
  } catch (error) {
    logger.error("manifest processing failed; original response preserved", { error: String(error), stack: error && error.stack });
    GSS.Runtime.passThrough();
  }
})();
