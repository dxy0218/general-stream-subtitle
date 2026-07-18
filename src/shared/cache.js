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
