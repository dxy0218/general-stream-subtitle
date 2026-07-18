GSS.Subtitle = {
  translateBody: function translateBody(body, mode, source, target, config, logger, callback) {
    if (String(body || "").indexOf("-->") < 0) { callback(null, body, false); return; }
    var cache = GSS.Cache(config, logger);
    var seed = body + "|" + mode + "|" + source + "|" + target + "|" + config.bilingualOrder + "|" + config.provider;
    var cached = cache.get(seed);
    if (cached !== null) { callback(null, cached, true); return; }
    var parsed = GSS.VTT.parse(body), texts = GSS.VTT.uniqueTexts(parsed.cues);
    if (!texts.length) { callback(null, body, false); return; }
    var translator = GSS.GoogleTranslate(config, logger);
    translator.translateMany(texts, source, target, function (error, translations) {
      if (error) { callback(error); return; }
      try {
        var output = GSS.VTT.render(parsed, translations, mode, config.bilingualOrder);
        cache.set(seed, output);
        logger.info("subtitle translated", { mode: mode, uniqueCues: texts.length, source: source, target: target });
        callback(null, output, true);
      } catch (renderError) { callback(renderError); }
    });
  }
};
