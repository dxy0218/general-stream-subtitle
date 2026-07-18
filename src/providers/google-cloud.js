GSS.Providers.register("google-cloud", { name: "Google Cloud Translation v2", kind: "api", requiresKey: true }, function (config, logger, secrets) {
  function translateMany(texts, source, target, callback) {
    var endpoint = config.providerEndpoint || "https://translation.googleapis.com/language/translate/v2";
    var url = endpoint + (endpoint.indexOf("?") >= 0 ? "&" : "?") + "key=" + encodeURIComponent(secrets.apiKey);
    var body = { q: texts, target: target, format: "text" };
    if (source && source !== "auto") body.source = source;
    GSS.Providers.postJson(url, {}, body, function (error, raw) {
      if (error) { callback(error); return; }
      try {
        var data = GSS.Providers.parseJson(raw), rows = data.data && data.data.translations;
        if (!Array.isArray(rows)) throw new Error("Invalid Google Cloud response");
        callback(null, rows.map(function (row) { return GSS.Providers.decodeHtml(row.translatedText); }));
      } catch (parseError) { callback(parseError); }
    });
  }
  return { ready: function () { return !!secrets.apiKey; }, translateMany: translateMany };
});
