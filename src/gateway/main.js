(function gatewayEntry() {
  var config = GSS.getConfig();
  var logger = GSS.Logger(config, "gateway");
  var requestUrl = GSS.Runtime.request.url || "";
  var path = GSS.Url.path(requestUrl);
  var host = GSS.Url.host(requestUrl);

  function upstreamHeaders(response) { return (response && response.headers) || {}; }
  function headerValue(headers, name) {
    var value = "";
    Object.keys(headers || {}).forEach(function (key) { if (key.toLowerCase() === name.toLowerCase()) value = headers[key]; });
    return value;
  }
  function emptyResponse(reason, format, origin) {
    logger.error(reason + "; returning an empty virtual response");
    if (path === "/playlist") { GSS.Runtime.doneResponse(200, { "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8", "Cache-Control": "no-store" }, "#EXTM3U\n#EXT-X-ENDLIST\n"); return; }
    if (path === "/youtube" && /(?:[?&]fmt=json3|\.json(?:$|[?#]))/i.test(String(origin || ""))) { GSS.Runtime.doneResponse(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, '{"events":[]}'); return; }
    if (format && format.id === "ttml") { GSS.Runtime.doneResponse(200, { "Content-Type": format.contentType, "Cache-Control": "no-store" }, "<?xml version=\"1.0\"?><tt xmlns=\"http://www.w3.org/ns/ttml\"><body><div/></body></tt>"); return; }
    GSS.Runtime.doneResponse(200, { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "no-store" }, "WEBVTT\n\n");
  }
  function forwardedOrigin(origin, query) {
    var reserved = { origin:1, mode:1, source:1, target:1, platform:1, live:1, version:1, tlang:1 };
    var extra = {};
    Object.keys(query || {}).forEach(function (key) { if (!reserved[key]) extra[key] = query[key]; });
    return GSS.Url.appendParams(origin, extra);
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
    if (!origin) { emptyResponse("missing origin URL", null, origin); return; }
    if (path === "/youtube") origin = forwardedOrigin(origin, query);

    GSS.Runtime.httpGet({ url: origin, headers: GSS.Runtime.request.headers || {} }, function (error, body, response) {
      if (error) { emptyResponse("upstream fetch failed: " + String(error), null, origin); return; }
      try {
        var upstreamType = headerValue(upstreamHeaders(response), "content-type");
        if (path === "/playlist" && body.indexOf("#EXTM3U") >= 0) {
          var playlist = GSS.M3U8.decorateSubtitlePlaylist(body, origin, mode, source, target, config, logger, platform);
          GSS.Runtime.doneResponse(200, GSS.Runtime.cleanHeaders(upstreamHeaders(response), "application/vnd.apple.mpegurl; charset=utf-8"), playlist);
          return;
        }
        if (path === "/subtitle" || path === "/playlist" || path === "/youtube") {
          var detected = GSS.Formats.detect(body, origin, upstreamType, config);
          if (!detected) { emptyResponse("unsupported subtitle format or binary subtitle segment", null, origin); return; }
          GSS.Subtitle.translateBody(body, origin, upstreamType, mode, source, target, config, logger, function (translateError, translated, changed, format) {
            if (translateError) { emptyResponse("translation failed: " + String(translateError), detected, origin); return; }
            var contentType = format.contentTypeFor ? format.contentTypeFor(translated, upstreamType) : format.contentType;
            GSS.Runtime.doneResponse(200, GSS.Runtime.cleanHeaders(upstreamHeaders(response), contentType), translated);
          });
          return;
        }
        GSS.Runtime.doneResponse(404, { "Content-Type": "text/plain; charset=utf-8" }, "General Stream Subtitle: route not found");
      } catch (processingError) { emptyResponse("gateway processing failed: " + String(processingError), null, origin); }
    });
  } catch (error) {
    logger.error("gateway failed", { error: String(error), stack: error && error.stack });
    emptyResponse("gateway exception", null, "");
  }
})();
