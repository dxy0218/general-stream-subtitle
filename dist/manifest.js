// General Stream Subtitle 0.2.0 - cached development loader
(function () {
  "use strict";
  var VERSION = "0.2.0";
  var KEY = "GSS_BUNDLE_MANIFEST_" + VERSION;
  var BASE = "https://raw.githubusercontent.com/dxy0218/general-stream-subtitle/main/";
  var FILES = [
    "src/shared/runtime.js",
    "src/shared/cache.js",
    "src/shared/config.js",
    "src/shared/logger.js",
    "src/shared/url.js",
    "src/manifest/m3u8.js",
    "src/manifest/main.js"
  ];
  function finish(payload) { if (typeof $done === "function") $done(payload || {}); }
  function read() { try { return $persistentStore && $persistentStore.read(KEY); } catch (_) { return null; } }
  function write(value) { try { return $persistentStore && $persistentStore.write(value, KEY); } catch (_) { return false; } }
  function execute(source) {
    try { (0, eval)("var GSS = {};\n" + source); }
    catch (error) { console.log("[GSS loader][manifest] " + String(error)); finish({}); }
  }
  var cached = read();
  if (cached) { execute(cached); return; }
  if (typeof $httpClient === "undefined" || !$httpClient.get) { finish({}); return; }
  var index = 0, parts = [];
  function next() {
    if (index >= FILES.length) {
      var source = parts.join("\n\n");
      write(source);
      execute(source);
      return;
    }
    var url = BASE + FILES[index] + "?v=" + encodeURIComponent(VERSION);
    $httpClient.get({ url: url, headers: { "User-Agent": "GeneralStreamSubtitle/" + VERSION } }, function (error, response, body) {
      var status = response && (response.status || response.statusCode);
      if (error || (status && Number(status) >= 400) || !body) {
        console.log("[GSS loader][manifest] source fetch failed: " + FILES[index]);
        finish({});
        return;
      }
      parts.push(body);
      index += 1;
      next();
    });
  }
  next();
})();
