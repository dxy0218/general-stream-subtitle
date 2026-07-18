// General Stream Subtitle 0.5.0 - gateway
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
      if (lower === "content-length" || lower === "content-encoding" || lower === "transfer-encoding") delete copy[key];
    });
    if (contentType) {
      delete copy["content-type"];
      copy["Content-Type"] = contentType;
    }
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
      if (status && Number(status) >= 400) { callback(new Error("HTTP " + status), body || "", response || {}); return; }
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

GSS.VERSION = "0.5.0";
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
  formats: "all",
  genericMode: false,
  customDomains: "",
  youtubeStrategy: "direct",
  youtubeUseAsr: true,
  youtubeLive: true,
  youtubePreferManual: true,
  debug: true,
  cacheEnabled: true,
  cacheTTL: 6 * 60 * 60 * 1000,
  cacheLimit: 120,
  batchChars: 1600,
  batchItems: 12,
  virtualOrigin: "https://gss.local"
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
  injectTranslated: "boolean", translatedTrackName: "string", bilingualOrder: "string", platforms: "string",
  formats: "string", genericMode: "boolean", customDomains: "string", youtubeStrategy: "string",
  youtubeUseAsr: "boolean", youtubeLive: "boolean", youtubePreferManual: "boolean", debug: "boolean", cacheEnabled: "boolean",
  cacheTTL: "number"
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
  if (output.youtubeStrategy && output.youtubeStrategy !== "virtual") output.youtubeStrategy = "direct";
  if (output.source) output.source = GSS.Language ? GSS.Language.normalize(output.source) : String(output.source).toLowerCase();
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
  Object.keys(args).forEach(function (key) { config[key] = args[key]; });
  var stored = GSS.readStoredSettings();
  Object.keys(stored).forEach(function (key) { config[key] = stored[key]; });
  config.source = config.source || "auto";
  config.provider = config.provider || "google-free";
  config.trackName = config.trackName || "Translate-zh";
  config.translatedTrackName = config.translatedTrackName || "Translate-zh-only";
  config.platforms = config.platforms || "all";
  config.formats = config.formats || "all";
  return config;
};

GSS.Logger = function Logger(config, scope) {
  var prefix = "[GSS " + GSS.VERSION + "][" + GSS.Runtime.name + "][" + scope + "]";
  function print(level, message, data) {
    if (level === "DEBUG" && !config.debug) return;
    var suffix = "";
    if (data !== undefined) {
      try { suffix = " " + JSON.stringify(data); } catch (_) { suffix = " " + String(data); }
    }
    console.log(prefix + "[" + level + "] " + message + suffix);
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
    return GSS.Url.appendParams(String(base || "https://gss.local").replace(/\/$/, "") + route, params);
  },

  extension: function extension(uri) {
    var clean = String(uri || "").split("#")[0].split("?")[0].toLowerCase();
    var match = clean.match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }
};

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
    { id: "max", name: "Max / HBO Max", maturity: "stable", test: function (host) { return /(^|\.)(max\.com|h264\.io|hbomaxcdn\.com|api\.hbo\.com)$/.test(host); } },
    { id: "disney", name: "Disney+", maturity: "stable", test: function (host) { return /\.(media|prod)\.(dssott|starott|dssedge)\.com$/.test(host); } },
    { id: "prime", name: "Prime Video", maturity: "stable", test: function (host) { return /(\.hls\.(pv-cdn|row\.aiv-cdn)\.net$|avodhlss3ww-a\.akamaihd\.net$|^s3\.amazonaws\.com$|^cf-timedtext\.aux\.pv-cdn\.net$|^(d1v5ir2lpwr8os|d22qjgkvxw22r6|d25xi40x97liuc|d27xxe7juh1us6|dmqdd6hw24ucf)\.cloudfront\.net$)/.test(host); } },
    { id: "hulu", name: "Hulu", maturity: "stable", test: function (host) { return /(^|\.)(hulustream\.com|huluim\.com)$/.test(host) || host === "assetshuluimcom-a.akamaihd.net"; } },
    { id: "paramount", name: "Paramount+", maturity: "stable", test: function (host) { return /(^|\.)(pplus\.paramount\.tech|cbsaavideo\.com|cbsivideo\.com|cbs\.com)$/.test(host); } },
    { id: "peacock", name: "Peacock", maturity: "stable", test: function (host) { return /\.cdn\.peacocktv\.com$/.test(host); } },
    { id: "discovery", name: "Discovery+", maturity: "stable", test: function (host) { return host === "content-discovery.uplynk.com" || /dplus-ph-/.test(host); } },
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

