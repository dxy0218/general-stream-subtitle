// General Stream Subtitle 0.2.0 - gateway
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

GSS.GoogleTranslate = function GoogleTranslate(config, logger) {
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

  return { translateMany: translateMany };
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

GSS.Subtitle = {
  translateBody: function translateBody(body, mode, source, target, config, logger, callback) {
    if (String(body || "").indexOf("-->") < 0) { callback(null, body, false); return; }
    var cache = GSS.Cache(config, logger);
    var seed = body + "|" + mode + "|" + source + "|" + target + "|" + config.bilingualOrder + "|" + config.provider;
    var cached = cache.get(seed);
    if (cached !== null) { callback(null, cached, true); return; }
    var parsed = GSS.VTT.parse(body), texts = GSS.VTT.uniqueTexts(parsed.cues);
    if (!texts.length) { callback(null, body, false); return; }
    var translator = GSS.GoogleTranslate(config, logger);
    translator.translateMany(texts, source, target, function (error, translations) {
      if (error) { callback(error); return; }
      try {
        var output = GSS.VTT.render(parsed, translations, mode, config.bilingualOrder);
        cache.set(seed, output);
        logger.info("subtitle translated", { mode: mode, uniqueCues: texts.length, source: source, target: target });
        callback(null, output, true);
      } catch (renderError) { callback(renderError); }
    });
  }
};

GSS.Admin = (function createAdmin() {
  function escapeHtml(value) {
    return String(value === undefined ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function checked(value) { return value ? " checked" : ""; }
  function selected(value, expected) { return value === expected ? " selected" : ""; }
  function json(status, value) {
    GSS.Runtime.doneResponse(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, JSON.stringify(value, null, 2));
  }
  function page(config, token, message) {
    var html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>General Stream Subtitle</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:760px;margin:32px auto;padding:0 18px;line-height:1.45;background:#f5f5f7;color:#1d1d1f}main{background:#fff;border-radius:18px;padding:22px;box-shadow:0 8px 30px rgba(0,0,0,.08)}label{display:block;margin:14px 0 6px;font-weight:600}input,select{box-sizing:border-box;width:100%;padding:11px;border:1px solid #d2d2d7;border-radius:10px;font-size:16px}.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.check{display:flex;gap:9px;align-items:center;font-weight:500}.check input{width:auto}.actions{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}button,a.button{border:0;border-radius:10px;padding:11px 16px;background:#0071e3;color:#fff;text-decoration:none;font-size:15px}.muted{color:#6e6e73;font-size:14px}.ok{background:#e8f8ed;padding:10px;border-radius:10px}@media(max-width:620px){.row{grid-template-columns:1fr}}</style></head><body><main>'
      + '<h1>General Stream Subtitle</h1><p class="muted">v' + escapeHtml(GSS.VERSION) + ' · ' + escapeHtml(GSS.Runtime.name) + ' · Max adapter</p>'
      + (message ? '<p class="ok">' + escapeHtml(message) + '</p>' : '')
      + '<form action="/save" method="get"><input type="hidden" name="token" value="' + escapeHtml(token) + '">'
      + '<div class="row"><div><label>源语言</label><input name="source" value="' + escapeHtml(config.source) + '"></div><div><label>目标语言</label><input name="target" value="' + escapeHtml(config.target) + '"></div></div>'
      + '<label>字幕菜单名称</label><input name="trackName" value="' + escapeHtml(config.trackName) + '">'
      + '<label>翻译引擎</label><select name="provider"><option value="google"' + selected(config.provider, 'google') + '>Google 免费兼容接口（实验性）</option></select>'
      + '<label>双语排列</label><select name="bilingualOrder"><option value="translation-first"' + selected(config.bilingualOrder, 'translation-first') + '>中文在上</option><option value="original-first"' + selected(config.bilingualOrder, 'original-first') + '>英文在上</option></select>'
      + '<p class="check"><input type="checkbox" name="enabled" value="true"' + checked(config.enabled) + '>启用字幕注入</p>'
      + '<p class="check"><input type="checkbox" name="injectTranslated" value="true"' + checked(config.injectTranslated) + '>额外显示纯翻译轨</p>'
      + '<p class="check"><input type="checkbox" name="cacheEnabled" value="true"' + checked(config.cacheEnabled) + '>启用翻译缓存</p>'
      + '<p class="check"><input type="checkbox" name="debug" value="true"' + checked(config.debug) + '>启用调试日志</p>'
      + '<div class="actions"><button type="submit">保存设置</button><a class="button" href="/reset?token=' + escapeHtml(token) + '">恢复默认</a><a class="button" href="/health">运行状态</a></div></form>'
      + '<p class="muted">保存后请完全退出并重新打开 Max，再进入字幕菜单。这个页面由代理脚本合成，并不是真的在设备上常驻监听端口。</p>'
      + '</main></body></html>';
    GSS.Runtime.doneResponse(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, html);
  }
  function handle(url, config, logger) {
    var path = GSS.Url.path(url), query = GSS.Url.queryObject(url), token = GSS.getAdminToken();
    if (path === "/health") { json(200, { ok: true, version: GSS.VERSION, runtime: GSS.Runtime.name, config: config }); return true; }
    if (path === "/api/config") { json(200, { version: GSS.VERSION, runtime: GSS.Runtime.name, config: config }); return true; }
    if (path === "/save") {
      if (query.token !== token) { json(403, { ok: false, error: "invalid admin token" }); return true; }
      var values = {
        source: query.source, target: query.target, trackName: query.trackName, provider: query.provider,
        bilingualOrder: query.bilingualOrder, enabled: query.enabled === "true",
        injectTranslated: query.injectTranslated === "true", cacheEnabled: query.cacheEnabled === "true", debug: query.debug === "true"
      };
      GSS.saveSettings(values);
      logger.info("settings saved", values);
      page(GSS.getConfig(), token, "设置已保存。重新打开 Max 后生效。");
      return true;
    }
    if (path === "/reset") {
      if (query.token !== token) { json(403, { ok: false, error: "invalid admin token" }); return true; }
      GSS.resetSettings();
      page(GSS.getConfig(), token, "已恢复模块默认设置。");
      return true;
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
  function emptyVtt(reason) {
    logger.error(reason + "; returning empty virtual subtitle");
    GSS.Runtime.doneResponse(200, { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "no-store" }, "WEBVTT\n\n");
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
    if (!origin) { emptyVtt("missing origin URL"); return; }

    GSS.Runtime.httpGet({ url: origin, headers: GSS.Runtime.request.headers || {} }, function (error, body, response) {
      if (error) { emptyVtt("upstream fetch failed: " + String(error)); return; }
      try {
        if (path === "/playlist") {
          if (body.indexOf("#EXTM3U") >= 0) {
            var playlist = GSS.M3U8.decorateSubtitlePlaylist(body, origin, mode, source, target, config, logger);
            GSS.Runtime.doneResponse(200, GSS.Runtime.cleanHeaders(upstreamHeaders(response), "application/vnd.apple.mpegurl; charset=utf-8"), playlist);
            return;
          }
          if (body.indexOf("-->") >= 0) {
            GSS.Subtitle.translateBody(body, mode, source, target, config, logger, function (translateError, translated) {
              if (translateError) { emptyVtt("translation failed: " + String(translateError)); return; }
              GSS.Runtime.doneResponse(200, GSS.Runtime.cleanHeaders(upstreamHeaders(response), "text/vtt; charset=utf-8"), translated);
            });
            return;
          }
          emptyVtt("unsupported subtitle playlist response");
          return;
        }

        if (path === "/subtitle") {
          GSS.Subtitle.translateBody(body, mode, source, target, config, logger, function (translateError, translated) {
            if (translateError) { emptyVtt("translation failed: " + String(translateError)); return; }
            GSS.Runtime.doneResponse(200, GSS.Runtime.cleanHeaders(upstreamHeaders(response), "text/vtt; charset=utf-8"), translated);
          });
          return;
        }
        GSS.Runtime.doneResponse(404, { "Content-Type": "text/plain; charset=utf-8" }, "General Stream Subtitle: route not found");
      } catch (processingError) { emptyVtt("gateway processing failed: " + String(processingError)); }
    });
  } catch (error) {
    logger.error("gateway failed", { error: String(error), stack: error && error.stack });
    emptyVtt("gateway exception");
  }
})();
})();
