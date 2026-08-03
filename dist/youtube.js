// General Stream Subtitle 0.6.12 - youtube
// MIT License - generated file; edit src/ instead.
(function () {
"use strict";
var GSS = {};
GSS.Runtime = (function createRuntime() {
  function detectName() {
    if (typeof $loon !== "undefined") return "Loon";
    if (typeof $rocket !== "undefined") return "Shadowrocket";
    if (typeof $environment !== "undefined") return "Surge";
    return "Unknown";
  }

  function cloneHeaders(headers) {
    var copy = {};
    Object.keys(headers || {}).forEach(function (key) { copy[key] = headers[key]; });
    return copy;
  }

  function cleanHeaders(headers, contentType) {
    var copy = cloneHeaders(headers);
    Object.keys(copy).forEach(function (key) {
      var lower = key.toLowerCase();
      if (lower === "content-length" || lower === "content-encoding" || lower === "transfer-encoding"
        || lower === "content-md5" || lower === "digest" || lower === "etag"
        || lower === "last-modified" || lower === "content-range" || lower === "accept-ranges"
        || /^x-goog-(?:hash|generation|metageneration|stored-content-|source-etag)/.test(lower)
        || /^x-amz-(?:checksum-|version-id|meta-etag)/.test(lower)
        || /^x-ms-content-(?:crc64|md5)$/.test(lower)) delete copy[key];
      if (contentType && lower === "content-type") delete copy[key];
    });
    if (contentType) copy["Content-Type"] = contentType;
    return copy;
  }

  function cleanRequestHeaders(headers) {
    var copy = cloneHeaders(headers);
    Object.keys(copy).forEach(function (key) {
      var lower = key.toLowerCase();
      if (lower === "host" || lower === "content-length" || lower === "content-encoding") delete copy[key];
    });
    return copy;
  }

  function done(payload) { if (typeof $done === "function") $done(payload || {}); }
  function doneBody(body, headers, contentType) { done({ body: body, headers: cleanHeaders(headers || {}, contentType) }); }
  function doneResponse(status, headers, body) { done({ response: { status: status || 200, headers: cleanHeaders(headers || {}), body: body || "" } }); }
  function passThrough() { done({}); }

  function httpStatusError(status, body) {
    var suffix = "";
    try {
      var parsed = JSON.parse(String(body || "")), detail = parsed && (parsed.error || parsed);
      if (detail && typeof detail === "object") {
        var safe = [];
        if (detail.type) safe.push("type=" + String(detail.type).replace(/[^a-z0-9_.-]/gi, "").slice(0, 80));
        if (detail.code !== undefined) safe.push("code=" + String(detail.code).replace(/[^a-z0-9_.-]/gi, "").slice(0, 40));
        ["n_prompt_tokens", "n_ctx"].forEach(function (key) {
          if (detail[key] !== undefined && /^\d+$/.test(String(detail[key]))) safe.push(key + "=" + detail[key]);
        });
        if (safe.length) suffix = " (" + safe.join(", ") + ")";
      }
    } catch (_) {}
    return new Error("HTTP " + status + suffix);
  }

  function httpRequest(input, callback) {
    if (typeof $httpClient === "undefined") { callback(new Error("$httpClient is unavailable")); return; }
    var options = typeof input === "string" ? { url: input } : (input || {});
    var method = String(options.method || "GET").toUpperCase();
    options.headers = cleanRequestHeaders(options.headers || {});
    if (!options.headers["User-Agent"] && !options.headers["user-agent"]) {
      options.headers["User-Agent"] = "GeneralStreamSubtitle/" + (GSS.VERSION || "dev");
    }
    var clientMethod = method === "POST" ? "post" : method === "PUT" ? "put" : method === "DELETE" ? "delete" : "get";
    if (!$httpClient[clientMethod]) { callback(new Error("$httpClient." + clientMethod + " is unavailable")); return; }
    delete options.method;
    $httpClient[clientMethod](options, function (error, response, body) {
      if (error) { callback(error); return; }
      var status = response && (response.status || response.statusCode);
      if (status && Number(status) >= 400) { callback(httpStatusError(status, body), body || "", response || {}); return; }
      callback(null, body || "", response || {});
    });
  }

  function httpGet(input, callback) {
    var options = typeof input === "string" ? { url: input } : (input || {});
    options.method = "GET";
    httpRequest(options, callback);
  }

  function httpPost(input, callback) {
    var options = typeof input === "string" ? { url: input } : (input || {});
    options.method = "POST";
    httpRequest(options, callback);
  }

  function read(key) {
    try { if (typeof $persistentStore !== "undefined" && $persistentStore.read) return $persistentStore.read(key); } catch (_) {}
    return null;
  }

  function write(value, key) {
    try { if (typeof $persistentStore !== "undefined" && $persistentStore.write) return $persistentStore.write(value, key); } catch (_) {}
    return false;
  }

  return {
    name: detectName(),
    request: typeof $request !== "undefined" ? $request : { url: "", method: "GET", headers: {}, body: "" },
    response: typeof $response !== "undefined" ? $response : { body: "", headers: {} },
    done: done,
    doneBody: doneBody,
    doneResponse: doneResponse,
    passThrough: passThrough,
    httpRequest: httpRequest,
    httpGet: httpGet,
    httpPost: httpPost,
    cleanHeaders: cleanHeaders,
    read: read,
    write: write
  };
})();

GSS.Hash = function hash(text) {
  var value = 2166136261;
  for (var i = 0; i < String(text).length; i += 1) {
    value ^= String(text).charCodeAt(i);
    value += (value << 1) + (value << 4) + (value << 7) + (value << 8) + (value << 24);
  }
  return (value >>> 0).toString(16);
};

GSS.Cache = function Cache(config, logger) {
  var indexKey = "GSS_CACHE_INDEX_V1";
  function entryKey(seed) { return "GSS_CACHE_V1_" + GSS.Hash(seed); }

  function get(seed) {
    if (!config.cacheEnabled) return null;
    var raw = GSS.Runtime.read(entryKey(seed));
    if (!raw) return null;
    try {
      var entry = JSON.parse(raw);
      if (!entry || typeof entry.body !== "string") return null;
      if (Date.now() - Number(entry.at || 0) > config.cacheTTL) return null;
      logger.debug("cache hit", { key: entryKey(seed) });
      return entry.body;
    } catch (_) { return null; }
  }

  function set(seed, body) {
    if (!config.cacheEnabled || typeof body !== "string") return;
    var key = entryKey(seed);
    GSS.Runtime.write(JSON.stringify({ at: Date.now(), body: body }), key);
    var index = [];
    try { index = JSON.parse(GSS.Runtime.read(indexKey) || "[]"); } catch (_) { index = []; }
    index = index.filter(function (item) { return item !== key; });
    index.push(key);
    while (index.length > config.cacheLimit) GSS.Runtime.write("", index.shift());
    GSS.Runtime.write(JSON.stringify(index), indexKey);
  }

  function clear() {
    var index = [];
    try { index = JSON.parse(GSS.Runtime.read(indexKey) || "[]"); } catch (_) {}
    index.forEach(function (key) { GSS.Runtime.write("", key); });
    GSS.Runtime.write("[]", indexKey);
    return index.length;
  }

  return { get: get, set: set, clear: clear };
};

GSS.Language = (function createLanguageTools() {
  var aliases = {
    en: ["english", "英文", "英语"],
    ja: ["japanese", "日本語", "日文", "日语"],
    ko: ["korean", "한국어", "韩文", "韩语"],
    es: ["spanish", "español", "西班牙语"],
    fr: ["french", "français", "法语"],
    de: ["german", "deutsch", "德语"],
    it: ["italian", "italiano", "意大利语"],
    pt: ["portuguese", "português", "葡萄牙语"],
    ru: ["russian", "русский", "俄语"],
    ar: ["arabic", "العربية", "阿拉伯语"],
    hi: ["hindi", "हिन्दी", "印地语"],
    th: ["thai", "ไทย", "泰语"],
    vi: ["vietnamese", "tiếng việt", "越南语"],
    id: ["indonesian", "bahasa indonesia", "印度尼西亚语"],
    zh: ["chinese", "中文", "简体中文", "繁體中文", "繁体中文"]
  };

  function normalize(value) {
    return String(value || "").trim().replace(/_/g, "-").toLowerCase();
  }

  function base(value) {
    var normalized = normalize(value);
    if (!normalized) return "";
    if (normalized === "zh-hans" || normalized === "zh-cn" || normalized === "cmn-hans") return "zh-cn";
    if (normalized === "zh-hant" || normalized === "zh-tw" || normalized === "zh-hk" || normalized === "cmn-hant") return "zh-tw";
    return normalized.split("-")[0];
  }

  function matches(language, name, wanted) {
    wanted = normalize(wanted || "auto");
    if (wanted === "auto") return true;
    var normalizedLanguage = normalize(language);
    var wantedBase = base(wanted);
    var languageBase = base(normalizedLanguage);
    if (normalizedLanguage === wanted || languageBase === wantedBase) return true;
    var loweredName = String(name || "").toLowerCase();
    var names = aliases[wantedBase] || [];
    for (var i = 0; i < names.length; i += 1) {
      if (loweredName.indexOf(names[i].toLowerCase()) >= 0) return true;
    }
    return false;
  }

  function googleSource(language, configured) {
    configured = normalize(configured || "auto");
    if (configured !== "auto") return base(configured) || configured;
    var detected = base(language);
    return detected || "auto";
  }

  function priority(language, name, preferred) {
    var normalized = base(language);
    var list = String(preferred || "en,ja,ko,es,fr,de,it,pt").split(/[,|]/).map(function (item) { return base(item); });
    var index = list.indexOf(normalized);
    if (index >= 0) return Math.max(0, 40 - index);
    var loweredName = String(name || "").toLowerCase();
    for (var key in aliases) {
      if (!Object.prototype.hasOwnProperty.call(aliases, key)) continue;
      for (var i = 0; i < aliases[key].length; i += 1) {
        if (loweredName.indexOf(aliases[key][i].toLowerCase()) >= 0) {
          var aliasIndex = list.indexOf(key);
          return aliasIndex >= 0 ? Math.max(0, 40 - aliasIndex) : 0;
        }
      }
    }
    return 0;
  }

  return {
    normalize: normalize,
    base: base,
    matches: matches,
    googleSource: googleSource,
    priority: priority
  };
})();

GSS.VERSION = "0.6.12";
GSS.SETTINGS_KEY = "GSS_SETTINGS_V4";
GSS.PROVIDER_SECRETS_KEY = "GSS_PROVIDER_SECRETS_V1";
GSS.ADMIN_TOKEN_KEY = "GSS_ADMIN_TOKEN_V1";

GSS.DEFAULTS = {
  enabled: true,
  provider: "google-free",
  fallbackProviders: "",
  providerEndpoint: "",
  providerModel: "",
  providerRegion: "",
  providerProject: "",
  providerLocation: "global",
  providerPrompt: "Translate each subtitle naturally and concisely. Preserve names, tone, punctuation, and the order of items.",
  source: "auto",
  sourcePriority: "en,ja,ko,es,fr,de,it,pt",
  target: "zh-CN",
  trackName: "Translate-zh",
  injectTranslated: false,
  translatedTrackName: "Translate-zh-only",
  bilingualOrder: "translation-first",
  platforms: "all",
  discoveryMode: "full",
  safePlayback: false,
  maxReplaceSource: false,
  presetMode: false,
  hyMt2Preset: false,
  platformDiscovery: false,
  discoveryHlsOnly: true,
  platformMax: true,
  platformPluto: true,
  platformPrime: true,
  platformHulu: true,
  platformYoutube: true,
  formats: "all",
  genericMode: false,
  customDomains: "",
  youtubeStrategy: "direct",
  youtubeUseAsr: true,
  youtubeLive: true,
  youtubePreferManual: true,
  logEnabled: true,
  debug: false,
  cacheEnabled: true,
  cacheTTL: 6 * 60 * 60 * 1000,
  cacheLimit: 120,
  batchChars: 1600,
  batchItems: 12,
  translationConcurrency: 2,
  virtualOrigin: "https://example.com"
};

GSS.parseArguments = function parseArguments(raw) {
  var result = {};
  if (!raw || typeof raw !== "string") return result;
  raw.replace(/^\?/, "").split(/[&,]/).forEach(function (pair) {
    if (!pair) return;
    var index = pair.indexOf("=");
    var key = index >= 0 ? pair.slice(0, index) : pair;
    var value = index >= 0 ? pair.slice(index + 1) : "true";
    try { key = decodeURIComponent(key.trim()); value = decodeURIComponent(value.trim()); } catch (_) {}
    if (key) result[key] = value;
  });
  return result;
};

GSS.asBoolean = function asBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
};

GSS.allowedSettings = {
  enabled: "boolean", provider: "string", fallbackProviders: "string", providerEndpoint: "string",
  providerModel: "string", providerRegion: "string", providerProject: "string", providerLocation: "string",
  providerPrompt: "string", source: "string", sourcePriority: "string", target: "string", trackName: "string",
  injectTranslated: "boolean", translatedTrackName: "string", bilingualOrder: "string", platforms: "string", discoveryMode: "string",
  safePlayback: "boolean", maxReplaceSource: "boolean", presetMode: "boolean", hyMt2Preset: "boolean", platformDiscovery: "boolean", discoveryHlsOnly: "boolean",
  platformMax: "boolean", platformPluto: "boolean", platformPrime: "boolean", platformHulu: "boolean", platformYoutube: "boolean",
  formats: "string", genericMode: "boolean", customDomains: "string", youtubeStrategy: "string",
  youtubeUseAsr: "boolean", youtubeLive: "boolean", youtubePreferManual: "boolean", logEnabled: "boolean", debug: "boolean", cacheEnabled: "boolean",
  cacheTTL: "number", cacheLimit: "number", batchChars: "number", batchItems: "number", translationConcurrency: "number"
};

GSS.normalizeSettings = function normalizeSettings(input) {
  var output = {};
  Object.keys(GSS.allowedSettings).forEach(function (key) {
    if (!input || input[key] === undefined || input[key] === null || input[key] === "") return;
    var type = GSS.allowedSettings[key];
    if (type === "boolean") output[key] = GSS.asBoolean(input[key], false);
    else if (type === "number" && !isNaN(Number(input[key]))) output[key] = Math.max(0, Number(input[key]));
    else if (type === "string") output[key] = String(input[key]).slice(0, key === "providerPrompt" ? 1200 : 600);
  });
  if (output.bilingualOrder && output.bilingualOrder !== "original-first") output.bilingualOrder = "translation-first";
  if (output.discoveryMode) {
    output.discoveryMode = String(output.discoveryMode).toLowerCase();
    if (output.discoveryMode !== "off" && output.discoveryMode !== "hls-only") output.discoveryMode = "full";
  }
  if (output.youtubeStrategy && output.youtubeStrategy !== "virtual") output.youtubeStrategy = "direct";
  if (output.source) output.source = GSS.Language ? GSS.Language.normalize(output.source) : String(output.source).toLowerCase();
  if (output.translationConcurrency !== undefined) output.translationConcurrency = Math.max(1, Math.min(4, Math.floor(output.translationConcurrency)));
  return output;
};

GSS.readStoredSettings = function readStoredSettings() {
  try { var raw = GSS.Runtime.read(GSS.SETTINGS_KEY); return raw ? GSS.normalizeSettings(JSON.parse(raw)) : {}; }
  catch (_) { return {}; }
};
GSS.saveSettings = function saveSettings(input) { return GSS.Runtime.write(JSON.stringify(GSS.normalizeSettings(input)), GSS.SETTINGS_KEY); };
GSS.resetSettings = function resetSettings() { return GSS.Runtime.write("", GSS.SETTINGS_KEY); };

GSS.readProviderSecrets = function readProviderSecrets() {
  try { return JSON.parse(GSS.Runtime.read(GSS.PROVIDER_SECRETS_KEY) || "{}"); } catch (_) { return {}; }
};
GSS.getProviderSecret = function getProviderSecret(provider, key) {
  var all = GSS.readProviderSecrets();
  return all[provider] && all[provider][key] ? String(all[provider][key]) : "";
};
GSS.saveProviderSecret = function saveProviderSecret(provider, key, value) {
  var all = GSS.readProviderSecrets();
  if (!all[provider]) all[provider] = {};
  if (value) all[provider][key] = String(value); else delete all[provider][key];
  return GSS.Runtime.write(JSON.stringify(all), GSS.PROVIDER_SECRETS_KEY);
};
GSS.providerHasKey = function providerHasKey(provider) { return !!GSS.getProviderSecret(provider, "apiKey"); };

GSS.getAdminToken = function getAdminToken() {
  var token = GSS.Runtime.read(GSS.ADMIN_TOKEN_KEY);
  if (token) return token;
  token = GSS.Hash ? GSS.Hash(String(Date.now()) + ":" + String(Math.random())) : String(Date.now());
  GSS.Runtime.write(token, GSS.ADMIN_TOKEN_KEY);
  return token;
};

GSS.getConfig = function getConfig() {
  var config = {};
  Object.keys(GSS.DEFAULTS).forEach(function (key) { config[key] = GSS.DEFAULTS[key]; });
  var args = GSS.normalizeSettings(GSS.parseArguments(typeof $argument !== "undefined" ? $argument : ""));
  var forcedDiscoveryMode = args.discoveryMode;
  Object.keys(args).forEach(function (key) { config[key] = args[key]; });
  var stored = GSS.readStoredSettings();
  Object.keys(stored).forEach(function (key) { config[key] = stored[key]; });
  // This compatibility switch must remain controllable from module arguments
  // even when older gss.local settings override normal module parameters.
  if (forcedDiscoveryMode) config.discoveryMode = forcedDiscoveryMode;
  if (args.presetMode) {
    var useHyMt2 = !!args.hyMt2Preset;
    var presetPlatforms = [];
    if (args.platformDiscovery) presetPlatforms.push("discovery");
    if (args.platformMax) presetPlatforms.push("max");
    if (args.platformPluto) presetPlatforms.push("pluto");
    if (args.platformPrime) presetPlatforms.push("prime");
    if (args.platformHulu) presetPlatforms.push("hulu");
    if (args.platformYoutube) { presetPlatforms.push("youtube"); presetPlatforms.push("youtube-tv"); }
    config.enabled = true;
    config.source = "auto";
    config.target = "zh-CN";
    config.trackName = "Translate-zh";
    config.provider = useHyMt2 ? "openai-compatible" : "google-free";
    config.fallbackProviders = useHyMt2 ? "google-free" : "";
    if (useHyMt2) {
      // Keep providerEndpoint in persistent settings so a private server URL and
      // API key never enter the public module. Shadowrocket only selects the
      // tested Hy-MT2 request profile here.
      config.providerModel = "hy-mt2-1.8b";
      config.providerPrompt = "Translate each subtitle naturally and concisely into Simplified Chinese. Preserve names, tone, punctuation, item count, and item order.";
      // These values belong to the fast fallback provider. The Hy-MT2 adapter
      // applies its own 512-token safety guard before sending a request.
      config.translationConcurrency = 4;
      config.batchItems = 12;
      config.batchChars = 1600;
    }
    config.platforms = presetPlatforms.join("|") || "none";
    config.discoveryMode = args.platformDiscovery ? (args.discoveryHlsOnly === false ? "full" : "hls-only") : "off";
    config.formats = "all";
    config.genericMode = !!args.genericMode;
    config.youtubeStrategy = "direct";
    config.youtubeUseAsr = args.youtubeUseAsr !== false;
    config.youtubeLive = args.youtubeLive !== false;
    config.youtubePreferManual = true;
    config.injectTranslated = !!args.injectTranslated;
    config.bilingualOrder = "translation-first";
    config.cacheEnabled = args.cacheEnabled !== false;
    config.logEnabled = args.logEnabled !== false;
    config.debug = !!args.debug;
    config.safePlayback = true;
    // Max/tvOS removes synthetic subtitle renditions after selection. Keep the
    // trusted source rendition and route its URI through bilingual translation.
    config.maxReplaceSource = args.maxReplaceSource !== false;
    config.presetMode = true;
    config.hyMt2Preset = useHyMt2;
  }
  config.source = config.source || "auto";
  config.provider = config.provider || "google-free";
  config.trackName = config.trackName || "Translate-zh";
  config.translatedTrackName = config.translatedTrackName || "Translate-zh-only";
  config.platforms = config.platforms || "all";
  config.discoveryMode = config.discoveryMode || "full";
  config.formats = config.formats || "all";
  return config;
};

GSS.Logger = function Logger(config, scope) {
  var prefix = "[GSS " + GSS.VERSION + "][" + GSS.Runtime.name + "][" + scope + "]";
  function persist(level, message, data) {
    if (!config.logEnabled || !GSS.Diagnostics) return;
    if (!config.debug && (level === "DEBUG" || level === "INFO")) return;
    GSS.Diagnostics.record({
      scope: scope,
      type: "runtime-log",
      level: level.toLowerCase(),
      status: level === "ERROR" ? "failed" : level === "WARN" ? "warning" : "observed",
      message: message,
      details: data
    });
  }
  function print(level, message, data) {
    persist(level, message, data);
    if (!config.debug && (level === "DEBUG" || level === "INFO")) return;
    var safeMessage = GSS.Diagnostics && GSS.Diagnostics.sanitize ? GSS.Diagnostics.sanitize(message) : message;
    var safeData = GSS.Diagnostics && GSS.Diagnostics.sanitize ? GSS.Diagnostics.sanitize(data) : data;
    var suffix = "";
    if (safeData !== undefined) {
      try { suffix = " " + JSON.stringify(safeData); } catch (_) { suffix = " " + String(safeData); }
    }
    console.log(prefix + "[" + level + "] " + safeMessage + suffix);
  }
  return {
    debug: function (message, data) { print("DEBUG", message, data); },
    info: function (message, data) { print("INFO", message, data); },
    warn: function (message, data) { print("WARN", message, data); },
    error: function (message, data) { print("ERROR", message, data); }
  };
};

GSS.Url = {
  getParam: function getParam(url, name) {
    if (!url) return null;
    var queryIndex = url.indexOf("?");
    if (queryIndex < 0) return null;
    var hashIndex = url.indexOf("#", queryIndex);
    var query = url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : url.length);
    var pairs = query.split("&");
    for (var i = 0; i < pairs.length; i += 1) {
      var equals = pairs[i].indexOf("=");
      var key = equals >= 0 ? pairs[i].slice(0, equals) : pairs[i];
      var value = equals >= 0 ? pairs[i].slice(equals + 1) : "";
      try { key = decodeURIComponent(key); } catch (_) {}
      if (key === name) {
        try { return decodeURIComponent(value); } catch (_) { return value; }
      }
    }
    return null;
  },

  queryObject: function queryObject(url) {
    var output = {};
    if (!url || url.indexOf("?") < 0) return output;
    url.slice(url.indexOf("?") + 1).split("#")[0].split("&").forEach(function (pair) {
      if (!pair) return;
      var index = pair.indexOf("=");
      var key = index >= 0 ? pair.slice(0, index) : pair;
      var value = index >= 0 ? pair.slice(index + 1) : "";
      try { key = decodeURIComponent(key); value = decodeURIComponent(value); } catch (_) {}
      output[key] = value;
    });
    return output;
  },

  appendParams: function appendParams(uri, params) {
    if (!uri) return uri;
    var hash = "";
    var hashIndex = uri.indexOf("#");
    if (hashIndex >= 0) { hash = uri.slice(hashIndex); uri = uri.slice(0, hashIndex); }
    var parts = [];
    Object.keys(params || {}).forEach(function (key) {
      if (params[key] === undefined || params[key] === null) return;
      parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(params[key])));
    });
    if (!parts.length) return uri + hash;
    return uri + (uri.indexOf("?") >= 0 ? "&" : "?") + parts.join("&") + hash;
  },

  origin: function origin(url) {
    var match = String(url || "").match(/^(https?):\/\/([^\/]+)/i);
    return match ? match[1] + "://" + match[2] : "";
  },

  path: function path(url) {
    var match = String(url || "").match(/^https?:\/\/[^\/]+([^?#]*)/i);
    return match ? (match[1] || "/") : "/";
  },

  host: function host(url) {
    var match = String(url || "").match(/^https?:\/\/([^\/:?#]+)(?::\d+)?/i);
    return match ? match[1].toLowerCase() : "";
  },

  resolve: function resolve(base, relative) {
    relative = String(relative || "");
    if (/^https?:\/\//i.test(relative)) return relative;
    if (/^\/\//.test(relative)) {
      var scheme = String(base || "").match(/^(https?):/i);
      return (scheme ? scheme[1] : "https") + ":" + relative;
    }
    var baseOrigin = GSS.Url.origin(base);
    if (!baseOrigin) return relative;
    if (relative[0] === "/") return baseOrigin + relative;
    var cleanBase = String(base).split("#")[0].split("?")[0];
    var slash = cleanBase.lastIndexOf("/");
    var joined = (slash >= 0 ? cleanBase.slice(0, slash + 1) : cleanBase + "/") + relative;
    var prefix = GSS.Url.origin(joined);
    var pathPart = joined.slice(prefix.length).split("/");
    var stack = [];
    pathPart.forEach(function (part) {
      if (!part || part === ".") return;
      if (part === "..") stack.pop(); else stack.push(part);
    });
    return prefix + "/" + stack.join("/");
  },

  virtual: function virtual(base, route, params) {
    return GSS.Url.appendParams(String(base || "https://example.com").replace(/\/$/, "") + route, params);
  },

  extension: function extension(uri) {
    var clean = String(uri || "").split("#")[0].split("?")[0].toLowerCase();
    var match = clean.match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }
};

GSS.Diagnostics = (function createDiagnostics() {
  var KEY = "GSS_DIAGNOSTICS_V1";
  var LIMIT = 80;
  var MAX_BYTES = 120000;

  function readAll() {
    try {
      var parsed = JSON.parse(GSS.Runtime.read(KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }

  function safeUrl(url) {
    var host = GSS.Url.host(url);
    var path = GSS.Url.path(url);
    if (path.length > 180) path = path.slice(0, 177) + "...";
    return host ? "https://" + host + path : String(url || "").split("?")[0].slice(0, 220);
  }

  function cleanString(value) {
    var output = String(value || "");
    output = output.replace(/https?:\/\/[^\s"'<>]+/gi, function (match) { return safeUrl(match); });
    output = output.replace(/(bearer\s+)[a-z0-9._~+\/-]+=*/gi, "$1[REDACTED]");
    output = output.replace(/\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/gi, "[REDACTED_JWT]");
    output = output.replace(/\b(token|authorization|cookie|signature|policy|api[_-]?key|x-amz-[a-z0-9-]+)\s*[:=]\s*[^,\s;&]+/gi, "$1=[REDACTED]");
    return output.length > 320 ? output.slice(0, 317) + "..." : output;
  }

  function cleanValue(value, depth) {
    if (depth > 4) return undefined;
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return cleanString(value);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.slice(0, 16).map(function (item) { return cleanValue(item, depth + 1); });
    if (typeof value === "object") {
      var output = {};
      Object.keys(value).slice(0, 24).forEach(function (key) {
        if (/token|authorization|cookie|signature|policy|secret|password|api.?key/i.test(key)) return;
        var cleaned = cleanValue(value[key], depth + 1);
        if (cleaned !== undefined) output[key] = cleaned;
      });
      return output;
    }
    return cleanString(value);
  }

  function requestId() {
    return Date.now().toString(36) + "-" + Math.floor(Math.random() * 1679616).toString(36);
  }

  function fingerprint(row) {
    return [row.scope || "", row.platform || "", row.type || "", row.level || "", row.status || "", row.group || row.url || ""].join("|");
  }

  function trimToBudget(rows) {
    if (rows.length > LIMIT) rows.length = LIMIT;
    var serialized = JSON.stringify(rows);
    while (serialized.length > MAX_BYTES && rows.length > 1) {
      rows.pop();
      serialized = JSON.stringify(rows);
    }
    return serialized;
  }

  function record(event) {
    try {
      var rows = readAll();
      var row = cleanValue(event || {}, 0) || {};
      row.time = new Date().toISOString();
      row.runtime = row.runtime || GSS.Runtime.name;
      row.requestId = row.requestId || requestId();
      row.level = String(row.level || "info").toLowerCase();
      row.status = row.status || "observed";
      if (row.url) row.url = safeUrl(row.url);
      var throttleMs = Math.max(0, Number(row.throttleSeconds || 0)) * 1000;
      delete row.throttleSeconds;
      if (throttleMs) {
        var rowFingerprint = fingerprint(row);
        for (var i = 0; i < rows.length; i += 1) {
          if (fingerprint(rows[i]) === rowFingerprint && Date.parse(row.time) - Date.parse(rows[i].lastTime || rows[i].time) < throttleMs) return;
        }
      }
      var latest = rows[0];
      var now = Date.parse(row.time);
      if (latest && fingerprint(latest) === fingerprint(row) && now - Date.parse(latest.lastTime || latest.time) < 60000) {
        row.firstTime = latest.firstTime || latest.time;
        row.count = Number(latest.count || 1) + 1;
        row.lastTime = row.time;
        rows[0] = row;
      } else {
        row.count = 1;
        rows.unshift(row);
      }
      GSS.Runtime.write(trimToBudget(rows), KEY);
    } catch (_) {}
  }

  function list() { return readAll(); }
  function clear() { return GSS.Runtime.write("[]", KEY); }
  function sanitize(value) { return cleanValue(value, 0); }
  function summary() {
    var rows = readAll(), output = { total: rows.length, errors: 0, warnings: 0, rewritten: 0, bypassed: 0 };
    rows.forEach(function (row) {
      if (row.level === "error") output.errors += 1;
      if (row.level === "warn" || row.level === "warning") output.warnings += 1;
      if (row.status === "rewritten" || row.changed === true) output.rewritten += 1;
      if (row.status === "bypassed" || row.status === "fallback") output.bypassed += 1;
    });
    return output;
  }

  return { record: record, list: list, clear: clear, summary: summary, sanitize: sanitize, requestId: requestId, safeUrl: safeUrl, key: KEY };
})();

GSS.Formats = (function createFormatRegistry() {
  var registry = {};
  function register(id, format) { registry[id] = format; }
  function list() { return Object.keys(registry).map(function (id) { return { id: id, name: registry[id].name || id, binary: !!registry[id].binary }; }); }
  function enabled(id, config) {
    var raw = String(config.formats || "all").toLowerCase();
    if (!raw || raw === "all") return true;
    return raw.split(/[,|]/).map(function (item) { return item.trim(); }).indexOf(id) >= 0;
  }
  function detect(body, url, contentType, config) {
    var ids = Object.keys(registry);
    for (var i = 0; i < ids.length; i += 1) {
      if (!enabled(ids[i], config)) continue;
      if (registry[ids[i]].detect(body, url, contentType)) return registry[ids[i]];
    }
    return null;
  }
  function extension(url) { return GSS.Url.extension(url); }
  function stripTags(text) { return String(text || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim(); }
  function escapeXml(text) { return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function uniqueTexts(cues) {
    var texts = [], indexes = {};
    cues.forEach(function (cue) {
      var key = String(cue.text || "");
      if (indexes[key] === undefined) { indexes[key] = texts.length; texts.push(key); }
      cue.translationIndex = indexes[key];
    });
    return texts;
  }
  return { register: register, list: list, detect: detect, enabled: enabled, extension: extension, stripTags: stripTags, escapeXml: escapeXml, uniqueTexts: uniqueTexts };
})();

GSS.Platforms = (function createPlatformRegistry() {
  var list = [
    { id: "youtube-tv", name: "YouTube TV", maturity: "experimental", test: function (host) { return host === "tv.youtube.com"; } },
    { id: "youtube", name: "YouTube / Shorts / Live", maturity: "experimental", test: function (host) { return /(^|\.)(youtube\.com|youtube-nocookie\.com)$/.test(host) || host === "youtubei.googleapis.com"; } },
    { id: "apple-fitness", name: "Apple Fitness+", maturity: "stable", test: function (host, path) { return /(^|\.)itunes\.apple\.com$/.test(host) && /\/hls\/workout\//.test(path); } },
    { id: "apple-tv-plus", name: "Apple TV+", maturity: "stable", test: function (host, path) { return /(^|\.)itunes\.apple\.com$/.test(host) && /\/hls\/subscription\//.test(path); } },
    { id: "apple-tv", name: "Apple TV", maturity: "stable", test: function (host) { return /(^|\.)itunes\.apple\.com$/.test(host) || /(^|\.)tv\.apple\.com$/.test(host); } },
    {
      id: "discovery",
      name: "Discovery+",
      maturity: "stable",
      test: function (host) {
        if (/(^|\.)(uplynk\.com|disco-api\.com|discoveryplus\.com|discoveryplus\.co\.uk|discoveryplus\.in)$/.test(host)) return true;
        return /(^|\.)(?:dplus|discovery)[-.]/.test(host) && /(^|\.)(?:h264\.io|akamaized\.net)$/.test(host);
      }
    },
    { id: "max", name: "Max / HBO Max", maturity: "stable", test: function (host) { return /(^|\.)(max\.com|discomax\.com|h264\.io|hbomaxcdn\.com|api\.hbo\.com)$/.test(host); } },
    { id: "disney", name: "Disney+", maturity: "stable", test: function (host) { return /\.(media|prod)\.(dssott|starott|dssedge)\.com$/.test(host); } },
    { id: "prime", name: "Prime Video", maturity: "stable", test: function (host) { return /(\.hls\.(pv-cdn|row\.aiv-cdn)\.net$|avodhlss3ww-a\.akamaihd\.net$|^s3\.amazonaws\.com$|^cf-timedtext\.aux\.pv-cdn\.net$|^(d1v5ir2lpwr8os|d22qjgkvxw22r6|d25xi40x97liuc|d27xxe7juh1us6|dmqdd6hw24ucf)\.cloudfront\.net$)/.test(host); } },
    { id: "hulu", name: "Hulu", maturity: "stable", test: function (host) { return /(^|\.)(hulustream\.com|huluim\.com)$/.test(host) || host === "assetshuluimcom-a.akamaihd.net"; } },
    { id: "paramount-live", name: "Paramount+ Live TV", maturity: "experimental", test: function (host, path, url) { return /(^|\.)(pplus\.paramount\.tech|paramount\.tech|paramountplus\.com|cbsaavideo\.com|cbsivideo\.com|cbs\.com)$/.test(host) && /(live|linear|channel|station|stream|broadcast)/i.test(String(path || "") + " " + String(url || "")); } },
    { id: "paramount", name: "Paramount+", maturity: "stable", test: function (host) { return /(^|\.)(pplus\.paramount\.tech|paramount\.tech|paramountplus\.com|cbsaavideo\.com|cbsivideo\.com|cbs\.com)$/.test(host); } },
    { id: "peacock", name: "Peacock", maturity: "stable", test: function (host) { return /\.cdn\.peacocktv\.com$/.test(host); } },
    { id: "fubo", name: "Fubo", maturity: "stable", test: function (host) { return /-vod\.fubo\.tv$/.test(host); } },
    { id: "ted", name: "TED", maturity: "stable", test: function (host) { return host === "hls.ted.com"; } },
    { id: "bbc", name: "BBC iPlayer", maturity: "experimental", test: function (host) { return /(^|\.)bbci\.co\.uk$/.test(host) || /^vod-.*-live\.akamaized\.net$/.test(host); } },
    { id: "viki", name: "Rakuten Viki", maturity: "experimental", test: function (host) { return /(^|\.)(viki\.io|viki\.com)$/.test(host); } },
    { id: "tubi", name: "Tubi", maturity: "experimental", test: function (host) { return /(^|\.)(tubi\.video|tubitv\.com)$/.test(host); } },
    { id: "pluto", name: "Pluto TV", maturity: "experimental", test: function (host) { return /(^|\.)pluto\.tv$/.test(host); } },
    { id: "crunchyroll", name: "Crunchyroll / VRV", maturity: "experimental", test: function (host) { return /(^|\.)(crunchyroll\.com|vrv\.co)$/.test(host); } },
    { id: "dazn", name: "DAZN", maturity: "experimental", test: function (host) { return /(^|\.)(dazn\.com|dazn-api\.com)$/.test(host); } },
    { id: "plex", name: "Plex", maturity: "experimental", test: function (host) { return /(^|\.)plex\.tv$/.test(host); } }
  ];

  function customDomainMatch(host, config) {
    var domains = String(config.customDomains || "").split(/[,|]/).map(function (item) { return item.trim().toLowerCase().replace(/^\*\./, ""); }).filter(Boolean);
    for (var i = 0; i < domains.length; i += 1) if (host === domains[i] || host.slice(-(domains[i].length + 1)) === "." + domains[i]) return true;
    return false;
  }

  function detect(url, config) {
    var host = GSS.Url.host(url), path = GSS.Url.path(url);
    for (var i = 0; i < list.length; i += 1) if (list[i].test(host, path, url)) return list[i];
    if (customDomainMatch(host, config || {})) return { id: "custom", name: "Custom Domain", maturity: "custom" };
    if (config && config.genericMode && /\.(m3u8|mpd)(?:$|[?#])/i.test(url)) return { id: "generic", name: "Generic HLS/DASH", maturity: "experimental" };
    return null;
  }

  function enabled(platform, config) {
    if (!platform) return false;
    var raw = String(config.platforms || "all").trim().toLowerCase();
    if (!raw || raw === "all") return true;
    var enabledIds = raw.split(/[,|]/).map(function (item) { return item.trim(); });
    return enabledIds.indexOf(platform.id) >= 0;
  }

  function publicList() {
    var output = list.map(function (item) { return { id: item.id, name: item.name, maturity: item.maturity }; });
    output.push({ id: "custom", name: "Custom Domains", maturity: "custom" });
    output.push({ id: "generic", name: "Generic HLS/DASH", maturity: "experimental" });
    return output;
  }

  return { detect: detect, enabled: enabled, list: publicList };
})();

GSS.YouTube = (function createYouTubeAdapter() {
  function trackName(track) {
    var name = track && track.name;
    if (!name) return "";
    if (typeof name.simpleText === "string") return name.simpleText;
    if (Array.isArray(name.runs)) return name.runs.map(function (run) { return run.text || ""; }).join("");
    return "";
  }

  function detectPlatform(request) {
    var url = request && request.url || "", body = request && request.body || "";
    if (GSS.Url.host(url) === "tv.youtube.com" || /\"clientName\"\s*:\s*\"(?:TVHTML5|YOUTUBE_TV|TV)\"/i.test(body)) return { id: "youtube-tv", name: "YouTube TV" };
    return { id: "youtube", name: "YouTube" };
  }

  function findRenderers(root) {
    var found = [], seen = [], maxNodes = 3000;
    function walk(value, depth) {
      if (!value || typeof value !== "object" || depth > 12 || seen.length > maxNodes) return;
      if (seen.indexOf(value) >= 0) return;
      seen.push(value);
      if (value.playerCaptionsTracklistRenderer && typeof value.playerCaptionsTracklistRenderer === "object") found.push(value.playerCaptionsTracklistRenderer);
      Object.keys(value).forEach(function (key) { walk(value[key], depth + 1); });
    }
    walk(root, 0);
    return found;
  }

  function isLiveResponse(data) {
    return !!(data && data.videoDetails && data.videoDetails.isLiveContent)
      || !!(data && data.playabilityStatus && data.playabilityStatus.liveStreamability)
      || !!(data && data.microformat && data.microformat.playerMicroformatRenderer && data.microformat.playerMicroformatRenderer.liveBroadcastDetails);
  }

  function chooseTrack(renderer, config) {
    var tracks = renderer.captionTracks || [], defaultIndexes = {};
    (renderer.audioTracks || []).forEach(function (audio) {
      if (audio && audio.defaultCaptionTrackIndex !== undefined) defaultIndexes[Number(audio.defaultCaptionTrackIndex)] = true;
    });
    var candidates = [];
    tracks.forEach(function (track, index) {
      if (!track || !track.baseUrl || /(?:gss_mode=|(?:gss\.local|example\.com)\/youtube)/.test(track.baseUrl)) return;
      var name = trackName(track), language = track.languageCode || "", asr = String(track.kind || "").toLowerCase() === "asr" || /auto-generated|automatic/i.test(name);
      if (asr && !config.youtubeUseAsr) return;
      if (!GSS.Language.matches(language, name, config.source)) return;
      var score = GSS.Language.priority(language, name, config.sourcePriority);
      if (defaultIndexes[index]) score += 100;
      if (config.youtubePreferManual) score += asr ? 0 : 30;
      else score += asr ? 10 : 0;
      candidates.push({ track: track, index: index, score: score, asr: asr, language: language, name: name });
    });
    candidates.sort(function (a, b) { return b.score !== a.score ? b.score - a.score : a.index - b.index; });
    return candidates[0] || null;
  }

  function appendDirect(origin, mode, source, target, platform, live) {
    return GSS.Url.appendParams(origin, {
      gss_mode: mode, gss_source: source, gss_target: target, gss_platform: platform,
      gss_live: live ? "1" : "0", gss_v: GSS.VERSION
    });
  }

  function virtualUrl(config, origin, mode, source, target, platform, live) {
    return GSS.Url.virtual(config.virtualOrigin, "/youtube", {
      origin: origin, mode: mode, source: source, target: target, platform: platform,
      live: live ? "1" : "0", version: GSS.VERSION
    });
  }

  function cloneTrack(candidate, mode, config, platform, live) {
    var source = GSS.Language.googleSource(candidate.language, config.source);
    var clone = {};
    Object.keys(candidate.track).forEach(function (key) { clone[key] = candidate.track[key]; });
    clone.name = { simpleText: mode === "translate" ? config.translatedTrackName : config.trackName };
    clone.languageCode = config.target;
    clone.vssId = ".gss." + String(config.target || "zh-CN").replace(/[^a-z0-9-]/gi, "");
    clone.isTranslatable = false;
    delete clone.kind;
    clone.baseUrl = config.youtubeStrategy === "virtual"
      ? virtualUrl(config, candidate.track.baseUrl, mode, source, config.target, platform.id, live)
      : appendDirect(candidate.track.baseUrl, mode, source, config.target, platform.id, live);
    return clone;
  }

  function attachIndex(renderer, sourceIndex, newIndex) {
    (renderer.audioTracks || []).forEach(function (audio) {
      if (!audio) return;
      if (!Array.isArray(audio.captionTrackIndices)) audio.captionTrackIndices = [];
      if (!audio.captionTrackIndices.length || audio.captionTrackIndices.indexOf(sourceIndex) >= 0) {
        if (audio.captionTrackIndices.indexOf(newIndex) < 0) audio.captionTrackIndices.push(newIndex);
      }
    });
  }

  function inject(data, request, config, logger) {
    var platform = detectPlatform(request);
    if (!GSS.Platforms.enabled(platform, config)) return { changed: false, data: data, platform: platform, reason: "platform disabled" };
    var live = isLiveResponse(data);
    if (live && !config.youtubeLive) return { changed: false, data: data, platform: platform, live: true, reason: "live disabled" };
    var renderers = findRenderers(data), injected = 0, selected = null;
    renderers.forEach(function (renderer) {
      if (!Array.isArray(renderer.captionTracks) || renderer.captionTracks.some(function (track) { return track && /(?:gss_mode=|(?:gss\.local|example\.com)\/youtube)/.test(track.baseUrl || ""); })) return;
      var candidate = chooseTrack(renderer, config);
      if (!candidate) return;
      selected = candidate;
      var sourceIndex = candidate.index;
      var bilingualIndex = renderer.captionTracks.length;
      renderer.captionTracks.push(cloneTrack(candidate, "bilingual", config, platform, live));
      attachIndex(renderer, sourceIndex, bilingualIndex);
      injected += 1;
      if (config.injectTranslated) {
        var translatedIndex = renderer.captionTracks.length;
        renderer.captionTracks.push(cloneTrack(candidate, "translate", config, platform, live));
        attachIndex(renderer, sourceIndex, translatedIndex);
        injected += 1;
      }
    });
    logger.info("YouTube player response inspected", {
      platform: platform.id, live: live, renderers: renderers.length, injected: injected,
      selectedName: selected ? selected.name : "", selectedLanguage: selected ? selected.language : "",
      sourceType: selected ? (selected.asr ? "asr" : "manual") : "none", strategy: config.youtubeStrategy
    });
    return { changed: injected > 0, data: data, platform: platform, live: live, injected: injected, selected: selected };
  }

  return { inject: inject, chooseTrack: chooseTrack, detectPlatform: detectPlatform, findRenderers: findRenderers };
})();

(function youtubePlayerEntry() {
  var config = GSS.getConfig(), logger = GSS.Logger(config, "youtube-player");
  var requestId = GSS.Diagnostics ? GSS.Diagnostics.requestId() : "";
  function trace(type, status, details, level) {
    if (!config.logEnabled || !GSS.Diagnostics) return;
    GSS.Diagnostics.record({ requestId: requestId, scope: "youtube-player", platform: details && details.platform || "youtube", type: type, level: level || "info", status: status, group: (details && details.platform || "youtube") + "|" + type, throttleSeconds: !level || level === "info" ? 10 : 0, url: GSS.Runtime.request.url || "", details: details || {} });
  }
  try {
    if (!config.enabled) { GSS.Runtime.passThrough(); return; }
    var raw = String(GSS.Runtime.response.body || ""), prefix = "";
    if (raw.slice(0, 4) === ")]}'") { var split = raw.indexOf("\n"); prefix = split >= 0 ? raw.slice(0, split + 1) : ")]}'\n"; raw = split >= 0 ? raw.slice(split + 1) : raw.slice(4); }
    var data = JSON.parse(raw);
    var result = GSS.YouTube.inject(data, GSS.Runtime.request, config, logger);
    if (!result.changed) { trace("player-response", "bypassed", { platform: result.platform ? result.platform.id : "youtube", live: !!result.live, reason: result.reason || "no supported text captions" }); GSS.Runtime.passThrough(); return; }
    trace("player-response", "rewritten", { platform: result.platform ? result.platform.id : "youtube", live: !!result.live, injected: result.injected || 0, sourceType: result.selected ? (result.selected.asr ? "asr" : "manual") : "none", selectedLanguage: result.selected ? result.selected.language : "" });
    GSS.Runtime.doneBody(prefix + JSON.stringify(data), GSS.Runtime.response.headers, "application/json; charset=utf-8");
  } catch (error) {
    trace("exception", "failed", { error: String(error) }, "error");
    logger.error("YouTube player processing failed; original response preserved", { error: String(error), stack: error && error.stack });
    GSS.Runtime.passThrough();
  }
})();
})();
