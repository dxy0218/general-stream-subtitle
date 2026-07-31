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

function persistentStore(initial = []) {
  const store = new Map(initial);
  return {
    store,
    persistent: {
      read(key) { return store.get(key) || null; },
      write(value, key) { store.set(key, value); return true; }
    }
  };
}

test("diagnostics removes signed queries, credentials and secret-looking values", () => {
  const { store, persistent } = persistentStore();
  const context = vm.createContext({ console, Date, Math, $request: { url: "", headers: {} }, $persistentStore: persistent });
  const files = ["src/shared/runtime.js", "src/shared/url.js", "src/shared/diagnostics.js"];
  const GSS = vm.runInContext(`var GSS={};\n${files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n")}\nGSS;`, context);
  const event = {
    scope: "gateway",
    platform: "prime",
    type: "upstream-error",
    level: "error",
    status: "failed",
    url: "https://cdn.example.com/sub/file.vtt?token=secret-query&Policy=private-policy",
    message: "GET https://cdn.example.com/sub/file.vtt?Signature=hidden Authorization: Bearer bearer-secret Cookie=session-secret api_key=key-secret",
    details: { authorization: "Bearer do-not-store", nested: { endpoint: "https://api.example.com/path?x-amz-signature=aws-secret", password: "never" } }
  };
  GSS.Diagnostics.record(event);
  GSS.Diagnostics.record(event);
  const raw = store.get("GSS_DIAGNOSTICS_V1");
  const rows = JSON.parse(raw);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].url, "https://cdn.example.com/sub/file.vtt");
  assert.equal(rows[0].details.authorization, undefined);
  assert.equal(rows[0].details.nested.password, undefined);
  assert.doesNotMatch(raw, /secret-query|private-policy|hidden|bearer-secret|session-secret|key-secret|do-not-store|aws-secret|never/);
  assert.match(raw, /REDACTED/);
});

test("console logger also redacts credentials and signed URL queries", () => {
  const messages = [];
  const { persistent } = persistentStore();
  const context = vm.createContext({ console: { log(value) { messages.push(String(value)); } }, Date, Math, $request: { url: "", headers: {} }, $persistentStore: persistent });
  const files = ["src/shared/runtime.js", "src/shared/url.js", "src/shared/diagnostics.js", "src/shared/logger.js"];
  const GSS = vm.runInContext(`var GSS={VERSION:"test"};\n${files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n")}\nGSS;`, context);
  const logger = GSS.Logger({ logEnabled: true, debug: true }, "test");
  logger.error("request failed token=message-secret", { authorization: "Bearer auth-secret", endpoint: "https://api.example.com/path?signature=url-secret" });
  const output = messages.join("\n");
  assert.doesNotMatch(output, /message-secret|auth-secret|url-secret/);
  assert.match(output, /REDACTED/);
});

test("manifest logging is enabled by default and can be disabled explicitly", () => {
  const master = fs.readFileSync(path.join(root, "tests/fixtures/master.m3u8"), "utf8");
  const first = persistentStore();
  let result;
  run("dist/manifest.js", {
    $request: { url: "https://cf.prod.media.max.com/title/master.m3u8?token=private", headers: {} },
    $response: { body: master, headers: { "Content-Type": "application/vnd.apple.mpegurl" } },
    $persistentStore: first.persistent,
    $done(payload) { result = payload; }
  });
  assert.match(result.body, /Translate-zh/);
  const rows = JSON.parse(first.store.get("GSS_DIAGNOSTICS_V1"));
  assert.equal(rows.some((row) => row.type === "hls-master" && row.status === "rewritten" && row.platform === "max"), true);
  assert.doesNotMatch(JSON.stringify(rows), /private/);

  const second = persistentStore();
  run("dist/manifest.js", {
    $request: { url: "https://cf.prod.media.max.com/title/master.m3u8", headers: {} },
    $response: { body: master, headers: {} },
    $argument: "logEnabled=false",
    $persistentStore: second.persistent,
    $done() {}
  });
  assert.equal(second.store.has("GSS_DIAGNOSTICS_V1"), false);
});

test("gss.local logs page renders summaries, escaped details and copy/export controls", () => {
  const records = [{
    time: "2026-07-31T10:00:00.000Z",
    runtime: "Shadowrocket",
    requestId: "demo",
    scope: "manifest",
    platform: "discovery",
    type: "safe-playback-bypass",
    level: "warn",
    status: "bypassed",
    url: "https://media.example.com/master.m3u8",
    message: "<script>alert(1)</script>",
    count: 1
  }];
  const { store, persistent } = persistentStore([
    ["GSS_ADMIN_TOKEN_V1", "admin-token"],
    ["GSS_DIAGNOSTICS_V1", JSON.stringify(records)]
  ]);
  let result;
  run("dist/gateway.js", {
    $request: { url: "http://gss.local/logs", method: "GET", headers: {} },
    $persistentStore: persistent,
    $done(payload) { result = payload; }
  });
  assert.equal(result.response.status, 200);
  assert.match(result.response.headers["Content-Type"], /text\/html/);
  assert.match(result.response.body, /GSS 运行日志/);
  assert.match(result.response.body, /复制全部日志/);
  assert.match(result.response.body, /logs\.json/);
  assert.match(result.response.body, /safe-playback-bypass/);
  assert.match(result.response.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(result.response.body, /<script>alert\(1\)<\/script>/);
  assert.equal(store.get("GSS_ADMIN_TOKEN_V1"), "admin-token");
});

test("gateway records upstream, translation and fallback stages without signed URL queries", () => {
  const vtt = fs.readFileSync(path.join(root, "tests/fixtures/sample.vtt"), "utf8");
  const { store, persistent } = persistentStore();
  const origin = "https://service-stitcher.clusters.pluto.tv/subtitle/en/segment.vtt?token=signed-secret";
  let result;
  run("dist/gateway.js", {
    $request: { url: "https://gss.local/subtitle?origin=" + encodeURIComponent(origin) + "&mode=bilingual&source=en&target=zh-CN&platform=pluto", headers: {} },
    $httpClient: {
      get(options, callback) {
        if (options.url === origin) callback(null, { status: 200, headers: { "Content-Type": "text/vtt" } }, vtt);
        else callback(new Error("provider token=provider-secret unavailable"));
      }
    },
    $persistentStore: persistent,
    $done(payload) { result = payload; }
  });
  assert.equal(result.response.body, vtt);
  const raw = store.get("GSS_DIAGNOSTICS_V1");
  const rows = JSON.parse(raw);
  const types = rows.map((row) => row.type);
  assert.equal(types.includes("subtitle-request"), true);
  assert.equal(types.includes("upstream-response"), true);
  assert.equal(types.includes("original-subtitle-fallback"), true);
  assert.doesNotMatch(raw, /signed-secret|provider-secret/);
});
