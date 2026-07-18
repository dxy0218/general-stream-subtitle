GSS.Providers.register("openai", { name: "OpenAI Responses API", kind: "llm", requiresKey: true }, function (config, logger, secrets) {
  function extract(data) {
    if (data.output_text) return data.output_text;
    var text = "";
    (data.output || []).forEach(function (item) { (item.content || []).forEach(function (part) { if (part.text) text += part.text; }); });
    return text;
  }
  function translateMany(texts, source, target, callback) {
    var endpoint = config.providerEndpoint || "https://api.openai.com/v1/responses";
    var model = config.providerModel;
    if (!model) { callback(new Error("OpenAI model is empty")); return; }
    var body = { model: model, input: GSS.Providers.llmPrompt(texts, source, target, config.providerPrompt) };
    GSS.Providers.postJson(endpoint, { Authorization: "Bearer " + secrets.apiKey }, body, function (error, raw) {
      if (error) { callback(error); return; }
      try { callback(null, GSS.Providers.parseLlmText(extract(GSS.Providers.parseJson(raw)), texts.length)); }
      catch (parseError) { callback(parseError); }
    });
  }
  return { ready: function () { return !!secrets.apiKey && !!config.providerModel; }, translateMany: translateMany };
});
