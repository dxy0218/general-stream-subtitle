import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildExternalInventory, dashboardHtml, decodeSubtitle, looksChinese, matchesAsrInclude, outputPathFor, parseSrt, pickEmbeddedTextStream, processSrt, renderSrt, requestGoogle, scanOnce, startStatusServer, updateFailureLedger } from "../nas-companion/index.mjs";

const SAMPLE = "1\n00:00:01,000 --> 00:00:02,000\nNAS upload smoke OK\n";

test("parses and renders bilingual SRT without changing timing", () => {
  const cues = parseSrt(SAMPLE);
  assert.equal(cues[0].text, "NAS upload smoke OK");
  assert.equal(renderSrt(cues, ["NAS 上传验证通过"]), "1\n00:00:01,000 --> 00:00:02,000\nNAS upload smoke OK\nNAS 上传验证通过\n");
});

test("chooses the Infuse-compatible output filename", () => {
  assert.equal(outputPathFor("Show S01E01.en.srt"), "Show S01E01.zh-CN.srt");
  assert.equal(outputPathFor("Show S01E01.srt"), "Show S01E01.zh-CN.srt");
});

test("detects an existing Chinese subtitle body", () => {
  assert.equal(looksChinese("这是一段已经存在的中文字幕内容。"), true);
  assert.equal(looksChinese("This is an existing English subtitle body."), false);
});

test("selects non-Chinese embedded text subtitles in any language", () => {
  const streams = [
    { index: 1, codec_name: "subrip", tags: { language: "zho" } },
    { index: 2, codec_name: "hdmv_pgs_subtitle", tags: { language: "jpn" } },
    { index: 3, codec_name: "subrip", tags: { language: "fra" } },
  ];
  assert.equal(pickEmbeddedTextStream(streams)?.index, 3);
  assert.equal(pickEmbeddedTextStream([{ index: 4, codec_name: "subrip", tags: { language: "zh-Hans" } }]), undefined);
});

test("auto-detects the source language for non-Chinese subtitles", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gss-nas-multilingual-"));
  const source = path.join(root, "Show S01E01.srt");
  await writeFile(source, "1\n00:00:01,000 --> 00:00:02,000\nBonjour tout le monde\n");
  let receivedSource;
  const result = await processSrt(source, { translator: async (_texts, language) => { receivedSource = language; return ["大家好"]; } });
  assert.equal(result.status, "created");
  assert.equal(receivedSource, "auto");
});

test("decodes UTF-16 subtitles before parsing", () => {
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(SAMPLE, "utf16le")]);
  assert.equal(decodeSubtitle(utf16), SAMPLE);
  assert.equal(parseSrt(decodeSubtitle(utf16))[0].text, "NAS upload smoke OK");
});

test("skips an existing UTF-16 Chinese subtitle", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gss-nas-utf16-"));
  const source = path.join(root, "Show S01E01.srt");
  const body = "1\n00:00:01,000 --> 00:00:02,000\n这是一段已经存在的中文字幕内容。\n";
  await writeFile(source, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, "utf16le")]));
  const result = await processSrt(source, { translator: async () => { throw new Error("translator must not run"); } });
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "source-looks-chinese");
});

test("translates a UTF-16 English subtitle into UTF-8", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gss-nas-utf16-"));
  const source = path.join(root, "Show S01E01.en.srt");
  await writeFile(source, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(SAMPLE, "utf16le")]));
  const result = await processSrt(source, { translator: async () => ["UTF-16 翻译正常"] });
  const output = await readFile(result.outputPath);
  assert.equal(output.includes(0), false);
  assert.match(output.toString("utf8"), /NAS upload smoke OK\nUTF-16 翻译正常/);
});

test("decodes and skips an existing GB18030 Chinese subtitle", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gss-nas-gb18030-"));
  const source = path.join(root, "Show S01E01.srt");
  const prefix = Buffer.from("1\n00:00:01,000 --> 00:00:02,000\n", "ascii");
  const chinese = Buffer.from("d6d0cec4d7d6c4bbd6d0cec4d7d6c4bb", "hex");
  await writeFile(source, Buffer.concat([prefix, chinese, Buffer.from("\n")]));
  assert.match(decodeSubtitle(await readFile(source)), /中文字幕中文字幕/);
  const result = await processSrt(source, { translator: async () => { throw new Error("translator must not run"); } });
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "source-looks-chinese");
});

test("skips ASS content mislabeled with an SRT extension", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gss-nas-format-"));
  const source = path.join(root, "Show S01E01.srt");
  await writeFile(source, "[Script Info]\nScriptType: v4.00+\n\n[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello\n");
  const result = await processSrt(source, { translator: async () => { throw new Error("translator must not run"); } });
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "unsupported-or-invalid-srt");
  await assert.rejects(readFile(result.outputPath));
});

