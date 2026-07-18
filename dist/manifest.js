// General Stream Subtitle 0.2.0 - manifest
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

  function done(payload) {
    if (typeof $done === "function") $done(payload || {});
  }

  function doneBody(body, headers, contentType) {
    done({ body: body, headers: cleanHeaders(headers || {}, contentType) });
  }

  function doneResponse(status, headers, body) {
    done({ response: { status: status || 200, headers: cleanHeaders(headers || {}), body: body || "" } });
  }

  function passThrough() { done({}); }

  function httpGet(input, callback) {
    if (typeof $httpClient === "undefined" || !$httpClient.get) {
      callback(new Error("$httpClient.get is unavailable"));
      return;
    }
    var options = typeof input === "string" ? { url: input } : (input || {});
    options.headers = cleanRequestHeaders(options.headers || {});
    if (!options.headers["User-Agent"] && !options.headers["user-agent"]) {
      options.headers["User-Agent"] = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
    }
    $httpClient.get(options, function (error, response, body) {
      if (error) { callback(error); return; }
      var status = response && (response.status || response.statusCode);
      if (status && Number(status) >= 400) { callback(new Error("HTTP " + status), body || "", response || {}); return; }
      callback(null, body || "", response || {});
    });
  }

  function read(key) {
    try {
      if (typeof $persistentStore !== "undefined" && $persistentStore.read) return $persistentStore.read(key);
    } catch (_) {}
    return null;
  }

  function write(value, key) {
    try {
      if (typeof $persistentStore !== "undefined" && $persistentStore.write) return $persistentStore.write(value, key);
    } catch (_) {}
    return false;
  }

  return {
    name: detectName(),
    request: typeof $request !== "undefined" ? $request : { url: "", method: "GET", headers: {} },
    response: typeof $response !== "undefined" ? $response : { body: "", headers: {} },
    done: done,
    doneBody: doneBody,
    doneResponse: doneResponse,
    passThrough: passThrough,
    httpGet: httpGet,
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

GSS.VERSION = "0.2.0";
GSS.SETTINGS_KEY = "GSS_SETTINGS_V1";
GSS.ADMIN_TOKEN_KEY = "GSS_ADMIN_TOKEN_V1";

GSS.DEFAULTS = {
  enabled: true,
  provider: "google",
  source: "en",
  target: "zh-CN",
  trackName: "Translate-zh",
  injectTranslated: false,
  translatedTrackName: "Translate-zh-only",
  bilingualOrder: "translation-first",
  debug: true,
  cacheEnabled: true,
  cacheTTL: 6 * 60 * 60 * 1000,
  cacheLimit: 100,
  batchChars: 1000,
  batchItems: 6,
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
    try {
      key = decodeURIComponent(key.trim());
      value = decodeURIComponent(value.trim());
    } catch (_) {}
    if (key) result[key] = value;
  });
  return result;
};

GSS.asBoolean = function asBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
};

GSS.allowedSettings = {
  enabled: "boolean",
  provider: "string",
  source: "string",
  target: "string",
  trackName: "string",
  injectTranslated: "boolean",
  translatedTrackName: "string",
  bilingualOrder: "string",
  debug: "boolean",
  cacheEnabled: "boolean",
  cacheTTL: "number"
};

GSS.normalizeSettings = function normalizeSettings(input) {
  var output = {};
  Object.keys(GSS.allowedSettings).forEach(function (key) {
    if (!input || input[key] === undefined || input[key] === null || input[key] === "") return;
    var type = GSS.allowedSettings[key];
    if (type === "boolean") output[key] = GSS.asBoolean(input[key], false);
    else if (type === "number" && !isNaN(Number(input[key]))) output[key] = Math.max(0, Number(input[key]));
    else if (type === "string") output[key] = String(input[key]).slice(0, 120);
  });
  if (output.provider && output.provider !== "google") output.provider = "google";
  if (output.bilingualOrder && output.bilingualOrder !== "original-first") output.bilingualOrder = "translation-first";
  return output;
};

GSS.readStoredSettings = function readStoredSettings() {
  try {
    var raw = GSS.Runtime.read(GSS.SETTINGS_KEY);
    return raw ? GSS.normalizeSettings(JSON.parse(raw)) : {};
  } catch (_) {
    return {};
  }
};

