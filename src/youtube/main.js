(function youtubePlayerEntry() {
  var config = GSS.getConfig(), logger = GSS.Logger(config, "youtube-player");
  var requestId = GSS.Diagnostics ? GSS.Diagnostics.requestId() : "";
  function trace(type, status, details, level) {
    if (!config.logEnabled || !GSS.Diagnostics) return;
    GSS.Diagnostics.record({ requestId: requestId, scope: "youtube-player", platform: details && details.platform || "youtube", type: type, level: level || "info", status: status, group: (details && details.platform || "youtube") + "|" + type, throttleSeconds: !level || level === "info" ? 10 : 0, url: GSS.Runtime.request.url || "", details: details || {} });
  }
  try {
    if (!config.enabled) { GSS.Runtime.passThrough(); return; }
    var raw = String(GSS.Runtime.response.body || ""), prefix = "";
    if (raw.slice(0, 4) === ")]}'") { var split = raw.indexOf("\n"); prefix = split >= 0 ? raw.slice(0, split + 1) : ")]}'\n"; raw = split >= 0 ? raw.slice(split + 1) : raw.slice(4); }
    var data = JSON.parse(raw);
    var result = GSS.YouTube.inject(data, GSS.Runtime.request, config, logger);
    if (!result.changed) { trace("player-response", "bypassed", { platform: result.platform ? result.platform.id : "youtube", live: !!result.live, reason: result.reason || "no supported text captions" }); GSS.Runtime.passThrough(); return; }
    trace("player-response", "rewritten", { platform: result.platform ? result.platform.id : "youtube", live: !!result.live, injected: result.injected || 0, sourceType: result.selected ? (result.selected.asr ? "asr" : "manual") : "none", selectedLanguage: result.selected ? result.selected.language : "" });
    GSS.Runtime.doneBody(prefix + JSON.stringify(data), GSS.Runtime.response.headers, "application/json; charset=utf-8");
  } catch (error) {
    trace("exception", "failed", { error: String(error) }, "error");
    logger.error("YouTube player processing failed; original response preserved", { error: String(error), stack: error && error.stack });
    GSS.Runtime.passThrough();
  }
})();
