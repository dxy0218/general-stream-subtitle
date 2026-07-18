GSS.Providers.register("deepl", { name: "DeepL API", kind: "api", requiresKey: true }, function (config, logger, secrets) {
  function lang(value) { return String(value || "").replace(/^zh-cn$/i, "ZH-HANS").replace(/^zh-tw$/i, "ZH-HANT").toUpperCase(); }
  function translateMany(texts, source, target, callback) {
    var endpoint = config.providerEndpoint || "https://api-free.deepl.com/v2/translate";
    var body = { text: texts, target_lang: lang(target), preserve_formatting: true };
    if (source && source !== "auto") body.source_lang = lang(source);
    if (config.providerModel) body.model_type = config.providerModel;
    GSS.Providers.postJson(endpoint, { Authorization: "DeepL-Auth-Key " + secrets.apiKey }, body, function (error, raw) {
      if (error) { callback(error); return; }
      try {
        var rows = GSS.Providers.parseJson(raw).translations;
        if (!Array.isArray(rows)) throw new Error("Invalid DeepL response");
        callback(null, rows.map(function (row) { return String(row.text || ""); }));
      } catch (parseError) { callback(parseError); }
    });
  }
  return { ready: function () { return !!secrets.apiKey; }, translateMany: translateMany };
});
