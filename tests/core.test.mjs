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
  assert.match(output,/https:\/\/example\.com\/playlist\?origin=/);
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

test("detects modern Discovery+ CDNs before the shared Max CDN", () => {
  const { GSS } = load(core);
  assert.equal(GSS.Platforms.detect("https://content-ause1-ur-discovery1.uplynk.com/asset/master.m3u8").id,"discovery");
  assert.equal(GSS.Platforms.detect("https://dplus-northamerica.media-edge.prod-vod.h264.io/asset/manifest.mpd").id,"discovery");
  assert.equal(GSS.Platforms.detect("https://dplus-ph-prod-vod.akamaized.net/asset/master.m3u8").id,"discovery");
  assert.equal(GSS.Platforms.detect("https://api.discomax.com/playback/session").id,"max");
  assert.equal(GSS.Platforms.detect("https://cf.prod.media.h264.io/title/master.m3u8").id,"max");
});

test("gives injected Apple subtitle tracks a unique stable rendition id", () => {
  const { GSS } = load(core);
  const body = [
    "#EXTM3U",
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,STABLE-RENDITION-ID="com.apple.subtitle.en",URI="subs/en.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=1000000,SUBTITLES="subs"',
    "video/main.m3u8"
  ].join("\n");
  const output = GSS.M3U8.injectTracks(body,"https://play.itunes.apple.com/WebObjects/MZPlay.woa/hls/workout/master.m3u8",GSS.DEFAULTS,{info(){}},{id:"apple-fitness"});
  const ids = [...output.matchAll(/STABLE-RENDITION-ID="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length,2);
  assert.notEqual(ids[0],ids[1]);
  assert.match(ids[1],/^gss-[0-9a-f]+$/);
});

test("keeps an explicit Apple-compatible Max rendition stable across CDN refreshes", () => {
  const { GSS } = load(core);
  const body = [
    "#EXTM3U",
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,STABLE-RENDITION-ID="subtitle.en",URI="subs/en.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=1000000,SUBTITLES="subs"',
    "video/main.m3u8"
  ].join("\n");
  const urls = [
    "https://gcp.prd.media.h264.io/title/hls.m3u8",
    "https://akm.prd.media.h264.io/title/hls.m3u8",
    "https://cf.prd.media.h264.io/title/hls.m3u8"
  ];
  const ids = urls.map((url) => {
    const output = GSS.M3U8.injectTracks(body, url, GSS.DEFAULTS, {info(){}}, {id:"max"});
    const lines = output.split("\n").filter((line) => /NAME="Translate-zh"/.test(line));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /LANGUAGE="zh-Hans"/);
    assert.match(lines[0], /AUTOSELECT=NO/);
    return lines[0].match(/STABLE-RENDITION-ID="([^"]+)"/)[1];
  });
  assert.equal(new Set(ids).size, 1);
});

test("removes source-only association metadata from a translated Max rendition", () => {
  const { GSS } = load(core);
  const body = [
    "#EXTM3U",
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English CC",LANGUAGE="en",ASSOC-LANGUAGE="en",CHARACTERISTICS="public.accessibility.transcribes-spoken-dialog",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,URI="subs/en.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=1000000,SUBTITLES="subs"',
    "video/main.m3u8"
  ].join("\n");
  const output = GSS.M3U8.injectTracks(body,"https://gcp.prd.media.h264.io/title/hls.m3u8",GSS.DEFAULTS,{info(){}},{id:"max"});
  const translated = output.split("\n").find((line) => /NAME="Translate-zh"/.test(line));
  assert.match(translated,/LANGUAGE="zh-Hans"/);
  assert.match(translated,/AUTOSELECT=NO/);
  assert.doesNotMatch(translated,/ASSOC-LANGUAGE/);
  assert.doesNotMatch(translated,/CHARACTERISTICS/);
  const details = GSS.M3U8.inspectTrackTypes(output.split("\n"));
  assert.equal(details.outputSubtitles,undefined);
  assert.equal(details.renditions[1].language,"zh-Hans");
  assert.equal(details.renditions[1].autoselect,"NO");
});

test("replaces the trusted Max source URI without changing its rendition identity", () => {
  const { GSS } = load(core);
  const body = [
    "#EXTM3U",
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="vtt",NAME="en-US CC",LANGUAGE="en-US",DEFAULT=NO,AUTOSELECT=YES,CHARACTERISTICS="public.accessibility.transcribes-spoken-dialog",URI="captions/en.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=1000000,SUBTITLES="vtt"',
    "video/main.m3u8"
  ].join("\n");
  const config = { ...GSS.DEFAULTS, maxReplaceSource:true };
  const output = GSS.M3U8.injectTracks(body,"https://gcp.prd.media.h264.io/title/hls.m3u8",config,{info(){}},{id:"max"});
  assert.equal((output.match(/TYPE=SUBTITLES/g)||[]).length,1);
  assert.match(output,/NAME="en-US CC"/);
  assert.match(output,/LANGUAGE="en-US"/);
  assert.match(output,/AUTOSELECT=YES/);
  assert.match(output,/CHARACTERISTICS="public\.accessibility\.transcribes-spoken-dialog"/);
  assert.doesNotMatch(output,/Translate-zh/);
  assert.match(decodeURIComponent(output),/strategy=replace-source/);
  const details = GSS.M3U8.inspectTrackTypes(output.split("\n"));
  assert.equal(details.subtitles,1);
  assert.equal(details.virtualSubtitleUris,1);
  assert.equal(details.renditions[0].virtual,true);
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
  assert.equal((output.match(/https:\/\/example\.com\/subtitle/g)||[]).length,2);
  assert.match(decodeURIComponent(output),/segment-001\.vtt\?token=abc/);
  assert.match(decodeURIComponent(output),/\/subs\/segments\/segment-002\.vtt\?token=def/);
  assert.match(decodeURIComponent(output),/platform=max/);
});

test("turns Max byte-range WebVTT objects into standalone virtual segments", () => {
  const { GSS } = load(core);
  const body = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    '#EXT-X-MAP:URI="1.vtt",BYTERANGE="8@0"',
    "#EXTINF:13.0,",
    "#EXT-X-BYTERANGE:496@8",
    "1.vtt",
    "#EXT-X-ENDLIST"
  ].join("\n");
  const output = GSS.M3U8.decorateSubtitlePlaylist(body,"https://cdn.max.com/subs/hlsMedia.m3u8","bilingual","en","zh-CN",GSS.DEFAULTS,{info(){}},"max");
  assert.doesNotMatch(output,/#EXT-X-MAP/);
  assert.doesNotMatch(output,/#EXT-X-BYTERANGE/);
  assert.match(output,/https:\/\/example\.com\/subtitle\?/);
  assert.match(decodeURIComponent(output),/origin=https:\/\/cdn\.max\.com\/subs\/1\.vtt/);
  assert.match(decodeURIComponent(output),/full=1/);
});
