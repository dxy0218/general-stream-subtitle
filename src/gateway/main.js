(function gatewayEntry() {
  var config = GSS.getConfig();
  var logger = GSS.Logger(config, "gateway");
  var requestUrl = GSS.Runtime.request.url || "";
  var path = GSS.Url.path(requestUrl);
  var host = GSS.Url.host(requestUrl);

  function upstreamHeaders(response) { return (response && response.headers) || {}; }
  function emptyResponse(reason) {
    logger.error(reason + "; returning an empty virtual response");
    if (path === "/playlist") {
      GSS.Runtime.doneResponse(200, { "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8", "Cache-Control": "no-store" }, "#EXTM3U\n#EXT-X-ENDLIST\n");
    } else {
      GSS.Runtime.doneResponse(200, { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "no-store" }, "WEBVTT\n\n");
    }
  }

  try {
    var isAdminHost = host === "gss.local" || host === "127.0.0.1" || host === "localhost";
    if (isAdminHost && GSS.Admin.handle(requestUrl, config, logger)) return;
    if (host !== "gss.local") { GSS.Runtime.passThrough(); return; }

    var query = GSS.Url.queryObject(requestUrl);
    var origin = query.origin;
    var mode = query.mode === "translate" ? "translate" : "bilingual";
    var source = query.source || config.source;
    var target = query.target || config.target;
    var platform = query.platform || "unknown";
    if (!origin) { emptyResponse("missing origin URL"); return; }

    GSS.Runtime.httpGet({ url: origin, headers: GSS.Runtime.request.headers || {} }, function (error, body, response) {
      if (error) { emptyResponse("upstream fetch failed: " + String(error)); return; }
      try {
        if (path === "/playlist") {
          if (body.indexOf("#EXTM3U") >= 0) {
            var playlist = GSS.M3U8.decorateSubtitlePlaylist(body, origin, mode, source, target, config, logger, platform);
            GSS.Runtime.doneResponse(200, GSS.Runtime.cleanHeaders(upstreamHeaders(response), "application/vnd.apple.mpegurl; charset=utf-8"), playlist);
            return;
          }
          if (body.indexOf("-->") >= 0) {
            GSS.Subtitle.translateBody(body, mode, source, target, config, logger, function (translateError, translated) {
              if (translateError) { emptyResponse("translation failed: " + String(translateError)); return; }
              GSS.Runtime.doneResponse(200, GSS.Runtime.cleanHeaders(upstreamHeaders(response), "text/vtt; charset=utf-8"), translated);
            });
            return;
          }
          emptyResponse("unsupported subtitle playlist response; only HLS/WebVTT is supported");
          return;
        }

        if (path === "/subtitle") {
          if (body.indexOf("-->") < 0) { emptyResponse("unsupported subtitle segment format; only WebVTT is supported"); return; }
          GSS.Subtitle.translateBody(body, mode, source, target, config, logger, function (translateError, translated) {
            if (translateError) { emptyResponse("translation failed: " + String(translateError)); return; }
            GSS.Runtime.doneResponse(200, GSS.Runtime.cleanHeaders(upstreamHeaders(response), "text/vtt; charset=utf-8"), translated);
          });
          return;
        }
        GSS.Runtime.doneResponse(404, { "Content-Type": "text/plain; charset=utf-8" }, "General Stream Subtitle: route not found");
      } catch (processingError) { emptyResponse("gateway processing failed: " + String(processingError)); }
    });
  } catch (error) {
    logger.error("gateway failed", { error: String(error), stack: error && error.stack });
    emptyResponse("gateway exception");
  }
})();