GSS.saveSettings = function saveSettings(input) {
  var normalized = GSS.normalizeSettings(input);
  return GSS.Runtime.write(JSON.stringify(normalized), GSS.SETTINGS_KEY);
};

GSS.resetSettings = function resetSettings() {
  return GSS.Runtime.write("", GSS.SETTINGS_KEY);
};

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

  config.trackName = config.trackName || "Translate-zh";
  config.translatedTrackName = config.translatedTrackName || "Translate-zh-only";
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

  function isSourceTrack(attributes, sourceLanguage) {
    var language = String(get(attributes, "LANGUAGE") || "").toLowerCase();
    var name = String(get(attributes, "NAME") || "").toLowerCase();
    var wanted = String(sourceLanguage || "en").toLowerCase();
    return language === wanted || language.indexOf(wanted + "-") === 0 || (wanted === "en" && /\benglish\b/.test(name));
  }

  function duplicateTrack(line, requestUrl, mode, config) {
    var tag = line.slice(0, line.indexOf(":"));
    var attributes = parseAttributes(line);
    var originalUri = get(attributes, "URI");
    if (!originalUri) return null;
    var absoluteOrigin = GSS.Url.resolve(requestUrl, originalUri);
    var name = mode === "bilingual" ? config.trackName : config.translatedTrackName;
    set(attributes, "NAME", name, true);
    set(attributes, "LANGUAGE", config.target, true);
    set(attributes, "DEFAULT", "NO", false);
    set(attributes, "AUTOSELECT", "YES", false);
    set(attributes, "FORCED", "NO", false);
    set(attributes, "URI", GSS.Url.virtual(config.virtualOrigin, "/playlist", {
      origin: absoluteOrigin,
      mode: mode,
      source: config.source,
      target: config.target,
      version: GSS.VERSION
    }), true);
    return serialize(tag, attributes);
  }

  function injectTracks(body, requestUrl, config, logger) {
    if (!config.enabled || !body || body.indexOf("#EXTM3U") < 0) return body;
    if (body.indexOf("gss.local/playlist") >= 0) return body;
    var lines = body.replace(/\r\n/g, "\n").split("\n"), output = [], injected = 0;
    lines.forEach(function (line) {
      output.push(line);
      if (line.indexOf("#EXT-X-MEDIA:") !== 0) return;
      var attributes = parseAttributes(line);
      if (String(get(attributes, "TYPE") || "").toUpperCase() !== "SUBTITLES") return;
      if (String(get(attributes, "FORCED") || "").toUpperCase() === "YES") return;
      if (!get(attributes, "URI") || !isSourceTrack(attributes, config.source)) return;
      var bilingual = duplicateTrack(line, requestUrl, "bilingual", config);
      if (bilingual) { output.push(bilingual); injected += 1; }
      if (config.injectTranslated) {
        var translated = duplicateTrack(line, requestUrl, "translate", config);
        if (translated) { output.push(translated); injected += 1; }
      }
    });
    logger.info("master manifest inspected", { injected: injected, trackName: config.trackName });
    return injected ? output.join("\n") : body;
  }

  function decorateSubtitlePlaylist(body, originUrl, mode, source, target, config, logger) {
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
        version: GSS.VERSION
      });
    });
    logger.info("subtitle playlist virtualized", { segments: changed, mode: mode });
    return changed ? output.join("\n") : body;
  }

  return {
    parseAttributes: parseAttributes,
    injectTracks: injectTracks,
    decorateSubtitlePlaylist: decorateSubtitlePlaylist
  };
})();

(function manifestEntry() {
  var config = GSS.getConfig();
  var logger = GSS.Logger(config, "manifest");
  try {
    var body = GSS.Runtime.response.body || "";
    if (!config.enabled || body.indexOf("#EXTM3U") < 0) { GSS.Runtime.passThrough(); return; }
    var output = GSS.M3U8.injectTracks(body, GSS.Runtime.request.url || "", config, logger);
    if (output === body) GSS.Runtime.passThrough();
    else GSS.Runtime.doneBody(output, GSS.Runtime.response.headers, "application/vnd.apple.mpegurl; charset=utf-8");
  } catch (error) {
    logger.error("manifest processing failed; original response preserved", { error: String(error), stack: error && error.stack });
    GSS.Runtime.passThrough();
  }
})();
})();
