GSS.Providers.register("custom-json", { name: "自定义 JSON API", kind: "custom", requiresKey: false, experimental: true }, function (config, logger, secrets) {
  function translateMany(texts, source, target, callback) {
    if (!config.providerEndpoint) { callback(new Error("Custom endpoint is empty")); return; }
    var headers = {};
    if (secrets.apiKey) headers.Authorization = "Bearer " + secrets.apiKey;
    GSS.Providers.postJson(config.providerEndpoint, headers, { texts: texts, source: source, target: target }, function (error, raw) {
      if (error) { callback(error); return; }
      try {
        var data = GSS.Providers.parseJson(raw), value = data.translations || data.translatedText || data.output;
        if (!Array.isArray(value)) throw new Error("Expected translations array");
        callback(null, value.map(String));
      } catch (parseError) { callback(parseError); }
    });
  }
  return { ready: function () { return !!config.providerEndpoint; }, translateMany: translateMany };
});
