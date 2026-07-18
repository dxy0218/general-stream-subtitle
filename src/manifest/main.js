(function manifestEntry() {
  var config = GSS.getConfig();
  var logger = GSS.Logger(config, "manifest");
  try {
    var body = GSS.Runtime.response.body || "";
    var url = GSS.Runtime.request.url || "";
    if (!config.enabled || body.indexOf("#EXTM3U") < 0) { GSS.Runtime.passThrough(); return; }
    var platform = GSS.Platforms.detect(url);
    if (!platform || !GSS.Platforms.enabled(platform, config)) {
      logger.debug("manifest ignored", { url: url, platform: platform ? platform.id : "unknown" });
      GSS.Runtime.passThrough();
      return;
    }
    var output = GSS.M3U8.injectTracks(body, url, config, logger, platform);
    if (output === body) GSS.Runtime.passThrough();
    else GSS.Runtime.doneBody(output, GSS.Runtime.response.headers, "application/vnd.apple.mpegurl; charset=utf-8");
  } catch (error) {
    logger.error("manifest processing failed; original response preserved", { error: String(error), stack: error && error.stack });
    GSS.Runtime.passThrough();
  }
})();
