(function youtubePlayerEntry() {
  var config = GSS.getConfig(), logger = GSS.Logger(config, "youtube-player");
  try {
    if (!config.enabled) { GSS.Runtime.passThrough(); return; }
    var raw = String(GSS.Runtime.response.body || ""), prefix = "";
    if (raw.slice(0, 4) === ")]}'") { var split = raw.indexOf("\n"); prefix = split >= 0 ? raw.slice(0, split + 1) : ")]}'\n"; raw = split >= 0 ? raw.slice(split + 1) : raw.slice(4); }
    var data = JSON.parse(raw);
    var result = GSS.YouTube.inject(data, GSS.Runtime.request, config, logger);
    if (!result.changed) { GSS.Runtime.passThrough(); return; }
    GSS.Runtime.doneBody(prefix + JSON.stringify(data), GSS.Runtime.response.headers, "application/json; charset=utf-8");
  } catch (error) {
    logger.error("YouTube player processing failed; original response preserved", { error: String(error), stack: error && error.stack });
    GSS.Runtime.passThrough();
  }
})();
