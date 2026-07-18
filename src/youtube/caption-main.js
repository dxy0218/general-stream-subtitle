(function youtubeCaptionEntry() {
  var config = GSS.getConfig(), logger = GSS.Logger(config, "youtube-caption");
  try {
    var requestUrl = GSS.Runtime.request.url || "", query = GSS.Url.queryObject(requestUrl);
    if (!query.gss_mode) { GSS.Runtime.passThrough(); return; }
    var body = GSS.Runtime.response.body || "", headers = GSS.Runtime.response.headers || {};
    var upstreamType = "";
    Object.keys(headers).forEach(function (key) { if (key.toLowerCase() === "content-type") upstreamType = headers[key]; });
    GSS.Subtitle.translateBody(body, requestUrl, upstreamType, query.gss_mode === "translate" ? "translate" : "bilingual", query.gss_source || config.source, query.gss_target || config.target, config, logger, function (error, translated, changed, format) {
      if (error || !changed) {
        if (error) logger.error("YouTube caption translation failed; original response preserved", { error: String(error) });
        GSS.Runtime.passThrough(); return;
      }
      var contentType = format.contentTypeFor ? format.contentTypeFor(translated, upstreamType) : format.contentType;
      GSS.Runtime.doneBody(translated, headers, contentType);
    });
  } catch (error) {
    logger.error("YouTube caption script failed; original response preserved", { error: String(error), stack: error && error.stack });
    GSS.Runtime.passThrough();
  }
})();
