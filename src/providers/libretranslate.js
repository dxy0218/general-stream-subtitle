GSS.Providers.register("libretranslate", { name: "LibreTranslate / 自建实例", kind: "api", requiresKey: false }, function (config, logger, secrets) {
  function translateMany(texts, source, target, callback) {
    var endpoint = (config.providerEndpoint || "https://libretranslate.com").replace(/\/$/, "") + "/translate";
    var body = { q: texts, source: source || "auto", target: target, format: "text" };
    if (secrets.apiKey) body.api_key = secrets.apiKey;
    GSS.Providers.postJson(endpoint, {}, body, function (error, raw) {
      if (error) { callback(error); return; }
      try {
        var data = GSS.Providers.parseJson(raw), value = data.translatedText;
        callback(null, Array.isArray(value) ? value.map(String) : [String(value || "")]);
      } catch (parseError) { callback(parseError); }
    });
  }
  return { ready: function () { return !!config.providerEndpoint; }, translateMany: translateMany };
});
