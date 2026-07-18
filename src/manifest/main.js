(function manifestEntry() {
  var config = GSS.getConfig();
  var logger = GSS.Logger(config, "manifest");
  try {
    var body = GSS.Runtime.response.body || "";
    if (!config.enabled || body.indexOf("#EXTM3U") < 0) { GSS.Runtime.passThrough(); return; }
    var output = GSS.M3U8.injectTracks(body, GSS.Runtime.request.url || "", config, logger);
    if (output === body) GSS.Runtime.passThrough();
    else GSS.Runtime.doneBody(output, GSS.Runtime.response.headers, "application/vnd.apple.mpegurl; charset=utf-8");
  } catch (error) {
    logger.error("manifest processing failed; original response preserved", { error: String(error), stack: error && error.stack });
    GSS.Runtime.passThrough();
  }
})();