GSS.Formats.register("youtube", (function createYouTubeFormat() {
  function decodeXml(text) {
    return GSS.Formats.stripTags(String(text || "")
      .replace(/&#(\d+);/g, function (_, code) { return String.fromCharCode(Number(code)); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, code) { return String.fromCharCode(parseInt(code, 16)); })
      .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'"));
  }

  function detect(body, url, contentType) {
    var text = String(body || "").trim();
    if (/^\{/.test(text)) {
      try {
        var data = JSON.parse(text);
        return Array.isArray(data.events) && data.events.some(function (event) { return event && (Array.isArray(event.segs) || event.tStartMs !== undefined); });
      } catch (_) {}
    }
    return /<transcript(?:\s|>)/i.test(text) || /<timedtext(?:\s|>)/i.test(text)
      || /<p\b[^>]*(?:\bt=|\bd=)[^>]*>[\s\S]*<\/p>/i.test(text)
      || (/\/api\/timedtext/i.test(String(url || "")) && /<(?:text|p)\b/i.test(text));
  }

  function parseJson(body) {
    var data = JSON.parse(String(body || "")), cues = [];
    (data.events || []).forEach(function (event, index) {
      if (!event || !Array.isArray(event.segs)) return;
      var original = event.segs.map(function (seg) { return seg && typeof seg.utf8 === "string" ? seg.utf8 : ""; }).join("");
      var text = GSS.Formats.stripTags(original);
      if (text) cues.push({ kind: "json3", index: index, original: original, text: text });
    });
    return { kind: "json3", data: data, cues: cues };
  }

  function parseXml(body) {
    var source = String(body || ""), cues = [], transcript = /<transcript(?:\s|>)/i.test(source);
    var regex = transcript ? /<text\b([^>]*)>([\s\S]*?)<\/text>/gi : /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
    var match;
    while ((match = regex.exec(source))) {
      var text = decodeXml(match[2]);
      if (!text) continue;
      cues.push({ kind: transcript ? "transcript" : "srv3", start: match.index, end: regex.lastIndex, attrs: match[1], inner: match[2], text: text });
    }
    return { kind: transcript ? "transcript" : "srv3", source: source, cues: cues };
  }

  function parse(body) {
    var text = String(body || "").trim();
    return /^\{/.test(text) ? parseJson(body) : parseXml(body);
  }

  function combine(original, translated, mode, order) {
    if (mode !== "bilingual") return translated;
    return order === "original-first" ? original + "\n" + translated : translated + "\n" + original;
  }

  function render(parsed, translations, mode, order) {
    if (parsed.kind === "json3") {
      parsed.cues.forEach(function (cue) {
        var translated = String(translations[cue.translationIndex] || "").trim();
        if (!translated) return;
        parsed.data.events[cue.index].segs = [{ utf8: combine(cue.original, translated, mode, order) }];
      });
      return JSON.stringify(parsed.data);
    }
    var source = parsed.source, replacements = [];
    parsed.cues.forEach(function (cue) {
      var translated = String(translations[cue.translationIndex] || "").trim();
      if (!translated) return;
      var original = decodeXml(cue.inner);
      var value = GSS.Formats.escapeXml(combine(original, translated, mode, order)).replace(/\n/g, "&#10;");
      var tag = cue.kind === "transcript" ? "text" : "p";
      if (cue.kind === "srv3") value = "<s>" + value + "</s>";
      replacements.push({ start: cue.start, end: cue.end, value: "<" + tag + cue.attrs + ">" + value + "</" + tag + ">" });
    });
    for (var i = replacements.length - 1; i >= 0; i -= 1) source = source.slice(0, replacements[i].start) + replacements[i].value + source.slice(replacements[i].end);
    return source;
  }

  function contentTypeFor(body, upstreamType) {
    return /^\s*\{/.test(String(body || "")) ? "application/json; charset=utf-8" : (upstreamType || "text/xml; charset=utf-8");
  }

  return { id: "youtube", name: "YouTube timedtext / JSON3 / srv3", contentType: "text/xml; charset=utf-8", detect: detect, parse: parse, render: render, contentTypeFor: contentTypeFor };
})());

GSS.VTT = (function createVTTTools() {
  function stripTags(text) {
    return String(text || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  }

  function parse(body) {
    var normalized = String(body || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    var lines = normalized.split("\n"), cues = [];
    var timestamps = [];

    for (var i = 0; i < lines.length; i += 1) {
      if (lines[i].indexOf("-->") >= 0) timestamps.push(i);
    }

    for (var t = 0; t < timestamps.length; t += 1) {
      var timestampLine = timestamps[t];
      var startLine = timestampLine + 1;
      var endLine = t + 1 < timestamps.length ? timestamps[t + 1] : lines.length;
      while (endLine > startLine && !lines[endLine - 1].trim()) endLine -= 1;
      var originalLines = lines.slice(startLine, endLine);
      var plain = stripTags(originalLines.join("\n"));
      if (plain) {
        cues.push({
          timestampLine: timestampLine,
          startLine: startLine,
          endLine: endLine,
          originalLines: originalLines,
          text: plain
        });
      }
    }

    return { lines: lines, cues: cues };
  }

  function uniqueTexts(cues) {
    var texts = [], indexes = {};
    cues.forEach(function (cue) {
      if (indexes[cue.text] === undefined) { indexes[cue.text] = texts.length; texts.push(cue.text); }
      cue.translationIndex = indexes[cue.text];
    });
    return texts;
  }

  function render(parsed, translations, mode, order) {
    var lines = parsed.lines.slice();
    var cues = parsed.cues.slice().sort(function (a, b) { return b.startLine - a.startLine; });
    cues.forEach(function (cue) {
      var translated = String(translations[cue.translationIndex] || "").trim();
      if (!translated) return;
      var replacement;
      if (mode === "bilingual") {
        replacement = order === "original-first"
          ? cue.originalLines.concat(translated.split("\n"))
          : translated.split("\n").concat(cue.originalLines);
      } else replacement = translated.split("\n");
      lines.splice.apply(lines, [cue.startLine, Math.max(0, cue.endLine - cue.startLine)].concat(replacement));
    });
    return lines.join("\n");
  }

  return { parse: parse, uniqueTexts: uniqueTexts, render: render, stripTags: stripTags };
})();

GSS.Formats.register("vtt", {
  id: "vtt", name: "WebVTT", contentType: "text/vtt; charset=utf-8",
  detect: function (body, url, contentType) {
    return /^\s*WEBVTT/i.test(String(body || "")) || /text\/vtt/i.test(String(contentType || "")) || /\.(vtt|webvtt)$/i.test(String(url || "").split(/[?#]/)[0]);
  },
  parse: GSS.VTT.parse,
  render: GSS.VTT.render
});

GSS.Formats.register("srt", (function createSrtFormat() {
  function detect(body, url, contentType) {
    return /\.srt$/i.test(String(url || "").split(/[?#]/)[0]) || /application\/x-subrip/i.test(String(contentType || "")) || /(?:^|\n)\d+\s*\n\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->/.test(String(body || ""));
  }
  function parse(body) {
    var blocks = String(body || "").replace(/\r\n/g, "\n").trim().split(/\n{2,}/), cues = [];
    blocks.forEach(function (block, index) {
      var lines = block.split("\n"), timeIndex = -1;
      for (var i = 0; i < lines.length; i += 1) if (lines[i].indexOf("-->") >= 0) { timeIndex = i; break; }
      if (timeIndex < 0 || timeIndex >= lines.length - 1) return;
      var originalLines = lines.slice(timeIndex + 1), text = GSS.Formats.stripTags(originalLines.join("\n"));
      if (text) cues.push({ blockIndex: index, timeIndex: timeIndex, originalLines: originalLines, text: text });
    });
    return { blocks: blocks, cues: cues };
  }
  function render(parsed, translations, mode, order) {
    parsed.cues.forEach(function (cue) {
      var lines = parsed.blocks[cue.blockIndex].split("\n"), translated = String(translations[cue.translationIndex] || "").trim();
      if (!translated) return;
      var replacement = mode === "bilingual" ? (order === "original-first" ? cue.originalLines.concat([translated]) : [translated].concat(cue.originalLines)) : translated.split("\n");
      parsed.blocks[cue.blockIndex] = lines.slice(0, cue.timeIndex + 1).concat(replacement).join("\n");
    });
    return parsed.blocks.join("\n\n") + "\n";
  }
  return { id: "srt", name: "SubRip / SRT", contentType: "application/x-subrip; charset=utf-8", detect: detect, parse: parse, render: render };
})());

GSS.Formats.register("ttml", (function createTtmlFormat() {
  function detect(body, url, contentType) {
    var clean = String(url || "").split(/[?#]/)[0];
    return /\.(ttml2?|dfxp|xml)$/i.test(clean) || /(application|text)\/(ttml\+xml|xml)/i.test(String(contentType || "")) || /<tt(?:\s|>)[\s\S]*<body(?:\s|>)/i.test(String(body || ""));
  }
  function decode(text) {
    return GSS.Formats.stripTags(String(text || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
  }
  function parse(body) {
    var source = String(body || ""), cues = [], regex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi, match;
    while ((match = regex.exec(source))) {
      var text = decode(match[2]);
      if (!text) continue;
      cues.push({ start: match.index, end: regex.lastIndex, attrs: match[1], inner: match[2], text: text });
    }
    return { source: source, cues: cues };
  }
  function render(parsed, translations, mode, order) {
    var source = parsed.source, replacements = [];
    parsed.cues.forEach(function (cue) {
      var translated = GSS.Formats.escapeXml(String(translations[cue.translationIndex] || "").trim()).replace(/\n/g, "<br/>");
      if (!translated) return;
      var original = cue.inner;
      var inner = mode === "bilingual" ? (order === "original-first" ? original + "<br/>" + translated : translated + "<br/>" + original) : translated;
      replacements.push({ start: cue.start, end: cue.end, value: "<p" + cue.attrs + ">" + inner + "</p>" });
    });
    for (var i = replacements.length - 1; i >= 0; i -= 1) source = source.slice(0, replacements[i].start) + replacements[i].value + source.slice(replacements[i].end);
    return source;
  }
  return { id: "ttml", name: "TTML / DFXP / IMSC Text", contentType: "application/ttml+xml; charset=utf-8", detect: detect, parse: parse, render: render };
})());

GSS.Formats.register("ass", (function createAssFormat() {
  function detect(body, url) { return /\.(ass|ssa)$/i.test(String(url || "").split(/[?#]/)[0]) || /\[Script Info\][\s\S]*\[Events\]/i.test(String(body || "")); }
  function strip(text) { return String(text || "").replace(/\{[^}]*\}/g, "").replace(/\\N/g, "\n").trim(); }
  function parse(body) {
    var lines = String(body || "").replace(/\r\n/g, "\n").split("\n"), cues = [], inEvents = false, textIndex = 9;
    lines.forEach(function (line, index) {
      if (/^\[Events\]/i.test(line)) { inEvents = true; return; }
      if (/^\[/.test(line) && !/^\[Events\]/i.test(line)) inEvents = false;
      if (!inEvents) return;
      if (/^Format\s*:/i.test(line)) {
        var fields = line.slice(line.indexOf(":") + 1).split(",").map(function (item) { return item.trim().toLowerCase(); });
        var found = fields.indexOf("text"); if (found >= 0) textIndex = found;
        return;
      }
      if (!/^Dialogue\s*:/i.test(line)) return;
      var prefix = line.slice(0, line.indexOf(":") + 1), raw = line.slice(line.indexOf(":") + 1), parts = raw.split(",");
      if (parts.length <= textIndex) return;
      var before = parts.slice(0, textIndex), original = parts.slice(textIndex).join(","), text = strip(original);
      if (text) cues.push({ lineIndex: index, prefix: prefix, before: before, original: original, text: text });
    });
    return { lines: lines, cues: cues };
  }
  function render(parsed, translations, mode, order) {
    parsed.cues.forEach(function (cue) {
      var translated = String(translations[cue.translationIndex] || "").replace(/\r?\n/g, "\\N").trim();
      if (!translated) return;
      var text = mode === "bilingual" ? (order === "original-first" ? cue.original + "\\N" + translated : translated + "\\N" + cue.original) : translated;
      parsed.lines[cue.lineIndex] = cue.prefix + cue.before.join(",") + "," + text;
    });
    return parsed.lines.join("\n");
  }
  return { id: "ass", name: "ASS / SSA", contentType: "text/plain; charset=utf-8", detect: detect, parse: parse, render: render };
})());

GSS.Formats.register("json", (function createJsonFormat() {
  function detect(body, url, contentType) {
    if (!(/\.json$/i.test(String(url || "").split(/[?#]/)[0]) || /application\/json/i.test(String(contentType || "")))) return false;
    try { var data = JSON.parse(String(body || "")); return Array.isArray(data) || Array.isArray(data.cues) || Array.isArray(data.subtitles) || Array.isArray(data.events); } catch (_) { return false; }
  }
  function locate(data) {
    if (Array.isArray(data)) return data;
    return data.cues || data.subtitles || data.events || [];
  }
  function field(row) {
    if (typeof row === "string") return "__string";
    var names = ["text", "content", "caption", "subtitle", "body", "value"];
    for (var i = 0; i < names.length; i += 1) if (typeof row[names[i]] === "string") return names[i];
    return null;
  }
  function parse(body) {
    var data = JSON.parse(String(body || "")), rows = locate(data), cues = [];
    rows.forEach(function (row, index) {
      var key = field(row), value = key === "__string" ? row : key ? row[key] : "";
      var text = GSS.Formats.stripTags(value);
      if (text) cues.push({ index: index, key: key, original: value, text: text });
    });
    return { data: data, rows: rows, cues: cues };
  }
  function render(parsed, translations, mode, order) {
    parsed.cues.forEach(function (cue) {
      var translated = String(translations[cue.translationIndex] || "").trim();
      if (!translated) return;
      var value = mode === "bilingual" ? (order === "original-first" ? cue.original + "\n" + translated : translated + "\n" + cue.original) : translated;
      if (cue.key === "__string") parsed.rows[cue.index] = value; else parsed.rows[cue.index][cue.key] = value;
    });
    return JSON.stringify(parsed.data);
  }
  return { id: "json", name: "Generic JSON Cues", contentType: "application/json; charset=utf-8", detect: detect, parse: parse, render: render };
})());

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

GSS.Providers.register("google-free", { name: "Google 免费兼容接口", kind: "free", requiresKey: false, experimental: true }, function (config, logger) {
  var endpoints = [
    "https://translate.googleapis.com/translate_a/single",
    "https://translate.google.com/translate_a/single"
  ];

  function parseResponse(body) {
    var data = JSON.parse(body);
    var output = "";
    if (!data || !Array.isArray(data[0])) throw new Error("Unexpected Google response");
    data[0].forEach(function (part) { if (part && typeof part[0] === "string") output += part[0]; });
    return output;
  }

  function requestText(text, source, target, callback, endpointIndex) {
    endpointIndex = endpointIndex || 0;
    if (endpointIndex >= endpoints.length) { callback(new Error("All Google Translate compatibility endpoints failed")); return; }
    var url = endpoints[endpointIndex]
      + "?client=gtx&dt=t"
      + "&sl=" + encodeURIComponent(source || "auto")
      + "&tl=" + encodeURIComponent(target)
      + "&q=" + encodeURIComponent(text);
    GSS.Runtime.httpGet(url, function (error, body) {
      if (error) {
        logger.warn("translation endpoint failed", { endpoint: endpoints[endpointIndex], error: String(error) });
        requestText(text, source, target, callback, endpointIndex + 1);
        return;
      }
      try { callback(null, parseResponse(body)); }
      catch (parseError) {
        logger.warn("translation response parse failed", { endpoint: endpoints[endpointIndex], error: String(parseError) });
        requestText(text, source, target, callback, endpointIndex + 1);
      }
    });
  }

  function translateSingles(texts, source, target, callback) {
    var result = new Array(texts.length);
    var index = 0;
    function next() {
      if (index >= texts.length) { callback(null, result); return; }
      var current = index;
      requestText(texts[current], source, target, function (error, translated) {
        if (error) { callback(error); return; }
        result[current] = translated;
        index += 1;
        next();
      });
    }
    next();
  }

  function parseMarkedTranslation(translated, count) {
    var output = new Array(count);
    var regex = /\[\[GSS_(\d{4})\]\]\s*([\s\S]*?)(?=\[\[GSS_\d{4}\]\]|$)/g;
    var match;
    while ((match = regex.exec(translated))) {
      var index = Number(match[1]);
      if (index >= 0 && index < count) output[index] = match[2].trim();
    }
    for (var i = 0; i < count; i += 1) if (typeof output[i] !== "string") return null;
    return output;
  }

  function translateBatch(batch, source, target, callback) {
    if (batch.length === 1) {
      requestText(batch[0], source, target, function (error, text) { callback(error, error ? null : [text]); });
      return;
    }
    var marked = batch.map(function (text, index) {
      var padded = ("0000" + String(index)).slice(-4);
      return "[[GSS_" + padded + "]]\n" + text;
    }).join("\n");
    requestText(marked, source, target, function (error, translated) {
      if (error) { callback(error); return; }
      var parsed = parseMarkedTranslation(translated, batch.length);
      if (parsed) { callback(null, parsed); return; }
      logger.warn("batch markers changed; falling back to individual requests", { items: batch.length });
      translateSingles(batch, source, target, callback);
    });
  }

  function makeBatches(texts) {
    var batches = [], current = [], currentChars = 0;
    texts.forEach(function (text) {
      var size = String(text).length + 24;
      if (current.length && (current.length >= config.batchItems || currentChars + size > config.batchChars)) {
        batches.push(current); current = []; currentChars = 0;
      }
      current.push(text); currentChars += size;
    });
    if (current.length) batches.push(current);
    return batches;
  }

  function translateMany(texts, source, target, callback) {
    if (!texts.length) { callback(null, []); return; }
    var batches = makeBatches(texts), output = [], index = 0;
    logger.info("translation started", { cues: texts.length, batches: batches.length, source: source, target: target });
    function next() {
      if (index >= batches.length) { callback(null, output); return; }
      translateBatch(batches[index], source, target, function (error, translated) {
        if (error) { callback(error); return; }
        output = output.concat(translated); index += 1; next();
      });
    }
    next();
  }

  return { ready: function () { return true; }, translateMany: translateMany };
});

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

GSS.Providers.register("openai-compatible", { name: "OpenAI 兼容接口（DeepSeek 等）", kind: "llm", requiresKey: true }, function (config, logger, secrets) {
  function translateMany(texts, source, target, callback) {
    if (!config.providerModel) { callback(new Error("Compatible API model is empty")); return; }
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

GSS.M3U8 = (function createM3U8Tools() {
  function parseAttributes(line) {
    var colon = line.indexOf(":"), source = colon >= 0 ? line.slice(colon + 1) : line;
    var items = [], buffer = "", quoted = false;
    for (var i = 0; i < source.length; i += 1) {
      var char = source[i];
      if (char === '"') quoted = !quoted;
      if (char === "," && !quoted) { items.push(buffer); buffer = ""; } else buffer += char;
    }
    if (buffer) items.push(buffer);
    var attributes = [];
    items.forEach(function (item) {
      var equals = item.indexOf("=");
      if (equals < 0) return;
      var key = item.slice(0, equals).trim(), raw = item.slice(equals + 1).trim();
      var isQuoted = raw.length >= 2 && raw[0] === '"' && raw[raw.length - 1] === '"';
      attributes.push({ key: key, value: isQuoted ? raw.slice(1, -1) : raw, quoted: isQuoted });
    });
    return attributes;
  }

  function get(attributes, key) {
    key = key.toUpperCase();
    for (var i = 0; i < attributes.length; i += 1) if (attributes[i].key.toUpperCase() === key) return attributes[i].value;
    return null;
  }

  function set(attributes, key, value, quoted) {
    var upper = key.toUpperCase();
    for (var i = 0; i < attributes.length; i += 1) {
      if (attributes[i].key.toUpperCase() === upper) { attributes[i].value = value; attributes[i].quoted = quoted; return; }
    }
    attributes.push({ key: key, value: value, quoted: quoted });
  }

  function serialize(tag, attributes) {
    return tag + ":" + attributes.map(function (attribute) {
      var value = attribute.quoted ? '"' + String(attribute.value).replace(/"/g, "") + '"' : attribute.value;
      return attribute.key + "=" + value;
    }).join(",");
  }

  function candidateScore(attributes, config) {
    var name = String(get(attributes, "NAME") || "");
    var language = String(get(attributes, "LANGUAGE") || "");
    var score = 0;
    if (String(get(attributes, "DEFAULT") || "").toUpperCase() === "YES") score += 100;
    if (String(get(attributes, "AUTOSELECT") || "").toUpperCase() === "YES") score += 10;
    score += GSS.Language.priority(language, name, config.sourcePriority);
    if (/\b(sdh|cc|closed captions?|descriptive|audio description)\b/i.test(name)) score -= 8;
    return score;
  }

  function chooseSourceTrack(lines, config) {
    var candidates = [];
    lines.forEach(function (line, index) {
      if (line.indexOf("#EXT-X-MEDIA:") !== 0) return;
      var attributes = parseAttributes(line);
      if (String(get(attributes, "TYPE") || "").toUpperCase() !== "SUBTITLES") return;
      if (String(get(attributes, "FORCED") || "").toUpperCase() === "YES") return;
      if (!get(attributes, "URI")) return;
      var language = String(get(attributes, "LANGUAGE") || "");
      var name = String(get(attributes, "NAME") || "");
      if (!GSS.Language.matches(language, name, config.source)) return;
      candidates.push({
        index: index,
        line: line,
        attributes: attributes,
        language: language,
        name: name,
        score: candidateScore(attributes, config)
      });
    });
    if (!candidates.length) return null;
    candidates.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });
    return candidates[0];
  }

  function duplicateTrack(candidate, requestUrl, mode, config, platform) {
    var tag = candidate.line.slice(0, candidate.line.indexOf(":"));
    var attributes = parseAttributes(candidate.line);
    var originalUri = get(attributes, "URI");
    if (!originalUri) return null;
    var absoluteOrigin = GSS.Url.resolve(requestUrl, originalUri);
    var name = mode === "bilingual" ? config.trackName : config.translatedTrackName;
    var source = GSS.Language.googleSource(candidate.language, config.source);
    set(attributes, "NAME", name, true);
    set(attributes, "LANGUAGE", config.target, true);
    set(attributes, "DEFAULT", "NO", false);
    set(attributes, "AUTOSELECT", "YES", false);
    set(attributes, "FORCED", "NO", false);
    set(attributes, "URI", GSS.Url.virtual(config.virtualOrigin, "/playlist", {
      origin: absoluteOrigin,
      mode: mode,
      source: source,
      target: config.target,
      platform: platform ? platform.id : "unknown",
      version: GSS.VERSION
    }), true);
    return serialize(tag, attributes);
  }

  function injectTracks(body, requestUrl, config, logger, platform) {
    if (!config.enabled || !body || body.indexOf("#EXTM3U") < 0) return body;
    if (body.indexOf("gss.local/playlist") >= 0) return body;
    var lines = body.replace(/\r\n/g, "\n").split("\n");
    var selected = chooseSourceTrack(lines, config);
    if (!selected) {
      logger.info("master manifest inspected", {
        platform: platform ? platform.id : "unknown",
        injected: 0,
        source: config.source,
        reason: "no matching subtitle track"
      });
      return body;
    }

    var output = [], injected = 0;
    lines.forEach(function (line, index) {
      output.push(line);
      if (index !== selected.index) return;
      var bilingual = duplicateTrack(selected, requestUrl, "bilingual", config, platform);
      if (bilingual) { output.push(bilingual); injected += 1; }
      if (config.injectTranslated) {
        var translated = duplicateTrack(selected, requestUrl, "translate", config, platform);
        if (translated) { output.push(translated); injected += 1; }
      }
    });
    logger.info("master manifest inspected", {
      platform: platform ? platform.id : "unknown",
      injected: injected,
      trackName: config.trackName,
      selectedName: selected.name,
      selectedLanguage: selected.language || "auto",
      configuredSource: config.source
    });
    return injected ? output.join("\n") : body;
  }

  function decorateSubtitlePlaylist(body, originUrl, mode, source, target, config, logger, platform) {
    if (!body || body.indexOf("#EXTM3U") < 0) return body;
    var changed = 0;
    var output = body.replace(/\r\n/g, "\n").split("\n").map(function (line) {
      var trimmed = line.trim();
      if (!trimmed || trimmed[0] === "#") return line;
      changed += 1;
      return GSS.Url.virtual(config.virtualOrigin, "/subtitle", {
        origin: GSS.Url.resolve(originUrl, trimmed),
        mode: mode,
        source: source,
        target: target,
        platform: platform || "unknown",
        version: GSS.VERSION
      });
    });
    logger.info("subtitle playlist virtualized", { segments: changed, mode: mode, platform: platform || "unknown" });
    return changed ? output.join("\n") : body;
  }

  return {
    parseAttributes: parseAttributes,
    chooseSourceTrack: chooseSourceTrack,
    injectTracks: injectTracks,
    decorateSubtitlePlaylist: decorateSubtitlePlaylist
  };
})();

GSS.Subtitle = {
  translateBody: function translateBody(body, url, contentType, mode, source, target, config, logger, callback) {
    var format = GSS.Formats.detect(body, url, contentType, config);
    if (!format) { callback(new Error("Unsupported subtitle format")); return; }
    var cache = GSS.Cache(config, logger);
    var seed = body + "|" + format.id + "|" + mode + "|" + source + "|" + target + "|" + config.bilingualOrder + "|" + config.provider + "|" + config.fallbackProviders;
    var cached = cache.get(seed);
    if (cached !== null) { callback(null, cached, true, format); return; }
    var parsed;
    try { parsed = format.parse(body); } catch (error) { callback(error); return; }
    var texts = GSS.Formats.uniqueTexts(parsed.cues || []);
    if (!texts.length) { callback(null, body, false, format); return; }
    GSS.Providers.translateMany(texts, source, target, config, logger, function (error, translations, providerId) {
      if (error) { callback(error); return; }
      try {
        var output = format.render(parsed, translations, mode, config.bilingualOrder);
        cache.set(seed, output);
        logger.info("subtitle translated", { format: format.id, provider: providerId, mode: mode, uniqueCues: texts.length, source: source, target: target });
        callback(null, output, true, format);
      } catch (renderError) { callback(renderError); }
    });
  }
};

GSS.Admin = (function createAdmin() {
  function escapeHtml(value) { return String(value === undefined ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function checked(value) { return value ? " checked" : ""; }
  function selected(value, expected) { return value === expected ? " selected" : ""; }
  function json(status, value) { GSS.Runtime.doneResponse(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, JSON.stringify(value, null, 2)); }
  function enabledIn(raw, id) {
    raw = String(raw || "all").toLowerCase();
    return raw === "all" || raw.split(/[,|]/).map(function (item) { return item.trim(); }).indexOf(id) >= 0;
  }
  function providerOptions(config) {
    return GSS.Providers.list().map(function (provider) {
      var suffix = provider.requiresKey ? (provider.configured ? " · 已配置密钥" : " · 需要密钥") : "";
      if (provider.experimental) suffix += " · 实验性";
      return '<option value="' + escapeHtml(provider.id) + '"' + selected(config.provider, provider.id) + '>' + escapeHtml(provider.name + suffix) + '</option>';
    }).join("");
  }
  function platformControls(config) {
    return GSS.Platforms.list().map(function (platform) {
      return '<label class="check"><input type="checkbox" name="platform_' + escapeHtml(platform.id) + '" value="true"' + checked(enabledIn(config.platforms, platform.id)) + '>'
        + escapeHtml(platform.name) + (platform.maturity !== "stable" ? ' <span class="tag">' + escapeHtml(platform.maturity) + '</span>' : '') + '</label>';
    }).join("");
  }
  function formatControls(config) {
    return GSS.Formats.list().map(function (format) {
      return '<label class="check"><input type="checkbox" name="format_' + escapeHtml(format.id) + '" value="true"' + checked(enabledIn(config.formats, format.id)) + '>' + escapeHtml(format.name) + '</label>';
    }).join("");
  }
  function publicConfig(config) {
    var copy = {};
    Object.keys(config || {}).forEach(function (key) { copy[key] = config[key]; });
    copy.providerConfigured = GSS.providerHasKey(config.provider);
    return copy;
  }
  function params(url) {
    var output = GSS.Url.queryObject(url), body = GSS.Runtime.request.body || "";
    if (String(GSS.Runtime.request.method || "GET").toUpperCase() === "POST" && body) {
      var bodyParams = GSS.parseArguments(body);
      Object.keys(bodyParams).forEach(function (key) { output[key] = bodyParams[key]; });
    }
    return output;
  }
  function page(config, token, message) {
    var keyState = GSS.providerHasKey(config.provider) ? "当前引擎已保存 API Key；留空表示保持不变。" : "当前引擎尚未保存 API Key。";
    var html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>General Stream Subtitle</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:920px;margin:30px auto;padding:0 16px;background:#f5f5f7;color:#1d1d1f}main{background:#fff;border-radius:18px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.08)}h2{margin-top:28px}label{display:block;margin:12px 0 5px;font-weight:600}input,select,textarea{box-sizing:border-box;width:100%;padding:10px;border:1px solid #d2d2d7;border-radius:10px;font-size:15px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 15px;padding:12px;border:1px solid #e5e5ea;border-radius:12px}.check{display:flex;gap:8px;align-items:center;font-weight:500;margin:5px 0}.check input{width:auto}.tag{font-size:11px;background:#eee;padding:2px 5px;border-radius:5px;color:#666}.actions{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}button,a.button{border:0;border-radius:10px;padding:11px 16px;background:#0071e3;color:#fff;text-decoration:none;font-size:15px}.muted{color:#6e6e73;font-size:13px}.ok{background:#e8f8ed;padding:10px;border-radius:10px}@media(max-width:680px){.grid,.checks{grid-template-columns:1fr}}</style></head><body><main>'
      + '<h1>General Stream Subtitle</h1><p class="muted">v' + escapeHtml(GSS.VERSION) + ' · ' + escapeHtml(GSS.Runtime.name) + ' · HLS / DASH · 多字幕格式 · 多翻译引擎</p>'
      + (message ? '<p class="ok">' + escapeHtml(message) + '</p>' : '')
      + '<form action="/save" method="post"><input type="hidden" name="token" value="' + escapeHtml(token) + '">'
      + '<h2>字幕</h2><div class="grid"><div><label>源语言</label><input name="source" value="' + escapeHtml(config.source) + '" placeholder="auto / en / ja / ko"></div><div><label>目标语言</label><input name="target" value="' + escapeHtml(config.target) + '"></div></div>'
      + '<label>自动源语言优先级</label><input name="sourcePriority" value="' + escapeHtml(config.sourcePriority) + '">'
      + '<label>字幕菜单名称</label><input name="trackName" value="' + escapeHtml(config.trackName) + '">'
      + '<label>双语排列</label><select name="bilingualOrder"><option value="translation-first"' + selected(config.bilingualOrder, "translation-first") + '>译文在上</option><option value="original-first"' + selected(config.bilingualOrder, "original-first") + '>原文在上</option></select>'
      + '<h2>翻译引擎</h2><label>Provider</label><select name="provider">' + providerOptions(config) + '</select>'
      + '<label>备用 Provider</label><input name="fallbackProviders" value="' + escapeHtml(config.fallbackProviders) + '" placeholder="google-free,libretranslate"><p class="muted">主引擎失败后按顺序尝试，逗号分隔。</p>'
      + '<label>API Key</label><input type="password" name="providerApiKey" value="" autocomplete="new-password" placeholder="留空保持不变"><p class="muted">' + escapeHtml(keyState) + ' 密钥仅保存在当前代理软件的 persistentStore，不写入模块或健康接口。</p>'
      + '<label class="check"><input type="checkbox" name="clearProviderKey" value="true">清除所选 Provider 的已保存密钥</label>'
      + '<div class="grid"><div><label>自定义 Endpoint</label><input name="providerEndpoint" value="' + escapeHtml(config.providerEndpoint) + '" placeholder="可留空使用默认端点"></div><div><label>模型</label><input name="providerModel" value="' + escapeHtml(config.providerModel) + '" placeholder="gpt-5-mini / deepseek-chat / gemini-2.5-flash"></div></div>'
      + '<div class="grid"><div><label>Azure Region</label><input name="providerRegion" value="' + escapeHtml(config.providerRegion) + '"></div><div><label>Google Project / Location</label><input name="providerProject" value="' + escapeHtml(config.providerProject) + '" placeholder="预留"><input name="providerLocation" value="' + escapeHtml(config.providerLocation) + '" placeholder="global"></div></div>'
      + '<label>LLM 翻译指令</label><textarea name="providerPrompt" rows="4">' + escapeHtml(config.providerPrompt) + '</textarea>'
      + '<h2>YouTube / YouTube TV</h2><label>字幕接管策略</label><select name="youtubeStrategy"><option value="direct"' + selected(config.youtubeStrategy, "direct") + '>直接拦截 timedtext（推荐）</option><option value="virtual"' + selected(config.youtubeStrategy, "virtual") + '>gss.local 虚拟字幕网关</option></select>'
      + '<label class="check"><input type="checkbox" name="youtubeUseAsr" value="true"' + checked(config.youtubeUseAsr) + '>使用 YouTube 自动生成字幕（ASR）</label>'
      + '<label class="check"><input type="checkbox" name="youtubeLive" value="true"' + checked(config.youtubeLive) + '>处理 YouTube / YouTube TV 直播文本字幕</label>'
      + '<label class="check"><input type="checkbox" name="youtubePreferManual" value="true"' + checked(config.youtubePreferManual) + '>官方人工字幕优先于 ASR</label><p class="muted">没有 captionTracks 的视频无法在纯模块内生成字幕；嵌入视频流但未转成 timedtext 的 CEA-608/708 也会安全放行。</p>'
      + '<h2>格式</h2><div class="checks">' + formatControls(config) + '</div><p class="muted">IMSC/TTML 的文本 XML 可处理；fMP4 内的二进制 IMSC1 目前只识别并安全放行。</p>'
      + '<h2>平台</h2><div class="checks">' + platformControls(config) + '</div>'
      + '<label class="check"><input type="checkbox" name="genericMode" value="true"' + checked(config.genericMode) + '>启用通用 HLS/DASH 模式</label>'
      + '<label>自定义域名</label><input name="customDomains" value="' + escapeHtml(config.customDomains) + '" placeholder="media.example.com,local.plex"><p class="muted">自定义域名仍需手动加入客户端 MITM hostname。</p>'
      + '<h2>运行</h2><label class="check"><input type="checkbox" name="enabled" value="true"' + checked(config.enabled) + '>启用字幕注入</label>'
      + '<label class="check"><input type="checkbox" name="injectTranslated" value="true"' + checked(config.injectTranslated) + '>额外显示纯翻译轨</label>'
      + '<label class="check"><input type="checkbox" name="cacheEnabled" value="true"' + checked(config.cacheEnabled) + '>启用翻译缓存</label>'
      + '<label class="check"><input type="checkbox" name="debug" value="true"' + checked(config.debug) + '>启用调试日志</label>'
      + '<div class="actions"><button type="submit">保存设置</button><a class="button" href="/reset?token=' + escapeHtml(token) + '">恢复默认</a><a class="button" href="/health">运行状态</a></div></form>'
      + '<p class="muted">保存后请完全退出并重新打开流媒体 App。此页面由代理脚本合成，不是常驻 Web 服务。</p></main></body></html>';
    GSS.Runtime.doneResponse(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, html);
  }
  function handle(url, config, logger) {
    var path = GSS.Url.path(url), query = params(url), token = GSS.getAdminToken();
    if (path === "/health") { json(200, { ok: true, version: GSS.VERSION, runtime: GSS.Runtime.name, providers: GSS.Providers.list(), formats: GSS.Formats.list(), platforms: GSS.Platforms.list(), config: publicConfig(config) }); return true; }
    if (path === "/api/config") { json(200, { version: GSS.VERSION, providers: GSS.Providers.list(), formats: GSS.Formats.list(), platforms: GSS.Platforms.list(), config: publicConfig(config) }); return true; }
    if (path === "/save") {
      if (query.token !== token) { json(403, { ok: false, error: "invalid admin token" }); return true; }
      var platformIds = [], formatIds = [];
      GSS.Platforms.list().forEach(function (item) { if (query["platform_" + item.id] === "true") platformIds.push(item.id); });
      GSS.Formats.list().forEach(function (item) { if (query["format_" + item.id] === "true") formatIds.push(item.id); });
      var values = {
        source: query.source, sourcePriority: query.sourcePriority, target: query.target, trackName: query.trackName,
        provider: query.provider, fallbackProviders: query.fallbackProviders, providerEndpoint: query.providerEndpoint,
        providerModel: query.providerModel, providerRegion: query.providerRegion, providerProject: query.providerProject,
        providerLocation: query.providerLocation, providerPrompt: query.providerPrompt, bilingualOrder: query.bilingualOrder,
        platforms: platformIds.length === GSS.Platforms.list().length ? "all" : (platformIds.join(",") || "none"),
        formats: formatIds.length === GSS.Formats.list().length ? "all" : (formatIds.join(",") || "none"),
        genericMode: query.genericMode === "true", customDomains: query.customDomains,
        youtubeStrategy: query.youtubeStrategy, youtubeUseAsr: query.youtubeUseAsr === "true",
        youtubeLive: query.youtubeLive === "true", youtubePreferManual: query.youtubePreferManual === "true",
        enabled: query.enabled === "true", injectTranslated: query.injectTranslated === "true",
        cacheEnabled: query.cacheEnabled === "true", debug: query.debug === "true"
      };
      GSS.saveSettings(values);
      if (query.clearProviderKey === "true") GSS.saveProviderSecret(query.provider, "apiKey", "");
      else if (query.providerApiKey) GSS.saveProviderSecret(query.provider, "apiKey", query.providerApiKey);
      logger.info("settings saved", { provider: values.provider, platforms: values.platforms, formats: values.formats });
      page(GSS.getConfig(), token, "设置已保存。重新打开流媒体 App 后生效。");
      return true;
    }
    if (path === "/reset") {
      if (query.token !== token) { json(403, { ok: false, error: "invalid admin token" }); return true; }
      GSS.resetSettings(); page(GSS.getConfig(), token, "已恢复模块默认设置（API Key 未删除）。"); return true;
    }
    if (path === "/" || path === "/admin" || path === "/gss" || path === "/gss/") { page(config, token, ""); return true; }
    return false;
  }
  return { handle: handle };
})();

(function gatewayEntry() {
  var config = GSS.getConfig();
  var logger = GSS.Logger(config, "gateway");
  var requestUrl = GSS.Runtime.request.url || "";
  var path = GSS.Url.path(requestUrl);
  var host = GSS.Url.host(requestUrl);

  function upstreamHeaders(response) { return (response && response.headers) || {}; }
  function headerValue(headers, name) {
    var value = "";
    Object.keys(headers || {}).forEach(function (key) { if (key.toLowerCase() === name.toLowerCase()) value = headers[key]; });
    return value;
  }
  function emptyResponse(reason, format, origin) {
    logger.error(reason + "; returning an empty virtual response");
    if (path === "/playlist") { GSS.Runtime.doneResponse(200, { "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8", "Cache-Control": "no-store" }, "#EXTM3U\n#EXT-X-ENDLIST\n"); return; }
    if (path === "/youtube" && /(?:[?&]fmt=json3|\.json(?:$|[?#]))/i.test(String(origin || ""))) { GSS.Runtime.doneResponse(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, '{"events":[]}'); return; }
    if (format && format.id === "ttml") { GSS.Runtime.doneResponse(200, { "Content-Type": format.contentType, "Cache-Control": "no-store" }, "<?xml version=\"1.0\"?><tt xmlns=\"http://www.w3.org/ns/ttml\"><body><div/></body></tt>"); return; }
    GSS.Runtime.doneResponse(200, { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "no-store" }, "WEBVTT\n\n");
  }
  function setHeader(headers, name, value) {
    var existing = null;
    Object.keys(headers || {}).forEach(function (key) { if (key.toLowerCase() === name.toLowerCase()) existing = key; });
    if (existing) headers[existing] = value; else headers[name] = value;
  }
  function deleteHeader(headers, name) {
    Object.keys(headers || {}).forEach(function (key) { if (key.toLowerCase() === name.toLowerCase()) delete headers[key]; });
  }
  function upstreamRequestHeaders(platform) {
    var headers = {};
    Object.keys(GSS.Runtime.request.headers || {}).forEach(function (key) { headers[key] = GSS.Runtime.request.headers[key]; });
    deleteHeader(headers, "Host");
    deleteHeader(headers, "Content-Length");
    deleteHeader(headers, "Content-Encoding");
    var originHeader = headerValue(headers, "origin");
    var refererHeader = headerValue(headers, "referer");
    if (/gss\.local|127\.0\.0\.1|localhost/i.test(originHeader)) deleteHeader(headers, "origin");
    if (/gss\.local|127\.0\.0\.1|localhost/i.test(refererHeader)) deleteHeader(headers, "referer");
    if (platform === "pluto") {
      setHeader(headers, "Origin", "https://pluto.tv");
      setHeader(headers, "Referer", "https://pluto.tv/");
      if (!headerValue(headers, "accept")) setHeader(headers, "Accept", "*/*");
    }
    return headers;
  }
  function originalResponse(reason, body, response, upstreamType) {
    logger.warn(reason + "; returning the original subtitle body", { fallback: "original", contentType: upstreamType || "unknown" });
    var status = response && (response.status || response.statusCode) || 200;
    GSS.Runtime.doneResponse(status, GSS.Runtime.cleanHeaders(upstreamHeaders(response), upstreamType || undefined), body);
  }

  function forwardedOrigin(origin, query) {
    var reserved = { origin:1, mode:1, source:1, target:1, platform:1, live:1, version:1, tlang:1 };
    var extra = {};
    Object.keys(query || {}).forEach(function (key) { if (!reserved[key]) extra[key] = query[key]; });
    return GSS.Url.appendParams(origin, extra);
  }

  try {
    var isAdminHost = host === "gss.local" || host === "127.0.0.1" || host === "localhost";
    if (isAdminHost && GSS.Admin.handle(requestUrl, config, logger)) return;
    if (host !== "gss.local") { GSS.Runtime.passThrough(); return; }

    var query = GSS.Url.queryObject(requestUrl);
    var origin = query.origin;
    var mode = query.mode === "translate" ? "translate" : "bilingual";
    var source = query.source || config.source;
    var target = query.target || config.target;
    var platform = query.platform || "unknown";
    if (!origin) { emptyResponse("missing origin URL", null, origin); return; }
    if (path === "/youtube") origin = forwardedOrigin(origin, query);

    GSS.Runtime.httpGet({ url: origin, headers: upstreamRequestHeaders(platform) }, function (error, body, response) {
      if (error) { emptyResponse("upstream fetch failed: " + String(error), null, origin); return; }
      try {
        var upstreamType = headerValue(upstreamHeaders(response), "content-type");
        if (path === "/playlist" && body.indexOf("#EXTM3U") >= 0) {
          var playlist = GSS.M3U8.decorateSubtitlePlaylist(body, origin, mode, source, target, config, logger, platform);
          GSS.Runtime.doneResponse(200, GSS.Runtime.cleanHeaders(upstreamHeaders(response), "application/vnd.apple.mpegurl; charset=utf-8"), playlist);
          return;
        }
        if (path === "/subtitle" || path === "/playlist" || path === "/youtube") {
          var detected = GSS.Formats.detect(body, origin, upstreamType, config);
          if (!detected) { originalResponse("unsupported subtitle format or binary subtitle segment", body, response, upstreamType); return; }
          GSS.Subtitle.translateBody(body, origin, upstreamType, mode, source, target, config, logger, function (translateError, translated, changed, format) {
            if (translateError) { originalResponse("translation failed: " + String(translateError), body, response, upstreamType); return; }
            var contentType = format.contentTypeFor ? format.contentTypeFor(translated, upstreamType) : format.contentType;
            GSS.Runtime.doneResponse(200, GSS.Runtime.cleanHeaders(upstreamHeaders(response), contentType), translated);
          });
          return;
        }
        GSS.Runtime.doneResponse(404, { "Content-Type": "text/plain; charset=utf-8" }, "General Stream Subtitle: route not found");
      } catch (processingError) { emptyResponse("gateway processing failed: " + String(processingError), null, origin); }
    });
  } catch (error) {
    logger.error("gateway failed", { error: String(error), stack: error && error.stack });
    emptyResponse("gateway exception", null, "");
  }
})();
})();
