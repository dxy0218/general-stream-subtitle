GSS.Providers.register("gemini", { name: "Google Gemini API", kind: "llm", requiresKey: true }, function (config, logger, secrets) {
  function translateMany(texts, source, target, callback) {
    var model = config.providerModel;
    if (!model) { callback(new Error("Gemini model is empty")); return; }
    var endpoint = config.providerEndpoint || ("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent");
    var url = endpoint + (endpoint.indexOf("?") >= 0 ? "&" : "?") + "key=" + encodeURIComponent(secrets.apiKey);
    var body = { contents: [{ parts: [{ text: GSS.Providers.llmPrompt(texts, source, target, config.providerPrompt) }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } };
    GSS.Providers.postJson(url, {}, body, function (error, raw) {
      if (error) { callback(error); return; }
      try {
        var data = GSS.Providers.parseJson(raw), text = data.candidates[0].content.parts[0].text;
        callback(null, GSS.Providers.parseLlmText(text, texts.length));
      } catch (parseError) { callback(parseError); }
    });
  }
  return { ready: function () { return !!secrets.apiKey && !!config.providerModel; }, translateMany: translateMany };
});
