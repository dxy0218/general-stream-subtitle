import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function run(relative, globals) {
  const context = vm.createContext({ console, Date, Math, ...globals });
  vm.runInContext(fs.readFileSync(path.join(root, relative), "utf8"), context);
  return context;
}
function storeRuntime() {
  const store = new Map();
  return { store, persistent: { read(k) { return store.get(k) || null; }, write(v, k) { store.set(k, v); return true; } } };
}

test("detects Paramount+ Live TV separately from VOD", () => {
  const context = vm.createContext({ console, Date, Math });
  const files = ["src/shared/runtime.js", "src/shared/language.js", "src/shared/config.js", "src/shared/url.js", "src/platforms/registry.js"];
  const GSS = vm.runInContext(`var GSS={};\n${files.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n")}\nGSS;`, context);
  assert.equal(GSS.Platforms.detect("https://live.cbsaavideo.com/channel/cbs-news/master.m3u8").id, "paramount-live");
  assert.equal(GSS.Platforms.detect("https://vod.cbsaavideo.com/library/show/master.m3u8").id, "paramount");
});

test("Max playback JSON injects a virtual Translate-zh text track", () => {
  const body = fs.readFileSync(path.join(root, "tests/fixtures/max-playback.json"), "utf8");
  const { store, persistent } = storeRuntime(); let result;
  run("dist/manifest.js", {
    $request: { url: "https://play.max.com/playback/session?id=demo", headers: {} },
    $response: { body, headers: { "Content-Type": "application/json", "Content-Length": "999", ETag: '"stale"', Digest: "sha-256=stale" } },
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  const parsed = JSON.parse(result.body);
  assert.equal(parsed.playback.textTracks.length, 2);
  const injected = parsed.playback.textTracks[1];
  assert.equal(injected.label, "Translate-zh");
  assert.equal(injected.language, "zh-CN");
  assert.equal(injected.default, false);
  assert.equal(injected.selected, false);
  assert.match(injected.url, /https:\/\/example\.com\/subtitle\?/);
  assert.doesNotMatch(JSON.stringify([...store.entries()]), /private/);
  assert.equal(result.headers["Content-Length"], undefined);
  assert.equal(result.headers.ETag, undefined);
  assert.equal(result.headers.Digest, undefined);
});

test("Discovery+ playback JSON preserves the official text-track identity on current CDN hosts", () => {
  const body = fs.readFileSync(path.join(root, "tests/fixtures/max-playback.json"), "utf8");
  const { persistent } = storeRuntime(); let result;
  run("dist/manifest.js", {
    $request: { url: "https://content-ause1-ur-discovery1.uplynk.com/playback/session?id=demo", headers: {} },
    $response: { body, headers: { "Content-Type": "application/json" } },
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  const parsed = JSON.parse(result.body);
  assert.equal(parsed.playback.textTracks.length, 1);
  assert.equal(parsed.playback.textTracks[0].label, "English CC");
  assert.equal(parsed.playback.textTracks[0].language, "en");
  assert.match(parsed.playback.textTracks[0].url, /example\.com\/subtitle/);
  assert.match(decodeURIComponent(parsed.playback.textTracks[0].url), /platform=discovery/);
  assert.match(decodeURIComponent(parsed.playback.textTracks[0].url), /strategy=replace-source/);
});

test("Paramount+ playback JSON preserves the official text-track identity", () => {
  const body = fs.readFileSync(path.join(root, "tests/fixtures/max-playback.json"), "utf8");
  const { persistent } = storeRuntime(); let result;
  run("dist/manifest.js", {
    $request: { url: "https://api.paramountplus.com/playback/session?id=demo", headers: {} },
    $response: { body, headers: { "Content-Type": "application/json" } },
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  const parsed = JSON.parse(result.body);
  assert.equal(parsed.playback.textTracks.length, 1);
  assert.equal(parsed.playback.textTracks[0].label, "English CC");
  assert.match(decodeURIComponent(parsed.playback.textTracks[0].url), /platform=paramount/);
  assert.match(decodeURIComponent(parsed.playback.textTracks[0].url), /strategy=replace-source/);
});

test("Shadowrocket processes Paramount iOS and current tvOS playback metadata", () => {
  const body = fs.readFileSync(path.join(root, "tests/fixtures/paramount-iphone-playback.json"), "utf8");
  const urls = [
    "https://www.paramountplus.com/apps-api/v2.0/iphone/video/cid/demo-paramount-vod.json?locale=en-US",
    "https://www.paramountplus.com/apps-api/v3.1/appletvtvos/dynamicplay/show/61457158.json?locale=en&platformType=appletvtvos",
    "https://www.paramountplus.com/apps-api/v3.1/appletvtvos/content/playability.json?contentId=demo-paramount-vod"
  ];
  for (const url of urls) {
    const { persistent } = storeRuntime(); let result;
    run("dist/manifest.js", {
      $request: { url, headers: {} },
      $response: { body, headers: { "Content-Type": "application/json" } },
      $argument: "presetMode=true&safePlayback=true&platformParamount=true&paramountReplaceSource=true&logEnabled=true",
      $persistentStore: persistent,
      $done(p) { result = p; }
    });
    const parsed = JSON.parse(result.body);
    const captionUrl = parsed.itemList[0].webVTTCaptionURL;
    assert.match(captionUrl, /https:\/\/example\.com\/playlist\?/);
    assert.match(decodeURIComponent(captionUrl), /origin=https:\/\/vod\.pplus\.paramount\.tech\/demo\/English_100\/stream_vtt\.m3u8/);
    assert.match(decodeURIComponent(captionUrl), /platform=paramount/);
    assert.match(decodeURIComponent(captionUrl), /strategy=replace-source/);
  }
});

test("Paramount tvOS session routes only an unsigned known-media HLS URL through the Gateway", () => {
  const body = JSON.stringify({
    sessionToken: "private-session-token",
    playback: {
      masterUrl: "https://vod.pplus.paramount.tech/title/master.m3u8",
      signedBackup: "https://vod.pplus.paramount.tech/title/master.m3u8?token=private",
      licenseUrl: "https://cbsi.live.ott.irdeto.com/streaming/getckc"
    }
  });
  const { store, persistent } = storeRuntime(); let result;
  run("dist/manifest.js", {
    $request: {
      url: "https://www.paramountplus.com/apps-api/v3.3/appletvtvos/irdeto-control/session-token.json?contentId=demo",
      headers: {}
    },
    $response: { body, headers: { "Content-Type": "application/json", "Content-Length": "999" } },
    $argument: "presetMode=true&safePlayback=true&platformParamount=true&logEnabled=true",
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  const parsed = JSON.parse(result.body);
  assert.equal(parsed.sessionToken, "private-session-token");
  assert.match(parsed.playback.masterUrl, /^https:\/\/vod\.pplus\.paramount\.tech\/__gss__\/manifest\?/);
  assert.match(decodeURIComponent(parsed.playback.masterUrl), /origin=https:\/\/vod\.pplus\.paramount\.tech\/title\/master\.m3u8/);
  assert.match(decodeURIComponent(parsed.playback.masterUrl), /version=0\.8\.0/);
  assert.equal(parsed.playback.signedBackup, "https://vod.pplus.paramount.tech/title/master.m3u8?token=private");
  assert.equal(parsed.playback.licenseUrl, "https://cbsi.live.ott.irdeto.com/streaming/getckc");
  assert.equal(result.headers["Content-Length"], undefined);
  const records = JSON.parse(store.get("GSS_DIAGNOSTICS_V1"));
  const warning = records.find((row) => row.message === "Paramount playback manifest routed through Gateway");
  assert.equal(warning.details.endpoint, "session-token");
  assert.equal(warning.details.manifests, 1);
  assert.doesNotMatch(JSON.stringify(records), /private-session-token|token=private/);
});

test("Paramount tvOS routes the playback metadata manifest through the Gateway before the Irdeto session", () => {
  const body = JSON.stringify({
    success: true,
    content: {
      id: "demo",
      masterUrl: "https://vod.pplus.paramount.tech/title/master.m3u8"
    }
  });
  const { store, persistent } = storeRuntime(); let result;
  run("dist/manifest.js", {
    $request: {
      url: "https://www.paramountplus.com/apps-api/v3.1/appletvtvos/content/playability.json?contentId=private-token",
      headers: {}
    },
    $response: { body, headers: { "Content-Type": "application/json", "Content-Length": "999" } },
    $argument: "presetMode=true&safePlayback=true&platformParamount=true&logEnabled=true",
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  const parsed = JSON.parse(result.body);
  assert.match(parsed.content.masterUrl, /^https:\/\/vod\.pplus\.paramount\.tech\/__gss__\/manifest\?/);
  assert.match(decodeURIComponent(parsed.content.masterUrl), /origin=https:\/\/vod\.pplus\.paramount\.tech\/title\/master\.m3u8/);
  assert.match(decodeURIComponent(parsed.content.masterUrl), /version=0\.8\.0/);
  assert.equal(result.headers["Content-Length"], undefined);
  const records = JSON.parse(store.get("GSS_DIAGNOSTICS_V1"));
  const warning = records.find((row) => row.message === "Paramount playback manifest routed through Gateway");
  assert.equal(warning.details.endpoint, "content/playability");
  assert.equal(warning.details.manifests, 1);
  assert.equal(records.some((row) => row.message === "Paramount playback metadata exposed no supported text track"), false);
  assert.doesNotMatch(JSON.stringify(records), /private-token/);
});

test("Discovery compatibility mode overrides stored settings and can fully pass through", () => {
  const body = fs.readFileSync(path.join(root, "tests/fixtures/master.m3u8"), "utf8");
  const { store, persistent } = storeRuntime(); let result;
  store.set("GSS_SETTINGS_V4", JSON.stringify({ platforms: "all", discoveryMode: "full" }));
  run("dist/manifest.js", {
    $request: { url: "https://content-ause1-ur-discovery1.uplynk.com/asset/master.m3u8", headers: {} },
    $response: { body, headers: { "Content-Type": "application/vnd.apple.mpegurl" } },
    $argument: "discoveryMode=off",
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  assert.deepEqual(Object.keys(result), []);
});

test("Discovery hls-only mode injects HLS but bypasses playback JSON", () => {
  const hls = fs.readFileSync(path.join(root, "tests/fixtures/master.m3u8"), "utf8");
  const json = fs.readFileSync(path.join(root, "tests/fixtures/max-playback.json"), "utf8");
  const { persistent } = storeRuntime(); let hlsResult, jsonResult;
  const globals = { $argument: "discoveryMode=hls-only", $persistentStore: persistent };
  run("dist/manifest.js", {
    ...globals,
    $request: { url: "https://content-ause1-ur-discovery1.uplynk.com/asset/master.m3u8", headers: {} },
    $response: { body: hls, headers: { "Content-Type": "application/vnd.apple.mpegurl" } },
    $done(p) { hlsResult = p; }
  });
  run("dist/manifest.js", {
    ...globals,
    $request: { url: "https://content-ause1-ur-discovery1.uplynk.com/playback/session", headers: {} },
    $response: { body: json, headers: { "Content-Type": "application/json" } },
    $done(p) { jsonResult = p; }
  });
  assert.match(hlsResult.body, /example\.com\/playlist/);
  assert.deepEqual(Object.keys(jsonResult), []);
});

test("Shadowrocket preset overrides stale settings and injects all requested HLS platforms", () => {
  const hls = fs.readFileSync(path.join(root, "tests/fixtures/master.m3u8"), "utf8");
  const { store, persistent } = storeRuntime();
  store.set("GSS_SETTINGS_V4", JSON.stringify({ platforms: "none", source: "ja", target: "en", discoveryMode: "full" }));
  const argument = "presetMode=true&safePlayback=true&platformDiscovery=true&discoveryHlsOnly=true&platformMax=true&platformPluto=true&platformPrime=true&platformHulu=true&platformParamount=true&platformYoutube=false";
  const cases = [
    ["discovery", "https://content-ause1-ur-discovery1.uplynk.com/asset/master.m3u8"],
    ["max", "https://cf.prod.media.max.com/title/master.m3u8"],
    ["pluto", "https://service-stitcher.clusters.pluto.tv/v1/stitch/embed/hls/channel/demo/master.m3u8"],
    ["prime", "https://a.hls.pv-cdn.net/title/master.m3u8"],
    ["hulu", "https://vodmanifest.hulustream.com/title/master.m3u8"],
    ["paramount", "https://vod.cbsaavideo.com/library/show/master.m3u8"],
    ["paramount-live", "https://live.cbsaavideo.com/channel/cbs-news/master.m3u8"]
  ];
  for (const [platform, url] of cases) {
    let result;
    run("dist/manifest.js", {
      $request: { url, headers: {} },
      $response: { body: hls, headers: { "Content-Type": "application/vnd.apple.mpegurl" } },
      $argument: argument,
      $persistentStore: persistent,
      $done(p) { result = p; }
    });
    assert.doesNotMatch(result.body, /NAME="Translate-zh"/);
    assert.equal((result.body.match(/TYPE=SUBTITLES/g) || []).length, 1);
    assert.match(decodeURIComponent(result.body), /strategy=replace-source/);
    assert.match(decodeURIComponent(result.body), new RegExp(`platform=${platform}`));
  }
});

test("Shadowrocket Hy-MT2 preset keeps the private endpoint and normal fallback throughput", () => {
  const { store, persistent } = storeRuntime();
  store.set("GSS_SETTINGS_V4", JSON.stringify({
    provider: "google-free",
    providerEndpoint: "https://private-translator.example:9443/v1",
    providerModel: "stale-model",
    translationConcurrency: 4,
    batchItems: 12,
    batchChars: 1600
  }));
  let result;
  run("dist/gateway.js", {
    $request: { url: "https://example.com/health", method: "GET", headers: {} },
    $argument: "presetMode=true&safePlayback=true&hyMt2Preset=true&platformMax=true&platformYoutube=false",
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  const config = JSON.parse(result.response.body).config;
  assert.equal(config.provider, "openai-compatible");
  assert.equal(config.fallbackProviders, "google-free");
  assert.equal(config.providerEndpoint, "https://private-translator.example:9443/v1");
  assert.equal(config.providerModel, "hy-mt2-1.8b");
  assert.equal(config.translationConcurrency, 4);
  assert.equal(config.batchItems, 12);
  assert.equal(config.batchChars, 1600);
  assert.equal(config.hyMt2Preset, true);
  assert.equal(config.maxReplaceSource, true);
  assert.equal(config.paramountReplaceSource, true);
  assert.equal(config.trackStrategy, "replace-source");
});

test("Shadowrocket Paramount preset preserves the official rendition and virtualizes only its URI", () => {
  const body = fs.readFileSync(path.join(root, "tests/fixtures/paramount-live-master.m3u8"), "utf8");
  const { persistent } = storeRuntime(); let result;
  run("dist/manifest.js", {
    $request: { url: "https://vod.pplus.paramount.tech/title/master.m3u8", headers: {} },
    $response: { body, headers: { "Content-Type": "application/vnd.apple.mpegurl" } },
    $argument: "presetMode=true&safePlayback=true&platformParamount=true&paramountReplaceSource=true",
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  assert.equal((result.body.match(/TYPE=SUBTITLES/g) || []).length, 1);
  assert.match(result.body, /NAME="English CC"/);
  assert.match(result.body, /LANGUAGE="en"/);
  assert.doesNotMatch(result.body, /NAME="Translate-zh"/);
  const decoded = decodeURIComponent(result.body);
  assert.match(decoded, /https:\/\/example\.com\/playlist\?/);
  assert.match(decoded, /platform=paramount/);
  assert.match(decoded, /strategy=replace-source/);
});

test("Shadowrocket Paramount Splice master uses the same source-replacement path", () => {
  const body = fs.readFileSync(path.join(root, "tests/fixtures/paramount-live-master.m3u8"), "utf8");
  const { persistent } = storeRuntime(); let result;
  run("dist/manifest.js", {
    $request: { url: "https://splice.paramountplus.com/title/master.m3u8?session=demo", headers: {} },
    $response: { body, headers: { "Content-Type": "application/vnd.apple.mpegurl" } },
    $argument: "presetMode=true&safePlayback=true&platformParamount=true&paramountReplaceSource=true",
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  assert.equal((result.body.match(/TYPE=SUBTITLES/g) || []).length, 1);
  assert.doesNotMatch(result.body, /NAME="Translate-zh"/);
  const decoded = decodeURIComponent(result.body);
  assert.match(decoded, /https:\/\/example\.com\/playlist\?/);
  assert.match(decoded, /platform=paramount/);
  assert.match(decoded, /strategy=replace-source/);
});

test("Paramount tvOS metadata without captions records a safe actionable warning", () => {
  const { store, persistent } = storeRuntime(); let result;
  run("dist/manifest.js", {
    $request: {
      url: "https://www.paramountplus.com/apps-api/v3.1/appletvtvos/content/playability.json?contentId=private-token",
      headers: {}
    },
    $response: { body: JSON.stringify({ success: true, content: { id: "demo" } }), headers: { "Content-Type": "application/json" } },
    $argument: "presetMode=true&safePlayback=true&platformParamount=true&logEnabled=true",
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  assert.deepEqual(Object.keys(result), []);
  const records = JSON.parse(store.get("GSS_DIAGNOSTICS_V1"));
  const warning = records.find((row) => row.type === "runtime-log" && row.level === "warn");
  assert.equal(warning.message, "Paramount playback metadata exposed no supported text track");
  assert.equal(warning.details.endpoint, "content/playability");
  assert.equal(warning.details.textTracks, 0);
  assert.doesNotMatch(JSON.stringify(warning), /private-token/);
});

test("Paramount direct WebVTT playlist is virtualized when the master manifest came from app cache", () => {
  const body = [
    "#EXTM3U",
    "#EXT-X-VERSION:6",
    "#EXT-X-TARGETDURATION:7",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXTINF:6.000,",
    "seg_1.vtt",
    "#EXTINF:6.000,",
    "seg_2.vtt",
    "#EXT-X-ENDLIST"
  ].join("\n");
  const { store, persistent } = storeRuntime(); let result;
  run("dist/manifest.js", {
    $request: {
      url: "https://vod.pplus.paramount.tech/title/English_1725574736/stream_vtt.m3u8",
      headers: {}
    },
    $response: { body, headers: { "Content-Type": "application/vnd.apple.mpegurl" } },
    $argument: "presetMode=true&safePlayback=true&platformParamount=true&logEnabled=true",
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  const decoded = decodeURIComponent(result.body);
  assert.equal((result.body.match(/https:\/\/example\.com\/subtitle\?/g) || []).length, 2);
  assert.match(decoded, /origin=https:\/\/vod\.pplus\.paramount\.tech\/title\/English_1725574736\/seg_1\.vtt/);
  assert.match(decoded, /platform=paramount/);
  assert.match(decoded, /mode=bilingual/);
  const records = JSON.parse(store.get("GSS_DIAGNOSTICS_V1"));
  assert.equal(records[0].type, "hls-subtitle");
  assert.equal(records[0].details.directSubtitlePlaylist, true);
  assert.equal(records[0].details.virtualizedSegments, 2);
});

test("Max media playlists remain unchanged by the direct subtitle fallback", () => {
  const body = ["#EXTM3U", "#EXT-X-TARGETDURATION:7", "#EXTINF:6.000,", "seg_1.vtt"].join("\n");
  const { persistent } = storeRuntime(); let result;
  run("dist/manifest.js", {
    $request: { url: "https://gcp.prd.media.h264.io/title/captions/subtitles.m3u8", headers: {} },
    $response: { body, headers: { "Content-Type": "application/vnd.apple.mpegurl" } },
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  assert.deepEqual(Object.keys(result), []);
});

test("safe playback preset bypasses non-HLS responses and a disabled Discovery adapter", () => {
  const hls = fs.readFileSync(path.join(root, "tests/fixtures/master.m3u8"), "utf8");
  const mpd = fs.readFileSync(path.join(root, "tests/fixtures/simple.mpd"), "utf8");
  const json = fs.readFileSync(path.join(root, "tests/fixtures/max-playback.json"), "utf8");
  const { store, persistent } = storeRuntime();
  store.set("GSS_SETTINGS_V4", JSON.stringify({ platforms: "all", discoveryMode: "full" }));
  const argument = "presetMode=true&safePlayback=true&platformDiscovery=false&platformMax=true&platformPluto=true&platformPrime=true&platformHulu=true&platformYoutube=false";
  const cases = [
    ["https://default.any-any.prd.api.max.com/playback/session", json],
    ["https://a.hls.pv-cdn.net/title/manifest.mpd", mpd],
    ["https://vodmanifest.hulustream.com/title/manifest.mpd", mpd],
    ["https://service-stitcher.clusters.pluto.tv/title/manifest.mpd", mpd],
    ["https://content-ause1-ur-discovery1.uplynk.com/asset/master.m3u8", hls]
  ];
  for (const [url, body] of cases) {
    let result;
    run("dist/manifest.js", {
      $request: { url, headers: {} },
      $response: { body, headers: {} },
      $argument: argument,
      $persistentStore: persistent,
      $done(p) { result = p; }
    });
    assert.deepEqual(Object.keys(result), []);
  }
});

test("Apple manifest rewrite preserves DRM, video routes and the official subtitle identity", () => {
  const body = [
    "#EXTM3U",
    '#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES,URI="skd://license.example/key",KEYFORMAT="com.apple.streamingkeydelivery"',
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,STABLE-RENDITION-ID="apple.en",URI="subs/en.m3u8?token=signed"',
    '#EXT-X-STREAM-INF:BANDWIDTH=2500000,SUBTITLES="subs"',
    "video/main.m3u8?token=video-signed"
  ].join("\n");
  const { persistent } = storeRuntime(); let result;
  run("dist/manifest.js", {
    $request: { url: "https://play.itunes.apple.com/WebObjects/MZPlay.woa/hls/workout/master.m3u8", headers: {} },
    $response: { body, headers: { "Content-Type": "application/vnd.apple.mpegurl", ETag: '"old"', "Content-MD5": "old" } },
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  assert.match(result.body, /skd:\/\/license\.example\/key/);
  assert.match(result.body, /video\/main\.m3u8\?token=video-signed/);
  assert.match(result.body, /NAME="English"/);
  assert.match(result.body, /STABLE-RENDITION-ID="apple\.en"/);
  assert.doesNotMatch(result.body, /NAME="Translate-zh"/);
  assert.match(decodeURIComponent(result.body), /strategy=replace-source/);
  assert.equal(result.headers.ETag, undefined);
  assert.equal(result.headers["Content-MD5"], undefined);
});

test("Paramount+ Live TV master preserves the official subtitle rendition", () => {
  const body = fs.readFileSync(path.join(root, "tests/fixtures/paramount-live-master.m3u8"), "utf8");
  const { persistent } = storeRuntime(); let result;
  run("dist/manifest.js", {
    $request: { url: "https://live.cbsaavideo.com/channel/cbs-news/master.m3u8", headers: {} },
    $response: { body, headers: { "Content-Type": "application/vnd.apple.mpegurl" } },
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  assert.match(result.body, /NAME="English CC"/);
  assert.doesNotMatch(result.body, /NAME="Translate-zh"/);
  assert.equal((result.body.match(/TYPE=SUBTITLES/g) || []).length, 1);
  assert.match(decodeURIComponent(result.body), /strategy=replace-source/);
  assert.match(decodeURIComponent(result.body), /platform=paramount-live/);
});

test("diagnostics records sanitized playback inspection", () => {
  const body = fs.readFileSync(path.join(root, "tests/fixtures/max-playback.json"), "utf8");
  const { store, persistent } = storeRuntime(); let result;
  run("dist/manifest.js", {
    $request: { url: "https://play.max.com/playback/session?id=secret&token=private", headers: {} },
    $response: { body, headers: { "Content-Type": "application/json" } },
    $argument: "debug=true",
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  assert.ok(result.body);
  const rows = JSON.parse(store.get("GSS_DIAGNOSTICS_V1"));
  assert.equal(rows[0].platform, "max");
  assert.equal(rows[0].type, "playback-json");
  assert.equal(rows[0].changed, true);
  assert.doesNotMatch(rows[0].url, /token|secret|private/);
});

test("generated modules use dedicated media-only rules for the requested platforms", () => {
  const files = ["GeneralStreamSubtitle.module", "GeneralStreamSubtitle.plugin", "GeneralStreamSubtitle.sgmodule"];
  for (const file of files) {
    const content = fs.readFileSync(path.join(root, "modules", file), "utf8");
    assert.match(content, /GSS Pluto HLS/);
    assert.match(content, /GSS Prime Video HLS/);
    assert.match(content, /GSS Hulu HLS/);
    assert.match(content, /GSS Max Discovery Media/);
    assert.match(content, /uplynk\\\.com/);
    const hostnameLine = content.split("\n").find((line) => line.startsWith("hostname = "));
    const hostnameHosts = hostnameLine.replace(/^hostname = (?:%APPEND% )?/, "").split(",").map((host) => host.trim());
    assert.doesNotMatch(content, /hostname = .*\*\.pluto\.tv/);
    assert.doesNotMatch(content, /hostname = .*\*\.max\.com/);
    assert.doesNotMatch(content, /hostname = .*\*\.discomax\.com/);
    assert.doesNotMatch(content, /hostname = .*\*\.api\.hbo\.com/);
    assert.doesNotMatch(content, /hostname = .*s3\.amazonaws\.com/);
    assert.doesNotMatch(content, /hostname = .*\*\.itunes\.apple\.com/);
    assert.doesNotMatch(content, /hostname = .*\*\.tv\.apple\.com/);
    assert.equal(hostnameHosts.includes("*.uplynk.com"), false);
    assert.equal(hostnameHosts.includes("*.disco-api.com"), false);
    assert.equal(hostnameHosts.includes("*.discoveryplus.com"), false);
    assert.equal(hostnameHosts.includes("*.discoveryplus.co.uk"), false);
    assert.equal(hostnameHosts.includes("*.discoveryplus.in"), false);
    assert.equal(hostnameHosts.includes("*discovery*.uplynk.com"), true);
    assert.equal(hostnameHosts.includes("dplus-*.akamaized.net"), true);
    assert.equal(hostnameHosts.includes("livemanifest-f.hulustream.com"), true);
    assert.equal(hostnameHosts.includes("live-sc.hulustream.com"), true);
    assert.match(content, /service-stitcher\.clusters\.pluto\.tv/);
    assert.match(content, /(?:trackStrategy=replace-source|TRACK_STRATEGY=replace-source)/);
  }
  const shadow = fs.readFileSync(path.join(root, "modules", "GeneralStreamSubtitle.module"), "utf8");
  assert.match(shadow, /GSS Paramount HLS/);
  assert.match(shadow, /GSS Paramount Playback Metadata/);
  assert.match(shadow, /GSS Other Media Manifest/);
  assert.match(shadow, /\*\.cbsaavideo\.com/);
  assert.match(shadow, /cbsi\.live\.ott\.irdeto\.com/);
  assert.match(shadow, /\*\.stream\.peacocktv\.com/);
  assert.match(shadow, /manifest-viki\.viki\.io/);
  assert.match(shadow, /\*\.plex\.direct/);
  assert.doesNotMatch(shadow, /\*\.paramountplus\.com/);
  assert.match(shadow, /www\.paramountplus\.com/);
  assert.match(shadow, /splice\.paramountplus\.com/);
  assert.match(shadow, /splice-media\.paramountplus\.com/);
  assert.doesNotMatch(shadow, /\*\.cbs\.com/);
  assert.doesNotMatch(shadow, /GSS YouTube Player|GSS YouTube Caption/);
  assert.match(shadow, /^\[Rule\]$/m);
  assert.match(shadow, /^DOMAIN-SUFFIX,plutotv\.net,PROXY,force-remote-dns$/m);
});

test("Shadowrocket exposes only native boolean switches", () => {
  const content = fs.readFileSync(path.join(root, "modules", "GeneralStreamSubtitle.module"), "utf8");
  const argumentLine = content.split("\n").find((line) => line.startsWith("#!arguments="));
  const descriptionLine = content.split("\n").find((line) => line.startsWith("#!arguments-desc="));
  const entries = argumentLine.slice("#!arguments=".length).split(",").map((entry) => entry.trim().split(":"));
  const names = entries.map(([name]) => name);
  assert.deepEqual(names, ["DISCOVERY", "DISCOVERY_HLS_ONLY", "MAX", "PLUTO", "PRIME", "HULU", "PARAMOUNT", "OTHER", "HY_MT2", "PURE_TRACK", "CACHE", "LOGS", "DEBUG"]);
  for (const [name, value] of entries) {
    assert.match(value, /^(?:true|false)$/);
    assert.match(descriptionLine, new RegExp(`${name}: `));
  }
  assert.match(content, /presetMode=true/);
  assert.match(content, /hyMt2Preset=\{\{\{HY_MT2\}\}\}/);
  assert.match(content, /safePlayback/);
  assert.doesNotMatch(argumentLine, /SOURCE|TARGET|PROVIDER|PLATFORMS|FORMATS|ORDER/);
});

test("Shadowrocket safety module never intercepts YouTube TV", () => {
  const content = fs.readFileSync(path.join(root, "modules", "GeneralStreamSubtitle.module"), "utf8");
  const hostnameLine = content.split("\n").find((line) => line.startsWith("hostname = "));
  assert.doesNotMatch(content, /GSS YouTube Player/);
  assert.doesNotMatch(content, /GSS YouTube Caption/);
  assert.doesNotMatch(hostnameLine, /youtube/i);
  assert.doesNotMatch(content, /platformYoutube|youtubeUseAsr|youtubeLive/);
});

test("Shadowrocket Paramount rule only intercepts known HLS media hosts", () => {
  const content = fs.readFileSync(path.join(root, "modules", "GeneralStreamSubtitle.module"), "utf8");
  const line = content.split("\n").find((item) => item.startsWith("GSS Paramount HLS ="));
  const pattern = new RegExp(line.slice(line.indexOf("pattern=") + 8, line.indexOf(", requires-body=")));
  assert.equal(pattern.test("https://vod.cbsaavideo.com/library/show/master.m3u8?token=x"), true);
  assert.equal(pattern.test("https://live.cbsaavideo.com/channel/news/subtitles/en.m3u8"), true);
  assert.equal(pattern.test("https://media.pplus.paramount.tech/title/playlist.m3u8"), true);
  assert.equal(pattern.test("https://news-pplus.cbs.com/live/master.m3u8"), true);
  assert.equal(pattern.test("https://cc.cbs.com/closedcaption/show/en.m3u8"), true);
  assert.equal(pattern.test("https://cbsi.live.ott.irdeto.com/channel/subtitles/en.m3u8"), true);
  assert.equal(pattern.test("https://splice.paramountplus.com/title/master.m3u8?session=x"), true);
  assert.equal(pattern.test("https://splice-media.paramountplus.com/title/subtitles/en.m3u8?session=x"), true);
  assert.equal(pattern.test("https://splice-media.paramountplus.com/assets/splice_preview/demo.mp4"), false);
  assert.equal(pattern.test("https://auth.paramountplus.com/login"), false);
  assert.equal(pattern.test("https://api.paramountplus.com/graphql"), false);
  assert.equal(pattern.test("https://www.cbs.com/account/profile"), false);
  assert.equal(pattern.test("https://vod.cbsaavideo.com/library/show/manifest.mpd"), false);
});

test("Shadowrocket Paramount metadata rule matches only Apple VOD playback descriptions", () => {
  const content = fs.readFileSync(path.join(root, "modules", "GeneralStreamSubtitle.module"), "utf8");
  const line = content.split("\n").find((item) => item.startsWith("GSS Paramount Playback Metadata ="));
  const pattern = new RegExp(line.slice(line.indexOf("pattern=") + 8, line.indexOf(", requires-body=")));
  assert.equal(pattern.test("https://www.paramountplus.com/apps-api/v2.0/iphone/video/cid/demo.json?locale=en-US"), true);
  assert.equal(pattern.test("https://www.paramountplus.com/apps-api/v3.0/ipad/video/cid/demo.json"), true);
  assert.equal(pattern.test("https://www.paramountplus.com/apps-api/v3.1/appletvtvos/dynamicplay/show/61457158.json?platformType=appletvtvos"), true);
  assert.equal(pattern.test("https://www.paramountplus.com/apps-api/v3.1/appletvtvos/dynamicplay/movie/12345.json"), true);
  assert.equal(pattern.test("https://www.paramountplus.com/apps-api/v3.1/appletvtvos/content/playability.json?contentId=demo"), true);
  assert.equal(pattern.test("https://www.paramountplus.com/apps-api/v3.0/appletvtvos/video/streams/history.json"), false);
  assert.equal(pattern.test("https://www.paramountplus.com/apps-api/v3.3/appletvtvos/irdeto-control/session-token.json?contentId=demo"), true);
  assert.equal(pattern.test("https://www.paramountplus.com/apps-api/v2.0/iphone/auth/login.json"), false);
  assert.equal(pattern.test("https://www.paramountplus.com/apps-api/v3.0/iphone/account/profile.json"), false);
  assert.equal(pattern.test("https://auth.paramountplus.com/login"), false);
  assert.equal(pattern.test("https://api.paramountplus.com/graphql"), false);
});

test("Shadowrocket Gateway GET routes do not require a request body", () => {
  const content = fs.readFileSync(path.join(root, "modules", "GeneralStreamSubtitle.module"), "utf8");
  const getLine = content.split("\n").find((line) => line.startsWith("GSS Gateway ="));
  const saveLine = content.split("\n").find((line) => line.startsWith("GSS Gateway Save ="));
  const patternOf = (line) => new RegExp(line.slice(line.indexOf("pattern=") + 8, line.indexOf(", requires-body=")));
  const getPattern = patternOf(getLine);
  const savePattern = patternOf(saveLine);
  assert.match(getLine, /requires-body=0/);
  assert.match(saveLine, /requires-body=1/);
  assert.equal(getPattern.test("http://gss.local/"), true);
  assert.equal(getPattern.test("http://gss.local/health"), true);
  assert.equal(getPattern.test("https://example.com/"), true);
  assert.equal(getPattern.test("https://example.com/health"), true);
  assert.equal(getPattern.test("https://vod.pplus.paramount.tech/__gss__/manifest?origin=https%3A%2F%2Fvod.pplus.paramount.tech%2Fshow%2Fmaster.m3u8"), true);
  assert.equal(getPattern.test("https://vod.pplus.paramount.tech/__gss__/playlist?origin=https%3A%2F%2Fvod.pplus.paramount.tech%2Fshow%2Fstream_vtt.m3u8"), true);
  assert.equal(getPattern.test("https://vod.pplus.paramount.tech/__gss__/subtitle?origin=https%3A%2F%2Fvod.pplus.paramount.tech%2Fshow%2F1.vtt"), true);
  assert.equal(getPattern.test("https://vod.pplus.paramount.tech/show/master.m3u8"), false);
  assert.equal(getPattern.test("http://gss.local/subtitle?origin=https%3A%2F%2Fexample.com%2Fa.vtt"), true);
  assert.equal(getPattern.test("http://gss.local/save"), false);
  assert.equal(savePattern.test("http://gss.local/save"), true);
  assert.equal(savePattern.test("https://example.com/save"), true);
  assert.equal(savePattern.test("http://gss.local/health"), false);
});

test("generated rules match media manifests and bypass account, session, GraphQL and DRM URLs", () => {
  const content = fs.readFileSync(path.join(root, "modules", "GeneralStreamSubtitle.plugin"), "utf8");
  const generalLine = content.split("\n").find((line) => line.includes("tag=GSS Manifest,"));
  const warnerLine = content.split("\n").find((line) => line.includes("tag=GSS Max Discovery Media,"));
  const primeLine = content.split("\n").find((line) => line.includes("tag=GSS Prime Video HLS,"));
  const primeDashLine = content.split("\n").find((line) => line.includes("tag=GSS Prime Video DASH,"));
  const huluLine = content.split("\n").find((line) => line.includes("tag=GSS Hulu HLS,"));
  const plutoLine = content.split("\n").find((line) => line.includes("tag=GSS Pluto HLS,"));
  const patternOf = (line) => new RegExp(line.slice("http-response ".length, line.indexOf(" script-path=")));
  const general = new RegExp(generalLine.slice("http-response ".length, generalLine.indexOf(" script-path=")));
  const warner = patternOf(warnerLine);
  const prime = patternOf(primeLine);
  const primeDash = patternOf(primeDashLine);
  const hulu = patternOf(huluLine);
  const pluto = patternOf(plutoLine);
  const maxUrl = "https://api.discomax.com/playback/session";
  const opaqueMaxUrl = "https://default.any-any.prd.api.max.com/any/7f4d1b2a";
  const graphQlMaxUrl = "https://default.any-any.prd.api.max.com/graphql";
  const maxMediaUrl = "https://cf.prod.media.max.com/video/master.m3u8?token=x";
  const discoveryUrl = "https://content-ause1-ur-discovery1.uplynk.com/asset/master.m3u8?token=x";
  const discoveryDeviceUrl = "https://auth.discoveryplus.com/device/register";
  const discoveryAccountUrl = "https://api.discoveryplus.com/account/profile";
  const discoveryApiUrl = "https://eu1-prod.disco-api.com/graphql";
  assert.equal(general.test(maxUrl), false);
  assert.equal(general.test(discoveryUrl), false);
  assert.equal(warner.test(maxUrl), false);
  assert.equal(warner.test(opaqueMaxUrl), false);
  assert.equal(warner.test(graphQlMaxUrl), false);
  assert.equal(warner.test(maxMediaUrl), true);
  assert.equal(warner.test(discoveryUrl), true);
  assert.equal(warner.test(discoveryDeviceUrl), false);
  assert.equal(warner.test(discoveryAccountUrl), false);
  assert.equal(warner.test(discoveryApiUrl), false);
  assert.equal(prime.test("https://a.hls.pv-cdn.net/title/master.m3u8?token=x"), true);
  assert.equal(prime.test("https://atv-ps.amazon.com/cdp/catalog/GetPlaybackResources"), false);
  assert.equal(primeDash.test("https://a.dash.row.aiv-cdn.net/title/manifest.mpd?token=x"), true);
  assert.equal(primeDash.test("https://a.dash.row.aiv-cdn.net/title/video.m4s"), false);
  assert.equal(hulu.test("https://livemanifest-f.hulustream.com/live/master.m3u8"), true);
  assert.equal(hulu.test("https://assets.huluim.com/captions/master.m3u8"), true);
  assert.equal(hulu.test("https://auth.hulu.com/login"), false);
  assert.equal(pluto.test("https://service-stitcher.clusters.pluto.tv/v1/stitch/embed/hls/channel/demo/master.m3u8"), true);
  assert.equal(pluto.test("https://service-stitcher.clusters.pluto.tv/v1/stitch/embed/hls/channel/demo/subtitles/en.m3u8"), true);
  assert.equal(pluto.test("https://cdn.plutotv.net/channel/demo/playlist.m3u8"), true);
  assert.equal(pluto.test("https://api.pluto.tv/v2/session"), false);
});

test("generated module runtime URLs use immutable package-version paths", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  for (const filename of ["GeneralStreamSubtitle.module", "GeneralStreamSubtitle.plugin", "GeneralStreamSubtitle.sgmodule"]) {
    const content = fs.readFileSync(path.join(root, "modules", filename), "utf8");
    for (const bundle of ["manifest", "gateway", "youtube", "youtube-caption"]) {
      if (!content.includes(`/${bundle}.js`)) continue;
      const escapedVersion = pkg.version.replace(/\./g, "\\.");
      assert.match(content, new RegExp(`/dist/v${escapedVersion}/${bundle}\\.js`));
    }
  }
});

test("all supported non-Max HLS platforms use the identity-preserving path", () => {
  const hls = fs.readFileSync(path.join(root, "tests/fixtures/master.m3u8"), "utf8");
  const cases = [
    ["apple-fitness", "https://play.itunes.apple.com/WebObjects/MZPlay.woa/hls/workout/master.m3u8"],
    ["apple-tv-plus", "https://play-edge.itunes.apple.com/WebObjects/MZPlay.woa/hls/subscription/master.m3u8"],
    ["apple-tv", "https://hls.itunes.apple.com/WebObjects/MZPlay.woa/hls/library/master.m3u8"],
    ["discovery", "https://content-ause1-ur-discovery1.uplynk.com/asset/master.m3u8"],
    ["disney", "https://prod-us-west-2.media.dssott.com/ps01/disney/title/master.m3u8"],
    ["prime", "https://a.hls.pv-cdn.net/title/master.m3u8"],
    ["hulu", "https://vodmanifest.hulustream.com/title/master.m3u8"],
    ["paramount", "https://vod.cbsaavideo.com/library/show/master.m3u8"],
    ["paramount-live", "https://live.cbsaavideo.com/channel/cbs-news/master.m3u8"],
    ["peacock", "https://east.cdn.peacocktv.com/pub/global/title/master_cmaf.m3u8"],
    ["fubo", "https://east-vod.fubo.tv/title/manifests/master.m3u8"],
    ["ted", "https://hls.ted.com/talks/demo/manifest.m3u8"],
    ["bbc", "https://vod-hls-uk.live.cf.md.bbci.co.uk/title_hls_master.m3u8"],
    ["viki", "https://manifest-viki.viki.io/show/master.m3u8"],
    ["tubi", "https://cdn.tubi.video/title/master.m3u8"],
    ["pluto", "https://service-stitcher.clusters.pluto.tv/v1/stitch/embed/hls/channel/demo/master.m3u8"],
    ["crunchyroll", "https://media.crunchyroll.com/title/master.m3u8"],
    ["dazn", "https://live.dazn.com/title/master.m3u8"],
    ["plex", "https://demo.plex.direct/video/:/transcode/universal/master.m3u8"]
  ];
  for (const [platform, url] of cases) {
    const { persistent } = storeRuntime(); let result;
    run("dist/manifest.js", {
      $request: { url, headers: {} },
      $response: { body: hls, headers: { "Content-Type": "application/vnd.apple.mpegurl" } },
      $persistentStore: persistent,
      $done(p) { result = p; }
    });
    assert.ok(result.body, `${platform} did not rewrite the master manifest`);
    assert.equal((result.body.match(/TYPE=SUBTITLES/g) || []).length, 1, `${platform} duplicated the source rendition`);
    assert.match(result.body, /NAME="English"/, `${platform} changed the source identity`);
    assert.doesNotMatch(result.body, /NAME="Translate-zh"/, `${platform} created an unstable synthetic rendition`);
    const decoded = decodeURIComponent(result.body);
    assert.match(decoded, new RegExp(`platform=${platform}`));
    assert.match(decoded, /strategy=replace-source/);
  }
});

test("build publishes a uniquely named Shadowrocket module and versioned bundles", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const moduleName = `GeneralStreamSubtitle-v${pkg.version}.module`;
  const content = fs.readFileSync(path.join(root, "modules", moduleName), "utf8");
  assert.match(content, new RegExp(`^#!name=General Stream Subtitle v${pkg.version.replace(/\./g, "\\.")}`, "m"));
  assert.match(content, /PARAMOUNT:true/);
  assert.match(content, /OTHER:true/);
  for (const bundle of ["manifest", "gateway", "youtube", "youtube-caption"]) {
    const bundlePath = path.join(root, "dist", `v${pkg.version}`, `${bundle}.js`);
    assert.equal(fs.existsSync(bundlePath), true);
    assert.match(fs.readFileSync(bundlePath, "utf8"), new RegExp(`General Stream Subtitle ${pkg.version.replace(/\./g, "\\.")}`));
  }
});
