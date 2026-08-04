import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { decodeSubtitle, looksChinese, outputPathFor, parseSrt, processSrt, renderSrt, requestGoogle, scanOnce } from "../nas-companion/index.mjs";

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
