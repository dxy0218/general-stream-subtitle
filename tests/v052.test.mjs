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
  assert.match(injected.url, /https:\/\/gss\.local\/subtitle\?/);
  assert.doesNotMatch(JSON.stringify([...store.entries()]), /private/);
  assert.equal(result.headers["Content-Length"], undefined);
  assert.equal(result.headers.ETag, undefined);
  assert.equal(result.headers.Digest, undefined);
});

test("Discovery+ playback JSON injects a virtual text track on current CDN hosts", () => {
  const body = fs.readFileSync(path.join(root, "tests/fixtures/max-playback.json"), "utf8");
  const { persistent } = storeRuntime(); let result;
  run("dist/manifest.js", {
    $request: { url: "https://content-ause1-ur-discovery1.uplynk.com/playback/session?id=demo", headers: {} },
    $response: { body, headers: { "Content-Type": "application/json" } },
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  const parsed = JSON.parse(result.body);
  assert.equal(parsed.playback.textTracks.length, 2);
  assert.match(parsed.playback.textTracks[1].url, /gss\.local\/subtitle/);
  assert.match(decodeURIComponent(parsed.playback.textTracks[1].url), /platform=discovery/);
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
  assert.match(hlsResult.body, /gss\.local\/playlist/);
  assert.deepEqual(Object.keys(jsonResult), []);
});

test("Shadowrocket preset overrides stale settings and injects all five requested HLS platforms", () => {
  const hls = fs.readFileSync(path.join(root, "tests/fixtures/master.m3u8"), "utf8");
  const { store, persistent } = storeRuntime();
  store.set("GSS_SETTINGS_V4", JSON.stringify({ platforms: "none", source: "ja", target: "en", discoveryMode: "full" }));
  const argument = "presetMode=true&safePlayback=true&platformDiscovery=true&discoveryHlsOnly=true&platformMax=true&platformPluto=true&platformPrime=true&platformHulu=true&platformYoutube=false";
  const cases = [
    ["discovery", "https://content-ause1-ur-discovery1.uplynk.com/asset/master.m3u8"],
    ["max", "https://cf.prod.media.max.com/title/master.m3u8"],
    ["pluto", "https://service-stitcher.clusters.pluto.tv/v1/stitch/embed/hls/channel/demo/master.m3u8"],
    ["prime", "https://a.hls.pv-cdn.net/title/master.m3u8"],
    ["hulu", "https://vodmanifest.hulustream.com/title/master.m3u8"]
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
    assert.match(result.body, /NAME="Translate-zh"/);
    assert.match(decodeURIComponent(result.body), new RegExp(`platform=${platform}`));
  }
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

test("Apple manifest rewrite preserves DRM and video routes while refreshing entity metadata", () => {
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
  assert.match(result.body, /NAME="Translate-zh"/);
  assert.equal(result.headers.ETag, undefined);
  assert.equal(result.headers["Content-MD5"], undefined);
});

test("Paramount+ Live TV master injects Translate-zh", () => {
  const body = fs.readFileSync(path.join(root, "tests/fixtures/paramount-live-master.m3u8"), "utf8");
  const { persistent } = storeRuntime(); let result;
  run("dist/manifest.js", {
    $request: { url: "https://live.cbsaavideo.com/channel/cbs-news/master.m3u8", headers: {} },
    $response: { body, headers: { "Content-Type": "application/vnd.apple.mpegurl" } },
    $persistentStore: persistent,
    $done(p) { result = p; }
  });
  assert.match(result.body, /NAME="Translate-zh"/);
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
    assert.match(content, /GSS Pluto Master/);
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
  }
  const shadow = fs.readFileSync(path.join(root, "modules", "GeneralStreamSubtitle.module"), "utf8");
  assert.doesNotMatch(shadow, /GSS Paramount/);
  assert.doesNotMatch(shadow, /GSS Manifest =/);
});

test("Shadowrocket exposes only native boolean switches", () => {
  const content = fs.readFileSync(path.join(root, "modules", "GeneralStreamSubtitle.module"), "utf8");
  const argumentLine = content.split("\n").find((line) => line.startsWith("#!arguments="));
  const descriptionLine = content.split("\n").find((line) => line.startsWith("#!arguments-desc="));
  const entries = argumentLine.slice("#!arguments=".length).split(",").map((entry) => entry.trim().split(":"));
  const names = entries.map(([name]) => name);
  assert.deepEqual(names, ["DISCOVERY", "DISCOVERY_HLS_ONLY", "MAX", "PLUTO", "PRIME", "HULU", "YOUTUBE", "YT_ASR", "YT_LIVE", "PURE_TRACK", "CACHE", "LOGS", "DEBUG"]);
  for (const [name, value] of entries) {
    assert.match(value, /^(?:true|false)$/);
    assert.match(descriptionLine, new RegExp(`${name}: `));
  }
  assert.match(content, /presetMode=true/);
  assert.match(content, /safePlayback/);
  assert.doesNotMatch(argumentLine, /SOURCE|TARGET|PROVIDER|PLATFORMS|FORMATS|ORDER/);
});

test("generated rules match media manifests and bypass account, session, GraphQL and DRM URLs", () => {
  const content = fs.readFileSync(path.join(root, "modules", "GeneralStreamSubtitle.plugin"), "utf8");
  const generalLine = content.split("\n").find((line) => line.includes("tag=GSS Manifest,"));
  const warnerLine = content.split("\n").find((line) => line.includes("tag=GSS Max Discovery Media,"));
  const primeLine = content.split("\n").find((line) => line.includes("tag=GSS Prime Video HLS,"));
  const huluLine = content.split("\n").find((line) => line.includes("tag=GSS Hulu HLS,"));
  const plutoLine = content.split("\n").find((line) => line.includes("tag=GSS Pluto Master,"));
  const patternOf = (line) => new RegExp(line.slice("http-response ".length, line.indexOf(" script-path=")));
  const general = new RegExp(generalLine.slice("http-response ".length, generalLine.indexOf(" script-path=")));
  const warner = patternOf(warnerLine);
  const prime = patternOf(primeLine);
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
  assert.equal(hulu.test("https://livemanifest-f.hulustream.com/live/master.m3u8"), true);
  assert.equal(hulu.test("https://auth.hulu.com/login"), false);
  assert.equal(pluto.test("https://service-stitcher.clusters.pluto.tv/v1/stitch/embed/hls/channel/demo/master.m3u8"), true);
  assert.equal(pluto.test("https://api.pluto.tv/v2/session"), false);
});
