GSS.Subtitle = {
  translateBody: function translateBody(body, url, contentType, mode, source, target, config, logger, callback) {
    var format = GSS.Formats.detect(body, url, contentType, config);
    if (!format) { callback(new Error("Unsupported subtitle format")); return; }
    var cache = GSS.Cache(config, logger);
    var seed = body + "|" + format.id + "|" + mode + "|" + source + "|" + target + "|" + config.bilingualOrder + "|" + config.provider + "|" + config.fallbackProviders;
    var cached = cache.get(seed);
    if (cached !== null) { callback(null, cached, true, format); return; }
    var parsed;
    try { parsed = format.parse(body); } catch (error) { callback(error); return; }
    var texts = GSS.Formats.uniqueTexts(parsed.cues || []);
    if (!texts.length) { callback(null, body, false, format); return; }
    GSS.Providers.translateMany(texts, source, target, config, logger, function (error, translations, providerId) {
      if (error) { callback(error); return; }
      try {
        var output = format.render(parsed, translations, mode, config.bilingualOrder);
        cache.set(seed, output);
        logger.info("subtitle translated", { format: format.id, provider: providerId, mode: mode, uniqueCues: texts.length, source: source, target: target });
        callback(null, output, true, format);
      } catch (renderError) { callback(renderError); }
    });
  }
};