test("falls back to the second Google compatibility endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (requested.length === 1) throw Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } });
    return { ok: true, json: async () => [[['翻译成功']]] };
  };
  try {
    assert.equal(await requestGoogle("translate me", "en", "zh-CN"), "翻译成功");
    assert.match(requested[0], /^https:\/\/translate\.googleapis\.com\//);
    assert.match(requested[1], /^https:\/\/translate\.google\.com\//);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses the authenticated private translation relay when configured", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.TRANSLATION_RELAY_URL;
  const originalToken = process.env.TRANSLATION_RELAY_TOKEN;
  let request;
  process.env.TRANSLATION_RELAY_URL = "https://relay.example.test/v1/translate";
  process.env.TRANSLATION_RELAY_TOKEN = "test-token";
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return { ok: true, json: async () => ({ translation: "中转翻译成功" }) };
  };
  try {
    assert.equal(await requestGoogle("translate me", "en", "zh-CN"), "中转翻译成功");
    assert.equal(request.url, process.env.TRANSLATION_RELAY_URL);
    assert.equal(request.options.headers.authorization, "Bearer test-token");
    assert.deepEqual(JSON.parse(request.options.body), { text: "translate me", source: "en", target: "zh-CN" });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.TRANSLATION_RELAY_URL; else process.env.TRANSLATION_RELAY_URL = originalUrl;
    if (originalToken === undefined) delete process.env.TRANSLATION_RELAY_TOKEN; else process.env.TRANSLATION_RELAY_TOKEN = originalToken;
  }
});

test("writes atomically and never overwrites generated output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gss-nas-test-"));
  const source = path.join(root, "Show S01E01.en.srt");
  await writeFile(source, SAMPLE);
  const translator = async () => ["第一次"];
  const first = await processSrt(source, { translator });
  assert.equal(first.status, "created");
  assert.match(await readFile(first.outputPath, "utf8"), /第一次/);
  const second = await processSrt(source, { translator: async () => ["不应写入"] });
  assert.equal(second.status, "skipped");
  assert.doesNotMatch(await readFile(first.outputPath, "utf8"), /不应写入/);
});

test("scan is restricted to its supplied root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gss-nas-scan-"));
  await writeFile(path.join(root, "Example.srt"), SAMPLE);
  const results = await scanOnce(root, { translator: async () => ["示例"] });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "created");
});

test("pilot limit caps newly created outputs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gss-nas-limit-"));
  await writeFile(path.join(root, "One.srt"), SAMPLE);
  await writeFile(path.join(root, "Two.srt"), SAMPLE);
  const results = await scanOnce(root, { translator: async () => ["示例"], maxNewOutputs: 1 });
  assert.equal(results.filter((result) => result.status === "created").length, 1);
});

test("ASR include pattern only matches an explicitly allowed episode", () => {
  const pattern = /Show[ .]S01E02/i;
  assert.equal(matchesAsrInclude("/media/Show S01E02.mkv", pattern), true);
  assert.equal(matchesAsrInclude("/media/Show S01E03.mkv", pattern), false);
  assert.equal(matchesAsrInclude("/media/Show S01E02.mkv", null), false);
});

test("speech recognition fallback creates a bilingual subtitle beside an allowlisted video", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gss-nas-asr-"));
  const video = path.join(root, "Show S01E02.mkv");
  await writeFile(video, "fake video");
  let transcribed = 0;
  const results = await scanOnce(root, {
    asrEnabled: true,
    asrIncludePattern: /S01E02/,
    maxAsrPerScan: 1,
    embeddedExtractor: async () => ({ extractedPath: null, hasTextStream: false }),
    transcriber: async (videoPath) => {
      transcribed += 1;
      const transcript = `${videoPath}.test-transcript.srt`;
      await writeFile(transcript, SAMPLE);
      return transcript;
    },
    translator: async () => ["语音识别翻译成功"]
  });
  assert.equal(transcribed, 1);
  assert.equal(results[0].status, "created");
  assert.equal(results[0].sourcePath, video);
  assert.equal(results[0].transcription, true);
  assert.match(await readFile(path.join(root, "Show S01E02.zh-CN.srt"), "utf8"), /NAS upload smoke OK\n语音识别翻译成功/);
});

test("speech recognition never runs outside the include pattern or when a text track exists", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gss-nas-asr-guard-"));
  await writeFile(path.join(root, "Show S01E03.mkv"), "fake video");
  const transcriber = async () => { throw new Error("ASR must not run"); };
  assert.deepEqual(await scanOnce(root, {
    asrEnabled: true,
    asrIncludePattern: /S01E02/,
    maxAsrPerScan: 1,
    embeddedExtractor: async () => ({ extractedPath: null, hasTextStream: false }),
    transcriber
  }), []);
  assert.deepEqual(await scanOnce(root, {
    asrEnabled: true,
    asrIncludePattern: /S01E03/,
    maxAsrPerScan: 1,
    embeddedExtractor: async () => ({ extractedPath: null, hasTextStream: true }),
    transcriber
  }), []);
});

