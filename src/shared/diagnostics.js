GSS.Diagnostics = (function createDiagnostics() {
  var KEY = "GSS_DIAGNOSTICS_V1";
  var LIMIT = 30;

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

  function cleanValue(value, depth) {
    if (depth > 3) return undefined;
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return value.length > 240 ? value.slice(0, 237) + "..." : value;
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.slice(0, 12).map(function (item) { return cleanValue(item, depth + 1); });
    if (typeof value === "object") {
      var output = {};
      Object.keys(value).slice(0, 20).forEach(function (key) {
        if (/token|authorization|cookie|signature|policy|key/i.test(key)) return;
        var cleaned = cleanValue(value[key], depth + 1);
        if (cleaned !== undefined) output[key] = cleaned;
      });
      return output;
    }
    return String(value);
  }

  function record(event) {
    try {
      var rows = readAll();
      var row = cleanValue(event || {}, 0) || {};
      row.time = new Date().toISOString();
      if (row.url) row.url = safeUrl(row.url);
      rows.unshift(row);
      if (rows.length > LIMIT) rows.length = LIMIT;
      GSS.Runtime.write(JSON.stringify(rows), KEY);
    } catch (_) {}
  }

  function list() { return readAll(); }
  function clear() { return GSS.Runtime.write("[]", KEY); }

  return { record: record, list: list, clear: clear, key: KEY };
})();
