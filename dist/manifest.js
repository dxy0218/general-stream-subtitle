// General Stream Subtitle 0.5.0 - manifest
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
    var blocks = normalized.split(/\n{2,}/), cues = [];
    blocks.forEach(function (block, blockIndex) {
      var lines = block.split("\n"), timestampIndex = -1;
      for (var i = 0; i < lines.length; i += 1) if (lines[i].indexOf("-->") >= 0) { timestampIndex = i; break; }
      if (timestampIndex < 0 || timestampIndex >= lines.length - 1) return;
      var originalLines = lines.slice(timestampIndex + 1), plain = stripTags(originalLines.join("\n"));
      if (!plain) return;
      cues.push({ blockIndex: blockIndex, timestampIndex: timestampIndex, originalLines: originalLines, text: plain });
    });
    return { blocks: blocks, cues: cues };
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
    parsed.cues.forEach(function (cue) {
      var blockLines = parsed.blocks[cue.blockIndex].split("\n");
      var translated = String(translations[cue.translationIndex] || "").trim();
      if (!translated) return;
      var replacement;
      if (mode === "bilingual") {
        replacement = order === "original-first" ? cue.originalLines.concat([translated]) : [translated].concat(cue.originalLines);
      } else replacement = translated.split("\n");
      parsed.blocks[cue.blockIndex] = blockLines.slice(0, cue.timestampIndex + 1).concat(replacement).join("\n");
    });
    return parsed.blocks.join("\n\n");
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

