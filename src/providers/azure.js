GSS.Providers.register("azure", { name: "Azure Translator v3", kind: "api", requiresKey: true }, function (config, logger, secrets) {
  function translateMany(texts, source, target, callback) {
    var endpoint = (config.providerEndpoint || "https://api.cognitive.microsofttranslator.com").replace(/\/$/, "");
    var url = endpoint + "/translate?api-version=3.0&to=" + encodeURIComponent(target);
    if (source && source !== "auto") url += "&from=" + encodeURIComponent(source);
    var headers = { "Ocp-Apim-Subscription-Key": secrets.apiKey };
    if (config.providerRegion) headers["Ocp-Apim-Subscription-Region"] = config.providerRegion;
    GSS.Providers.postJson(url, headers, texts.map(function (text) { return { Text: text }; }), function (error, raw) {
      if (error) { callback(error); return; }
      try {
        var rows = GSS.Providers.parseJson(raw);
        callback(null, rows.map(function (row) { return String(row.translations[0].text || ""); }));
      } catch (parseError) { callback(parseError); }
    });
  }
  return { ready: function () { return !!secrets.apiKey; }, translateMany: translateMany };
});
