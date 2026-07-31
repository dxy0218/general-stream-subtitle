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

test("generated modules isolate Pluto and add Paramount Live rules", () => {
  const files = ["GeneralStreamSubtitle.module", "GeneralStreamSubtitle.plugin", "GeneralStreamSubtitle.sgmodule"];
  for (const file of files) {
    const content = fs.readFileSync(path.join(root, "modules", file), "utf8");
    assert.match(content, /GSS Pluto Master/);
    assert.match(content, /GSS Paramount Live Manifest/);
    assert.match(content, /GSS Paramount Playback/);
    assert.match(content, /GSS Max Discovery Playback/);
    assert.match(content, /discomax\\\.com/);
    assert.match(content, /uplynk\\\.com/);
    const hostnameLine = content.split("\n").find((line) => line.startsWith("hostname = "));
    const hostnameHosts = hostnameLine.replace(/^hostname = (?:%APPEND% )?/, "").split(",").map((host) => host.trim());
    assert.doesNotMatch(content, /hostname = .*\*\.pluto\.tv/);
    assert.doesNotMatch(content, /hostname = .*\*\.itunes\.apple\.com/);
    assert.doesNotMatch(content, /hostname = .*\*\.tv\.apple\.com/);
    assert.equal(hostnameHosts.includes("*.uplynk.com"), false);
    assert.equal(hostnameHosts.includes("*.disco-api.com"), false);
    assert.equal(hostnameHosts.includes("*.discoveryplus.com"), false);
    assert.equal(hostnameHosts.includes("*.discoveryplus.co.uk"), false);
    assert.equal(hostnameHosts.includes("*.discoveryplus.in"), false);
    assert.equal(hostnameHosts.includes("*discovery*.uplynk.com"), true);
    assert.equal(hostnameHosts.includes("dplus-*.akamaized.net"), true);
    assert.match(content, /service-stitcher\.clusters\.pluto\.tv/);
  }
});

test("generated rules keep Max broad but restrict Discovery to media hosts", () => {
  const content = fs.readFileSync(path.join(root, "modules", "GeneralStreamSubtitle.plugin"), "utf8");
  const generalLine = content.split("\n").find((line) => line.includes("tag=GSS Manifest,"));
  const warnerLine = content.split("\n").find((line) => line.includes("tag=GSS Max Discovery Playback,"));
  const general = new RegExp(generalLine.slice("http-response ".length, generalLine.indexOf(" script-path=")));
  const warner = new RegExp(warnerLine.slice("http-response ".length, warnerLine.indexOf(" script-path=")));
  const maxUrl = "https://api.discomax.com/playback/session";
  const opaqueMaxUrl = "https://default.any-any.prd.api.max.com/any/7f4d1b2a";
  const graphQlMaxUrl = "https://default.any-any.prd.api.max.com/graphql";
  const discoveryUrl = "https://content-ause1-ur-discovery1.uplynk.com/asset/master.m3u8?token=x";
  const discoveryDeviceUrl = "https://auth.discoveryplus.com/device/register";
  const discoveryAccountUrl = "https://api.discoveryplus.com/account/profile";
  const discoveryApiUrl = "https://eu1-prod.disco-api.com/graphql";
  assert.equal(general.test(maxUrl), false);
  assert.equal(general.test(discoveryUrl), false);
  assert.equal(warner.test(maxUrl), true);
  assert.equal(warner.test(opaqueMaxUrl), true);
  assert.equal(warner.test(graphQlMaxUrl), true);
  assert.equal(warner.test(discoveryUrl), true);
  assert.equal(warner.test(discoveryDeviceUrl), false);
  assert.equal(warner.test(discoveryAccountUrl), false);
  assert.equal(warner.test(discoveryApiUrl), false);
});