GSS.MPD = (function createMpdTools() {
  function attr(tag, name) {
    var match = String(tag || "").match(new RegExp("\\b" + name + "\\s*=\\s*([\\\"'])(.*?)\\1", "i"));
    return match ? match[2] : "";
  }

  function setAttr(tag, name, value) {
    var regex = new RegExp("(\\b" + name + "\\s*=\\s*)([\\\"']).*?\\2", "i");
    if (regex.test(tag)) return tag.replace(regex, "$1\"" + String(value).replace(/\"/g, "") + "\"");
    return tag.replace(/>$/, " " + name + "=\"" + String(value).replace(/\"/g, "") + "\">");
  }

  function textLike(startTag, block) {
    var mime = (attr(startTag, "mimeType") || attr(block, "mimeType") || "").toLowerCase();
    var contentType = (attr(startTag, "contentType") || "").toLowerCase();
    var codecs = (attr(startTag, "codecs") || attr(block, "codecs") || "").toLowerCase();
    return contentType === "text" || /text\/(vtt|plain)|application\/(ttml\+xml|xml)/.test(mime) || /(wvtt|stpp|ttml)/.test(codecs);
  }

  function score(startTag, block, config) {
    var language = attr(startTag, "lang") || attr(block, "lang");
    var labelMatch = block.match(/<Label\b[^>]*>([\s\S]*?)<\/Label>/i);
    var label = labelMatch ? GSS.Formats.stripTags(labelMatch[1]) : "";
    if (!GSS.Language.matches(language, label, config.source)) return -10000;
    var value = GSS.Language.priority(language, label, config.sourcePriority);
    if (/forced/i.test(block)) value -= 100;
    if (/caption|sdh|description/i.test(label)) value -= 8;
    if (/selectionPriority\s*=\s*["']1["']/i.test(startTag)) value += 20;
    return value;
  }

  function duplicate(block, requestUrl, config, platform) {
    var startMatch = block.match(/^<AdaptationSet\b[^>]*>/i);
    if (!startMatch) return null;
    var baseMatch = block.match(/<BaseURL\b[^>]*>([\s\S]*?)<\/BaseURL>/i);
    if (!baseMatch) return null;
    if (/<SegmentTemplate\b|<SegmentList\b|<SegmentBase\b/i.test(block)) return null;
    var language = attr(startMatch[0], "lang") || "auto";
    var origin = GSS.Url.resolve(requestUrl, GSS.Formats.stripTags(baseMatch[1]));
    var virtual = GSS.Url.virtual(config.virtualOrigin, "/subtitle", {
      origin: origin,
      mode: "bilingual",
      source: GSS.Language.googleSource(language, config.source),
      target: config.target,
      platform: platform ? platform.id : "unknown",
      version: GSS.VERSION
    });
    var startTag = setAttr(startMatch[0], "id", "gss-" + GSS.Hash(origin).slice(0, 8));
    startTag = setAttr(startTag, "lang", config.target);
    var output = block.replace(startMatch[0], startTag).replace(baseMatch[0], "<BaseURL>" + GSS.Formats.escapeXml(virtual) + "</BaseURL>");
    if (/<Label\b/i.test(output)) output = output.replace(/<Label\b[^>]*>[\s\S]*?<\/Label>/i, "<Label>" + GSS.Formats.escapeXml(config.trackName) + "</Label>");
    else output = output.replace(startTag, startTag + "<Label>" + GSS.Formats.escapeXml(config.trackName) + "</Label>");
    return output;
  }

  function injectTrack(body, requestUrl, config, logger, platform) {
    if (!config.enabled || !/<MPD\b/i.test(String(body || "")) || String(body).indexOf("gss.local/subtitle") >= 0) return body;
    var regex = /<AdaptationSet\b[^>]*>[\s\S]*?<\/AdaptationSet>/gi, match, best = null;
    while ((match = regex.exec(body))) {
      var startTag = (match[0].match(/^<AdaptationSet\b[^>]*>/i) || [""])[0];
      if (!textLike(startTag, match[0])) continue;
      var currentScore = score(startTag, match[0], config);
      if (currentScore < -1000) continue;
      if (!best || currentScore > best.score) best = { block: match[0], end: regex.lastIndex, score: currentScore };
    }
    if (!best) {
      logger.info("DASH manifest inspected", { platform: platform ? platform.id : "unknown", injected: 0, reason: "no matching text adaptation" });
      return body;
    }
    var clone = duplicate(best.block, requestUrl, config, platform);
    if (!clone) {
      logger.info("DASH manifest inspected", { platform: platform ? platform.id : "unknown", injected: 0, reason: "segmented or unsupported text adaptation" });
      return body;
    }
    logger.info("DASH manifest inspected", { platform: platform ? platform.id : "unknown", injected: 1, trackName: config.trackName });
    return body.slice(0, best.end) + clone + body.slice(best.end);
  }

  return { injectTrack: injectTrack };
})();

(function manifestEntry() {
  var config = GSS.getConfig();
  var logger = GSS.Logger(config, "manifest");
  try {
    var body = GSS.Runtime.response.body || "";
    if (!config.enabled) { GSS.Runtime.passThrough(); return; }
    var platform = GSS.Platforms.detect(GSS.Runtime.request.url || "", config);
    if (!platform || !GSS.Platforms.enabled(platform, config)) { GSS.Runtime.passThrough(); return; }
    var output = body;
    var contentType = "";
    if (body.indexOf("#EXTM3U") >= 0) {
      output = GSS.M3U8.injectTracks(body, GSS.Runtime.request.url || "", config, logger, platform);
      contentType = "application/vnd.apple.mpegurl; charset=utf-8";
    } else if (/<MPD\b/i.test(body)) {
      output = GSS.MPD.injectTrack(body, GSS.Runtime.request.url || "", config, logger, platform);
      contentType = "application/dash+xml; charset=utf-8";
    } else {
      GSS.Runtime.passThrough(); return;
    }
    if (output === body) GSS.Runtime.passThrough();
    else GSS.Runtime.doneBody(output, GSS.Runtime.response.headers, contentType);
  } catch (error) {
    logger.error("manifest processing failed; original response preserved", { error: String(error), stack: error && error.stack });
    GSS.Runtime.passThrough();
  }
})();
})();
