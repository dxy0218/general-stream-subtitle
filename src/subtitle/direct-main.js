(function directSubtitleEntry() {
  var config = GSS.getConfig();
  var logger = GSS.Logger(config, "direct-subtitle");
  var requestId = GSS.Diagnostics ? GSS.Diagnostics.requestId() : "";
  var requestUrl = GSS.Runtime.request.url || "";
  var headers = GSS.Runtime.request.headers || {};
  var userAgent = String(headers["User-Agent"] || headers["user-agent"] || "");
  var platform = GSS.Platforms.detect(requestUrl, config);

  function trace(status, details, level) {
    if (!config.logEnabled || !GSS.Diagnostics) return;
    GSS.Diagnostics.record({
      requestId: requestId,
      scope: "direct-subtitle",
      platform: "paramount",
      type: "direct-subtitle-translation",
      level: level || "info",
      status: status,
      url: requestUrl,
      details: details || {}
    });
  }

  try {
    // This is a tvOS-only fallback. Paramount iPhone/iPad already consume the
    // translated rendition injected into their playback metadata, while the
    // tvOS AVPlayer can reuse an original master and skip that rewritten URL.
    if (!config.enabled || !platform || !/^(?:paramount|paramount-live)$/.test(platform.id)
      || !GSS.Platforms.enabled(platform, config) || !/(?:Apple TV|AppleTV|tvOS)/i.test(userAgent)) {
      GSS.Runtime.passThrough();
      return;
    }
    var body = String(GSS.Runtime.response.body || "");
    var originalValidation = GSS.VTT.validate(body);
    if (!originalValidation.valid || !originalValidation.cueCount) {
      trace("bypassed", {
        reason: originalValidation.valid ? "empty WebVTT segment" : "invalid WebVTT response",
        inputCues: originalValidation.cueCount
      }, originalValidation.valid ? "info" : "warn");
      GSS.Runtime.passThrough();
      return;
    }
    var responseHeaders = GSS.Runtime.response.headers || {};
    var contentType = responseHeaders["Content-Type"] || responseHeaders["content-type"] || "text/vtt";
    GSS.Subtitle.translateBody(body, requestUrl, contentType, "bilingual", config.source, config.target, config, logger, function (error, translated, changed, format) {
      if (error || !changed || !format) {
        trace("fallback", {
          reason: error ? String(error) : "translation unchanged",
          inputCues: originalValidation.cueCount
        }, error ? "warn" : "info");
        GSS.Runtime.passThrough();
        return;
      }
      var outputValidation = GSS.VTT.validate(translated, originalValidation.cueCount);
      if (!outputValidation.valid) {
        trace("fallback", {
          reason: "translated WebVTT validation failed",
          inputCues: originalValidation.cueCount,
          outputCues: outputValidation.cueCount
        }, "warn");
        GSS.Runtime.passThrough();
        return;
      }
      var outputHeaders = {};
      Object.keys(responseHeaders).forEach(function (key) { outputHeaders[key] = responseHeaders[key]; });
      outputHeaders["Cache-Control"] = "no-store, no-cache, must-revalidate";
      outputHeaders["Expires"] = "0";
      trace("rewritten", {
        format: format.id,
        mode: "bilingual",
        source: config.source,
        target: config.target,
        inputSize: body.length,
        outputSize: String(translated).length,
        inputCues: originalValidation.cueCount,
        outputCues: outputValidation.cueCount,
        valid: true,
        fallback: "original Paramount WebVTT"
      });
      GSS.Runtime.doneBody(translated, outputHeaders, format.contentTypeFor ? format.contentTypeFor(translated, contentType) : format.contentType);
    });
  } catch (error) {
    logger.error("direct Paramount subtitle processing failed; original response preserved", { error: String(error) });
    trace("fallback", { reason: String(error) }, "error");
    GSS.Runtime.passThrough();
  }
})();
