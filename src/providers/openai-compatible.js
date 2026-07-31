GSS.Providers.register("openai-compatible", { name: "OpenAI 兼容接口（DeepSeek 等）", kind: "llm", requiresKey: true }, function (config, logger, secrets) {
  function translateMany(texts, source, target, callback) {
    if (!config.providerModel) { callback(new Error("Compatible API model is empty")); return; }
    if (String(config.providerModel).toLowerCase() === "hy-mt2-1.8b") {
      var inputChars = JSON.stringify(texts || []).length;
      if (texts.length > 3 || inputChars > 480) {
        callback(new Error("Hy-MT2 low-context profile skipped a large subtitle batch (items=" + texts.length + ", chars=" + inputChars + ", limits=3/480)"));
        return;
      }
    }
    var base = (config.providerEndpoint || "https://api.deepseek.com").replace(/\/$/, "");
    var endpoint = /\/chat\/completions$/.test(base) ? base : base + "/chat/completions";
    var body = {
      model: config.providerModel,
      messages: [
        { role: "system", content: "You are a professional subtitle translator. Output valid JSON only." },
        { role: "user", content: GSS.Providers.llmPrompt(texts, source, target, config.providerPrompt) }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    };
    GSS.Providers.postJson(endpoint, { Authorization: "Bearer " + secrets.apiKey }, body, function (error, raw) {
      if (error) { callback(error); return; }
      try {
        var data = GSS.Providers.parseJson(raw), text = data.choices[0].message.content;
        callback(null, GSS.Providers.parseLlmText(text, texts.length));
      } catch (parseError) { callback(parseError); }
    });
  }
  return { ready: function () { return !!secrets.apiKey && !!config.providerEndpoint && !!config.providerModel; }, translateMany: translateMany };
});
