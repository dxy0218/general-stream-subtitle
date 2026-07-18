GSS.Providers = (function createProviderRegistry() {
  var registry = {};

  function register(id, meta, factory) { registry[id] = { id: id, meta: meta || {}, factory: factory }; }
  function list() {
    return Object.keys(registry).map(function (id) {
      var item = registry[id];
      return {
        id: id, name: item.meta.name || id, kind: item.meta.kind || "api",
        requiresKey: !!item.meta.requiresKey, configured: !item.meta.requiresKey || GSS.providerHasKey(id),
        experimental: !!item.meta.experimental
      };
    });
  }
  function create(id, config, logger) {
    var item = registry[id];
    if (!item) throw new Error("Unknown provider: " + id);
    return item.factory(config, logger, {
      apiKey: GSS.getProviderSecret(id, "apiKey"),
      extra: GSS.getProviderSecret(id, "extra")
    });
  }
  function providerChain(config) {
    var chain = [String(config.provider || "google-free")];
    String(config.fallbackProviders || "").split(/[,|]/).forEach(function (id) {
      id = id.trim(); if (id && chain.indexOf(id) < 0) chain.push(id);
    });
    return chain;
  }
  function translateMany(texts, source, target, config, logger, callback) {
    var chain = providerChain(config), index = 0, errors = [];
    function next() {
      if (index >= chain.length) { callback(new Error("All translation providers failed: " + errors.join(" | "))); return; }
      var id = chain[index++], provider;
      try { provider = create(id, config, logger); }
      catch (error) { errors.push(id + ": " + String(error)); next(); return; }
      if (provider.ready && !provider.ready()) { errors.push(id + ": not configured"); next(); return; }
      logger.info("translation provider selected", { provider: id, items: texts.length });
      provider.translateMany(texts, source, target, function (error, output) {
        if (!error && output && output.length === texts.length) { callback(null, output, id); return; }
        errors.push(id + ": " + String(error || "invalid result"));
        logger.warn("translation provider failed", { provider: id, error: String(error || "invalid result") });
        next();
      });
    }
    next();
  }

  function jsonBody(value) { return JSON.stringify(value); }
  function postJson(url, headers, value, callback) {
    headers = headers || {}; headers["Content-Type"] = "application/json; charset=utf-8";
    GSS.Runtime.httpPost({ url: url, headers: headers, body: jsonBody(value) }, callback);
  }
  function parseJson(body) { return JSON.parse(String(body || "")); }
  function getPath(value, path) {
    var current = value;
    String(path || "").split(".").forEach(function (part) { if (part && current !== undefined && current !== null) current = current[part]; });
    return current;
  }
  function decodeHtml(text) {
    return String(text || "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }
  function llmPrompt(texts, source, target, instruction) {
    return (instruction || "Translate the subtitles naturally.") + "\nSource language: " + source + "\nTarget language: " + target
      + "\nReturn ONLY valid JSON in this exact shape: {\"translations\":[\"...\"]}. Preserve item count and order.\nINPUT:\n"
      + JSON.stringify(texts);
  }
  function parseLlmText(text, count) {
    text = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    var parsed = JSON.parse(text), values = Array.isArray(parsed) ? parsed : parsed.translations;
    if (!Array.isArray(values) || values.length !== count) throw new Error("LLM returned an invalid translation array");
    return values.map(function (item) { return String(item); });
  }

  return {
    register: register, list: list, create: create, translateMany: translateMany,
    postJson: postJson, parseJson: parseJson, getPath: getPath, decodeHtml: decodeHtml,
    llmPrompt: llmPrompt, parseLlmText: parseLlmText
  };
})();