test("ASR allowlist is prioritized ahead of the normal embedded-probe limit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gss-nas-asr-priority-"));
  for (let index = 0; index < 25; index++) await writeFile(path.join(root, `A${String(index).padStart(2, "0")}.mkv`), "fake video");
  const target = path.join(root, "Gunsmoke S07E01.mp4");
  await writeFile(target, "fake video");
  const probed = [];
  const results = await scanOnce(root, {
    asrEnabled: true,
    asrIncludePattern: /Gunsmoke S07E01[.]mp4$/,
    maxAsrPerScan: 1,
    maxEmbeddedProbes: 1,
    embeddedExtractor: async (videoPath) => { probed.push(videoPath); return { extractedPath: null, hasTextStream: false }; },
    transcriber: async (videoPath) => {
      const transcript = `${videoPath}.test-transcript.srt`;
      await writeFile(transcript, SAMPLE);
      return transcript;
    },
    translator: async () => ["荒野镖客语音识别成功"]
  });
  assert.deepEqual(probed, [target]);
  assert.equal(results[0].status, "created");
  assert.match(await readFile(path.join(root, "Gunsmoke S07E01.zh-CN.srt"), "utf8"), /荒野镖客语音识别成功/);
});

test("Chinese speech recognition output is written directly without redundant translation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gss-nas-asr-chinese-"));
  const video = path.join(root, "Chinese Show S01E01.mkv");
  await writeFile(video, "fake video");
  const results = await scanOnce(root, {
    asrEnabled: true,
    asrIncludePattern: /Chinese Show/,
    maxAsrPerScan: 1,
    embeddedExtractor: async () => ({ extractedPath: null, hasTextStream: false }),
    transcriber: async (videoPath) => {
      const transcript = `${videoPath}.test-transcript.srt`;
      await writeFile(transcript, "1\n00:00:01,000 --> 00:00:02,000\n这是一段由语音识别生成的中文字幕内容。\n");
      return transcript;
    },
    translator: async () => { throw new Error("Chinese ASR must not be translated again"); }
  });
  assert.equal(results[0].status, "created");
  assert.equal(results[0].translated, false);
  assert.match(await readFile(path.join(root, "Chinese Show S01E01.zh-CN.srt"), "utf8"), /语音识别生成/);
});

test("builds a safe external subtitle progress inventory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gss-nas-inventory-"));
  const completed = path.join(root, "Complete.srt");
  const pending = path.join(root, "Pending.srt");
  const chinese = path.join(root, "Chinese.srt");
  const invalid = path.join(root, "Invalid.srt");
  await writeFile(completed, SAMPLE);
  await writeFile(outputPathFor(completed), "already translated");
  await writeFile(pending, SAMPLE);
  await writeFile(chinese, "1\n00:00:01,000 --> 00:00:02,000\n这是一段已经存在的中文字幕内容。\n");
  await writeFile(invalid, "not an srt");
  assert.deepEqual(await buildExternalInventory([completed, pending, chinese, invalid]), {
    total: 2, completed: 1, pending: 1, skippedChinese: 1, invalid: 1
  });
});

test("renders a dashboard without embedding subtitle content", () => {
  const html = dashboardHtml();
  assert.match(html, /字幕翻译进度/);
  assert.match(html, /api\/status/);
  assert.doesNotMatch(html, /TRANSLATION_RELAY_TOKEN/);
});

test("protects the dashboard and status API with Basic authentication", async () => {
  const server = startStatusServer(() => ({ created: 7 }), { host: "127.0.0.1", port: 0, username: "viewer", password: "secret" });
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const denied = await fetch(`${base}/api/status`);
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get("www-authenticate"), /^Basic /);
    const allowed = await fetch(`${base}/api/status`, { headers: { authorization: `Basic ${Buffer.from("viewer:secret").toString("base64")}` } });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { created: 7 });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("scan pauses after the translation failure limit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gss-nas-failure-limit-"));
  await writeFile(path.join(root, "One.srt"), SAMPLE);
  await writeFile(path.join(root, "Two.srt"), SAMPLE);
  await writeFile(path.join(root, "Three.srt"), SAMPLE);
  let attempts = 0;
  const results = await scanOnce(root, {
    translator: async () => { attempts += 1; throw new Error("network unavailable"); },
    maxTranslationFailures: 2
  });
  assert.equal(attempts, 2);
  assert.deepEqual(results.at(-1), { status: "paused", reason: "translation-failure-limit", failures: 2 });
});

test("persistent failure ledger defers a repeatedly failing source without blocking the queue forever", () => {
  const sourcePath = "/media/Broken.srt";
  let ledger = {};
  for (let attempt = 1; attempt <= 3; attempt++) {
    ledger = updateFailureLedger(ledger, [{ status: "failed", sourcePath, error: "bad subtitle" }], 3, `attempt-${attempt}`);
  }
  assert.deepEqual(ledger[sourcePath], { attempts: 3, lastError: "bad subtitle", lastAttemptAt: "attempt-3" });
  const skipPaths = new Set(Object.entries(ledger).filter(([, failure]) => failure.attempts >= 3).map(([path]) => path));
  assert.equal(skipPaths.has(sourcePath), true);
  assert.deepEqual(updateFailureLedger(ledger, [{ status: "created", sourcePath }], 3), {});
});
