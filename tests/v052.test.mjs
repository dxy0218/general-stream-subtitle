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
    $response: { body, headers: { "Content-Type": "application/json", "Content-Length": "999" } },
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
    assert.doesNotMatch(content, /hostname = .*\*\.pluto\.tv/);
    assert.match(content, /service-stitcher\.clusters\.pluto\.tv/);
  }
});
