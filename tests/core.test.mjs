import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(files) {
  const store = new Map();
  const context = vm.createContext({ console, Date, Math, $persistentStore: { read(k){return store.get(k)||null;}, write(v,k){store.set(k,v);return true;} } });
  const code = `var GSS = {};\n${files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n")}; GSS;`;
  return { GSS: vm.runInContext(code, context), store };
}
const core = ["src/shared/runtime.js","src/shared/cache.js","src/shared/language.js","src/shared/config.js","src/shared/url.js","src/platforms/registry.js","src/manifest/m3u8.js"];

test("injects a visible Translate-zh bilingual track", () => {
  const { GSS } = load(core);
  const body = fs.readFileSync(path.join(root,"tests/fixtures/master.m3u8"),"utf8");
  const platform = GSS.Platforms.detect("https://cf.prod.media.max.com/title/hls.m3u8?sig=1");
  const output = GSS.M3U8.injectTracks(body,"https://cf.prod.media.max.com/title/hls.m3u8?sig=1",GSS.DEFAULTS,{info(){}},platform);
  assert.match(output,/NAME="Translate-zh"/);
  assert.match(output,/https:\/\/gss\.local\/playlist\?origin=/);
  assert.doesNotMatch(output,/Translate-zh-only/);
  assert.match(decodeURIComponent(output),/subs\/en\/playlist\.m3u8\?token=abc/);
  assert.match(decodeURIComponent(output),/source=en/);
  assert.match(decodeURIComponent(output),/platform=max/);
});

test("auto source chooses the default non-forced subtitle track", () => {
  const { GSS } = load(core);
  const body = fs.readFileSync(path.join(root,"tests/fixtures/auto-master.m3u8"),"utf8");
  const selected = GSS.M3U8.chooseSourceTrack(body.split("\n"), GSS.DEFAULTS);
  assert.equal(selected.language,"ja");
  const output = GSS.M3U8.injectTracks(body,"https://play.itunes.apple.com/WebObjects/MZPlay.woa/hls/workout/playlist.m3u8",GSS.DEFAULTS,{info(){}},{id:"apple-fitness"});
  assert.match(decodeURIComponent(output),/subs\/ja\/playlist\.m3u8\?token=ja/);
  assert.match(decodeURIComponent(output),/source=ja/);
});

test("explicit source language overrides automatic selection", () => {
  const { GSS } = load(core);
  const body = fs.readFileSync(path.join(root,"tests/fixtures/auto-master.m3u8"),"utf8");
  const config = { ...GSS.DEFAULTS, source:"en" };
  const selected = GSS.M3U8.chooseSourceTrack(body.split("\n"), config);
  assert.equal(selected.language,"en-US");
  assert.equal(selected.name,"English");
});

test("detects Apple Fitness+, Apple TV+ and Apple TV separately", () => {
  const { GSS } = load(core);
  assert.equal(GSS.Platforms.detect("https://play.itunes.apple.com/WebObjects/MZPlay.woa/hls/workout/playlist.m3u8").id,"apple-fitness");
  assert.equal(GSS.Platforms.detect("https://play-edge.itunes.apple.com/WebObjects/MZPlay.woa/hls/subscription/playlist.m3u8").id,"apple-tv-plus");
  assert.equal(GSS.Platforms.detect("https://hls.itunes.apple.com/WebObjects/MZPlay.woa/hls/playlist.m3u8").id,"apple-tv");
});

test("optionally injects a pure translated track", () => {
  const { GSS } = load(core);
  const body = fs.readFileSync(path.join(root,"tests/fixtures/master.m3u8"),"utf8");
  const config = { ...GSS.DEFAULTS, injectTranslated:true };
  const output = GSS.M3U8.injectTracks(body,"https://cf.prod.media.max.com/title/hls.m3u8",config,{info(){}},{id:"max"});
  assert.match(output,/Translate-zh-only/);
});

test("virtualizes every subtitle segment without touching signed origin URLs", () => {
  const { GSS } = load(core);
  const body = fs.readFileSync(path.join(root,"tests/fixtures/media.m3u8"),"utf8");
  const output = GSS.M3U8.decorateSubtitlePlaylist(body,"https://cdn.max.com/subs/en/playlist.m3u8?token=playlist","bilingual","en","zh-CN",GSS.DEFAULTS,{info(){}},"max");
  assert.equal((output.match(/https:\/\/gss\.local\/subtitle/g)||[]).length,2);
  assert.match(decodeURIComponent(output),/segment-001\.vtt\?token=abc/);
  assert.match(decodeURIComponent(output),/\/subs\/segments\/segment-002\.vtt\?token=def/);
  assert.match(decodeURIComponent(output),/platform=max/);
});
