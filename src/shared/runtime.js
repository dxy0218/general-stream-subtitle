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
