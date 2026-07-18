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

test("Pluto live WebVTT preserves timestamp metadata and supplies Pluto origin headers", () => {
  const vtt = fs.readFileSync(path.join(root, "tests/fixtures/pluto-live.vtt"), "utf8");
  const store = new Map();
  let result;
  let upstreamHeaders;
  const origin = "https://service-stitcher.clusters.pluto.tv/stitch/hls/channel/demo/subtitle/en/segment.vtt?sid=abc";

  run("dist/gateway.js", {
    $request: {
      url: "https://gss.local/subtitle?origin=" + encodeURIComponent(origin) + "&mode=bilingual&source=en&target=zh-CN&platform=pluto",
      headers: { "User-Agent": "PlutoTV/1.0", "Origin": "https://gss.local" }
    },
    $httpClient: {
      get(options, callback) {
        if (options.url === origin) {
          upstreamHeaders = options.headers;
          callback(null, { status: 200, headers: { "Content-Type": "text/vtt" } }, vtt);
          return;
        }
        callback(null, { status: 200, headers: { "Content-Type": "application/json" } }, JSON.stringify([[['[[GSS_0000]]\n来自 Pluto 的问候。\n[[GSS_0001]]\n直播字幕继续。', '', null, null]]]));
      }
    },
    $persistentStore: {
      read(key) { return store.get(key) || null; },
      write(value, key) { store.set(key, value); return true; }
    },
    $done(payload) { result = payload; }
  });

  assert.equal(upstreamHeaders.Origin, "https://pluto.tv");
  assert.equal(upstreamHeaders.Referer, "https://pluto.tv/");
  assert.match(result.response.body, /X-TIMESTAMP-MAP=LOCAL:00:00:00\.000,MPEGTS:900000/);
  assert.match(result.response.body, /来自 Pluto 的问候。\nHello from Pluto\./);
  assert.match(result.response.body, /直播字幕继续。\nLive captions continue\./);
  assert.equal((result.response.body.match(/-->/g) || []).length, 2);
});

test("translation failure falls back to the original subtitle instead of an empty track", () => {
  const vtt = fs.readFileSync(path.join(root, "tests/fixtures/sample.vtt"), "utf8");
  const store = new Map();
  let result;
  const origin = "https://service-stitcher.clusters.pluto.tv/subtitle/en/segment.vtt";

  run("dist/gateway.js", {
    $request: {
      url: "https://gss.local/subtitle?origin=" + encodeURIComponent(origin) + "&mode=bilingual&source=en&target=zh-CN&platform=pluto",
      headers: {}
    },
    $httpClient: {
      get(options, callback) {
        if (options.url === origin) {
          callback(null, { status: 200, headers: { "Content-Type": "text/vtt" } }, vtt);
          return;
        }
        callback(new Error("provider unavailable"));
      }
    },
    $persistentStore: {
      read(key) { return store.get(key) || null; },
      write(value, key) { store.set(key, value); return true; }
    },
    $done(payload) { result = payload; }
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.response.body, vtt);
  assert.match(result.response.body, /Hello there\./);
  assert.doesNotMatch(result.response.body, /^WEBVTT\n\n$/);
});
