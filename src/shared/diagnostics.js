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
