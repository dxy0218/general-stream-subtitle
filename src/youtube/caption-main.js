(function youtubeCaptionEntry() {
  var config = GSS.getConfig(), logger = GSS.Logger(config, "youtube-caption");
  var requestId = GSS.Diagnostics ? GSS.Diagnostics.requestId() : "";
  function trace(type, status, details, level) {
    if (!config.logEnabled || !GSS.Diagnostics) return;
    GSS.Diagnostics.record({ requestId: requestId, scope: "youtube-caption", platform: "youtube", type: type, level: level || "info", status: status, group: "youtube|" + type, throttleSeconds: !level || level === "info" ? 10 : 0, url: GSS.Runtime.request.url || "", details: details || {} });
  }
  try {
    var requestUrl = GSS.Runtime.request.url || "", query = GSS.Url.queryObject(requestUrl);
    if (!query.gss_mode) { GSS.Runtime.passThrough(); return; }
    var body = GSS.Runtime.response.body || "", headers = GSS.Runtime.response.headers || {};
    var upstreamType = "";
    Object.keys(headers).forEach(function (key) { if (key.toLowerCase() === "content-type") upstreamType = headers[key]; });
    GSS.Subtitle.translateBody(body, requestUrl, upstreamType, query.gss_mode === "translate" ? "translate" : "bilingual", query.gss_source || config.source, query.gss_target || config.target, config, logger, function (error, translated, changed, format) {
      if (error || !changed) {
        if (error) logger.error("YouTube caption translation failed; original response preserved", { error: String(error) });
        trace("caption-translation", error ? "fallback" : "unchanged", { error: error ? String(error) : "", format: format ? format.id : "unknown", bodySize: String(body).length }, error ? "error" : "info");
        GSS.Runtime.passThrough(); return;
      }
      var contentType = format.contentTypeFor ? format.contentTypeFor(translated, upstreamType) : format.contentType;
      trace("caption-translation", "rewritten", { format: format.id, inputSize: String(body).length, outputSize: String(translated).length });
      GSS.Runtime.doneBody(translated, headers, contentType);
    });
  } catch (error) {
    trace("exception", "failed", { error: String(error) }, "error");
    logger.error("YouTube caption script failed; original response preserved", { error: String(error), stack: error && error.stack });
    GSS.Runtime.passThrough();
  }
})();
