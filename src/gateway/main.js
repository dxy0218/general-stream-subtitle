(function gatewayEntry() {
  var config = GSS.getConfig();
  var logger = GSS.Logger(config, "gateway");
  var requestUrl = GSS.Runtime.request.url || "";
  var path = GSS.Url.path(requestUrl);
  var sameOriginGateway = path.indexOf("/__gss__/") === 0;
  if (sameOriginGateway) {
    path = path.slice("/__gss__".length) || "/";
    // Keep every virtual HLS hop on the trusted Paramount media hostname.
    // The config object is scoped to this script invocation.
    config.virtualOrigin = GSS.Url.origin(requestUrl) + "/__gss__";
  }
  var host = GSS.Url.host(requestUrl);
  var requestId = GSS.Diagnostics ? GSS.Diagnostics.requestId() : "";
  var currentPlatform = "unknown";

  function trace(type, status, details, level, url) {
    if (!config.logEnabled || !GSS.Diagnostics) return;
    GSS.Diagnostics.record({
      requestId: requestId,
      scope: "gateway",
      platform: currentPlatform,
      type: type,
      level: level || "info",
      status: status || "observed",
      group: currentPlatform + "|" + type + "|" + path,
      throttleSeconds: !level || level === "info" ? 15 : 0,
      url: url || requestUrl,
      details: details || {}
    });
  }

  function upstreamHeaders(response) { return (response && response.headers) || {}; }
  function headerValue(headers, name) {
    var value = "";
    Object.keys(headers || {}).forEach(function (key) { if (key.toLowerCase() === name.toLowerCase()) value = headers[key]; });
    return value;
  }
  function emptyResponse(reason, format, origin) {
    trace("empty-response", "fallback", { reason: reason, format: format ? format.id : "unknown" }, "error", origin || requestUrl);
    logger.error(reason + "; returning an empty virtual response");
    if (path === "/manifest" || path === "/playlist") { GSS.Runtime.doneResponse(200, { "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8", "Cache-Control": "no-store" }, "#EXTM3U\n#EXT-X-ENDLIST\n"); return; }
    if (path === "/youtube" && /(?:[?&]fmt=json3|\.json(?:$|[?#]))/i.test(String(origin || ""))) { GSS.Runtime.doneResponse(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, '{"events":[]}'); return; }
    if (format && format.id === "ttml") { GSS.Runtime.doneResponse(200, { "Content-Type": format.contentType, "Cache-Control": "no-store" }, "<?xml version=\"1.0\"?><tt xmlns=\"http://www.w3.org/ns/ttml\"><body><div/></body></tt>"); return; }
    GSS.Runtime.doneResponse(200, { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "no-store" }, "WEBVTT\n\n");
  }
  function setHeader(headers, name, value) {
    var existing = null;
    Object.keys(headers || {}).forEach(function (key) { if (key.toLowerCase() === name.toLowerCase()) existing = key; });
    if (existing) headers[existing] = value; else headers[name] = value;
  }
  function deleteHeader(headers, name) {
    Object.keys(headers || {}).forEach(function (key) { if (key.toLowerCase() === name.toLowerCase()) delete headers[key]; });
  }
  function rewrittenResponseHeaders(response, contentType) {
    var headers = GSS.Runtime.cleanHeaders(upstreamHeaders(response), contentType);
    setHeader(headers, "Cache-Control", "no-store, no-cache, must-revalidate");
    setHeader(headers, "Pragma", "no-cache");
    return headers;
  }
  function upstreamRequestHeaders(platform, forceFullBody) {
    var headers = {};
    Object.keys(GSS.Runtime.request.headers || {}).forEach(function (key) { headers[key] = GSS.Runtime.request.headers[key]; });
    deleteHeader(headers, "Host");
    deleteHeader(headers, "Content-Length");
    deleteHeader(headers, "Content-Encoding");
    // The virtualized Max playlist removes EXT-X-BYTERANGE and expects a
    // standalone translated WebVTT object, not the player's old media range.
    if (forceFullBody) {
      deleteHeader(headers, "Range");
      deleteHeader(headers, "If-Range");
    }
    var originHeader = headerValue(headers, "origin");
    var refererHeader = headerValue(headers, "referer");
    if (/gss\.local|127\.0\.0\.1|localhost/i.test(originHeader)) deleteHeader(headers, "origin");
    if (/gss\.local|127\.0\.0\.1|localhost/i.test(refererHeader)) deleteHeader(headers, "referer");
    if (platform === "pluto") {
      setHeader(headers, "Origin", "https://pluto.tv");
      setHeader(headers, "Referer", "https://pluto.tv/");
      if (!headerValue(headers, "accept")) setHeader(headers, "Accept", "*/*");
    }
    return headers;
  }
  function originalResponse(reason, body, response, upstreamType) {
    trace("original-subtitle-fallback", "fallback", { reason: reason, contentType: upstreamType || "unknown", bodySize: String(body || "").length }, "warn", origin || requestUrl);
    logger.warn(reason + "; returning the original subtitle body", { fallback: "original", contentType: upstreamType || "unknown" });
    var status = response && (response.status || response.statusCode) || 200;
    GSS.Runtime.doneResponse(status, GSS.Runtime.cleanHeaders(upstreamHeaders(response), upstreamType || undefined), body);
  }

  function forwardedOrigin(origin, query) {
    var reserved = { origin:1, mode:1, source:1, target:1, platform:1, strategy:1, live:1, full:1, version:1, tlang:1 };
    var extra = {};
    Object.keys(query || {}).forEach(function (key) { if (!reserved[key]) extra[key] = query[key]; });
    return GSS.Url.appendParams(origin, extra);
  }

  try {
    var isParamountGatewayHost = sameOriginGateway && (
      /(^|\.)(?:pplus\.paramount\.tech|paramount\.tech|cbsaavideo\.com|cbsivideo\.com)$/.test(host)
      || /^(?:[^.]+-pplus|cc)\.cbs\.com$/.test(host)
      || host === "cbsi.live.ott.irdeto.com"
      || /^(?:splice|splice-media)\.paramountplus\.com$/.test(host)
    );
    var isGatewayHost = host === "example.com" || host === "gss.local" || isParamountGatewayHost;
    var isAdminHost = host === "example.com" || host === "gss.local" || host === "127.0.0.1" || host === "localhost";
    if (isAdminHost && GSS.Admin.handle(requestUrl, config, logger)) return;
    if (!isGatewayHost) { GSS.Runtime.passThrough(); return; }

    var query = GSS.Url.queryObject(requestUrl);
    var origin = query.origin;
    var mode = query.mode === "translate" ? "translate" : "bilingual";
    var source = query.source || config.source;
    var target = query.target || config.target;
    var platform = query.platform || "unknown";
    currentPlatform = platform;
    if (!origin) { emptyResponse("missing origin URL", null, origin); return; }
    if (path === "/youtube") origin = forwardedOrigin(origin, query);

    trace(path === "/manifest" ? "manifest-request" : "subtitle-request", "started", { route: path, mode: mode, source: source, target: target }, "info", origin);

    GSS.Runtime.httpGet({ url: origin, headers: upstreamRequestHeaders(platform, query.full === "1") }, function (error, body, response) {
      if (error) { emptyResponse("upstream fetch failed: " + String(error), null, origin); return; }
      try {
        var upstreamType = headerValue(upstreamHeaders(response), "content-type");
        trace("upstream-response", "received", { status: response && (response.status || response.statusCode) || 200, contentType: upstreamType || "unknown", bodySize: String(body || "").length }, "info", origin);
        if (path === "/manifest") {
          if (body.indexOf("#EXTM3U") < 0) { originalResponse("upstream manifest was not HLS", body, response, upstreamType); return; }
          var detectedPlatform = GSS.Platforms.detect(origin, config) || { id: platform };
          var manifest = GSS.M3U8.isDirectSubtitlePlaylist(origin, detectedPlatform)
            ? GSS.M3U8.decorateSubtitlePlaylist(body, origin, mode, source, target, config, logger, platform)
            : GSS.M3U8.injectTracks(body, origin, config, logger, detectedPlatform);
          manifest = GSS.M3U8.absolutizeUris(manifest, origin);
          var manifestSummary = GSS.M3U8.inspectTrackTypes(manifest.replace(/\r\n/g, "\n").split("\n"));
          trace("manifest-proxy", manifest === body ? "unchanged" : "rewritten", {
            media: GSS.M3U8.isMediaPlaylist(body),
            subtitles: manifestSummary.subtitles,
            virtualSubtitleUris: manifestSummary.virtualSubtitleUris,
            bodySize: String(manifest).length
          }, "info", origin);
          GSS.Runtime.doneResponse(200, rewrittenResponseHeaders(response, "application/vnd.apple.mpegurl; charset=utf-8"), manifest);
          return;
        }
        if (path === "/playlist" && body.indexOf("#EXTM3U") >= 0) {
          var playlist = GSS.M3U8.decorateSubtitlePlaylist(body, origin, mode, source, target, config, logger, platform);
          trace("subtitle-playlist", playlist === body ? "unchanged" : "rewritten", { bodySize: String(body).length }, "info", origin);
          GSS.Runtime.doneResponse(200, rewrittenResponseHeaders(response, "application/vnd.apple.mpegurl; charset=utf-8"), playlist);
          return;
        }
        if (path === "/subtitle" || path === "/playlist" || path === "/youtube") {
          var detected = GSS.Formats.detect(body, origin, upstreamType, config);
          if (!detected) { originalResponse("unsupported subtitle format or binary subtitle segment", body, response, upstreamType); return; }
          GSS.Subtitle.translateBody(body, origin, upstreamType, mode, source, target, config, logger, function (translateError, translated, changed, format) {
            if (translateError) { originalResponse("translation failed: " + String(translateError), body, response, upstreamType); return; }
            var contentType = format.contentTypeFor ? format.contentTypeFor(translated, upstreamType) : format.contentType;
            var validation = null;
            if (format.id === "vtt" && GSS.VTT && GSS.VTT.validate) {
              var inputCues = GSS.VTT.parse(body).cues.length;
              validation = GSS.VTT.validate(translated, inputCues);
              if (!validation.valid) { originalResponse("translated WebVTT validation failed", body, response, upstreamType); return; }
              validation.inputCues = inputCues;
            }
            trace("subtitle-translation", changed ? "rewritten" : "unchanged", {
              format: format.id, mode: mode, source: source, target: target,
              inputSize: String(body).length, outputSize: String(translated).length,
              inputCues: validation ? validation.inputCues : undefined,
              outputCues: validation ? validation.cueCount : undefined,
              valid: validation ? validation.valid : undefined
            }, "info", origin);
            GSS.Runtime.doneResponse(200, rewrittenResponseHeaders(response, contentType), translated);
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
