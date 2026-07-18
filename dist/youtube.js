// General Stream Subtitle 0.5.0 - cached modular loader (youtube)
(function () {
  "use strict";
  var VERSION = "0.5.0";
  var KEY = "GSS_SOURCE_BUNDLE_YOUTUBE_" + VERSION;
  var BASE = "https://raw.githubusercontent.com/dxy0218/general-stream-subtitle/main/";
  var FILES = ["src/shared/runtime.js", "src/shared/cache.js", "src/shared/language.js", "src/shared/config.js", "src/shared/logger.js", "src/shared/url.js", "src/formats/registry.js", "src/platforms/registry.js", "src/youtube/player.js", "src/youtube/main.js"];
  var LIMIT = 6;
  function finish(payload) { if (typeof $done === "function") $done(payload || {}); }
  function read() { try { return $persistentStore && $persistentStore.read(KEY); } catch (_) { return null; } }
  function write(value) { try { return $persistentStore && $persistentStore.write(value, KEY); } catch (_) { return false; } }
  function fail(message) {
    console.log("[GSS loader][youtube] " + message);
    if (false) finish({ response: { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "General Stream Subtitle source unavailable" } });
    else finish({});
  }
  function execute(source) {
    try { (0, eval)("var GSS = {};\n" + source); }
    catch (error) { fail(String(error)); }
  }
  var cached = read();
  if (cached) { execute(cached); return; }
  if (typeof $httpClient === "undefined" || !$httpClient.get) { fail("$httpClient.get unavailable"); return; }
  var parts = new Array(FILES.length), next = 0, active = 0, done = 0, failed = false;
  function pump() {
    if (failed) return;
    if (done === FILES.length) { var source = parts.join("\n\n"); write(source); execute(source); return; }
    while (active < LIMIT && next < FILES.length) {
      (function (index) {
        active += 1;
        var url = BASE + FILES[index] + "?v=" + encodeURIComponent(VERSION);
        $httpClient.get({ url: url, headers: { "User-Agent": "GeneralStreamSubtitle/" + VERSION } }, function (error, response, body) {
          active -= 1;
          var status = response && (response.status || response.statusCode);
          if (error || (status && Number(status) >= 400) || !body) { failed = true; fail("source fetch failed: " + FILES[index]); return; }
          parts[index] = body; done += 1; pump();
        });
      })(next++);
    }
  }
  pump();
})();
