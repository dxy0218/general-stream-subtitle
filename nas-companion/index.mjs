import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".m4v", ".avi", ".mov", ".ts", ".webm"]);
const TEXT_SUBTITLE_CODECS = new Set(["ass", "ssa", "subrip", "srt", "text", "webvtt"]);
const SOURCE_SUFFIX = /(?:\.(?:en|eng|english))?\.srt$/i;
const GENERATED_SUFFIX = /\.(?:zh(?:-cn)?|chs|bilingual)\.(?:srt|vtt)$/i;

export function parseSrt(body) {
  return String(body).replace(/\r\n/g, "\n").trim().split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");
    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex < 0 || timeIndex === lines.length - 1) return { block, text: "" };
    return { block, lines, timeIndex, text: lines.slice(timeIndex + 1).join("\n") };
  });
}

export function renderSrt(cues, translations, mode = "bilingual") {
  return cues.map((cue, index) => {
    if (!cue.text || !translations[index]) return cue.block;
    const translated = String(translations[index]).trim();
    const replacement = mode === "translated" ? [translated] : cue.lines.slice(cue.timeIndex + 1).concat([translated]);
    return cue.lines.slice(0, cue.timeIndex + 1).concat(replacement).join("\n");
  }).join("\n\n") + "\n";
}

export function outputPathFor(sourcePath) {
  return sourcePath.replace(SOURCE_SUFFIX, ".zh-CN.srt");
}

export function looksChinese(text) {
  const value = String(text || "");
  const han = (value.match(/[\u3400-\u9fff]/g) || []).length;
  const letters = (value.match(/[\p{L}]/gu) || []).length;
  return han >= 8 && han / Math.max(letters, 1) >= 0.2;
}

export function decodeSubtitle(buffer) {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (input.length >= 2 && input[0] === 0xff && input[1] === 0xfe) {
    return input.subarray(2).toString("utf16le").replace(/^\uFEFF/, "");
  }
  if (input.length >= 2 && input[0] === 0xfe && input[1] === 0xff) {
    const body = Buffer.from(input.subarray(2, input.length - (input.length % 2)));
    body.swap16();
    return body.toString("utf16le").replace(/^\uFEFF/, "");
  }
  if (input.length >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) {
    return input.subarray(3).toString("utf8");
  }

  const sampleLength = Math.min(input.length - (input.length % 2), 4096);
  let evenNulls = 0;
  let oddNulls = 0;
  for (let index = 0; index < sampleLength; index += 2) {
    if (input[index] === 0) evenNulls += 1;
    if (input[index + 1] === 0) oddNulls += 1;
  }
  const pairs = Math.max(1, sampleLength / 2);
  if (oddNulls / pairs > 0.2 && evenNulls / pairs < 0.05) return input.toString("utf16le");
  if (evenNulls / pairs > 0.2 && oddNulls / pairs < 0.05) {
    const body = Buffer.from(input.subarray(0, input.length - (input.length % 2)));
    body.swap16();
    return body.toString("utf16le");
  }
  return input.toString("utf8").replace(/^\uFEFF/, "");
}

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function walk(root) {
  const output = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await walk(fullPath));
    else output.push(fullPath);
  }
  return output;
}

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${command} failed: ${stderr || error.message}`));
      else resolve(stdout);
    });
  });
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function requestGoogle(text, source, target) {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.search = new URLSearchParams({ client: "gtx", dt: "t", sl: source, tl: target, q: text });
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Google translation failed with HTTP ${response.status}`);
    const payload = await response.json();
    return payload[0].map((part) => part?.[0] || "").join("");
}

function makeBatches(texts, maxItems = 30, maxCharacters = 3500) {
  const batches = [];
  let current = [];
  let characters = 0;
  texts.forEach((text, index) => {
    const size = String(text).length + 24;
    if (current.length && (current.length >= maxItems || characters + size > maxCharacters)) {
      batches.push(current);
      current = [];
      characters = 0;
    }
    current.push({ index, text: String(text) });
    characters += size;
  });
  if (current.length) batches.push(current);
  return batches;
}

function parseMarkedTranslation(text, batch) {
  const result = new Map();
  const regex = /\[\[GSS_(\d{4})\]\]\s*([\s\S]*?)(?=\[\[GSS_\d{4}\]\]|$)/g;
  let match;
  while ((match = regex.exec(text))) result.set(Number(match[1]), match[2].trim());
  return batch.every((item) => result.has(item.index)) ? batch.map((item) => result.get(item.index)) : null;
}

export async function translateGoogle(texts, source = "en", target = "zh-CN") {
  const translations = new Array(texts.length).fill("");
  for (const batch of makeBatches(texts)) {
    const nonEmpty = batch.filter((item) => item.text.trim());
    if (!nonEmpty.length) continue;
    const marked = nonEmpty.map((item) => `[[GSS_${String(item.index).padStart(4, "0")}]]\n${item.text}`).join("\n");
    const translated = await requestGoogle(marked, source, target);
    const parsed = parseMarkedTranslation(translated, nonEmpty);
    if (parsed) nonEmpty.forEach((item, index) => { translations[item.index] = parsed[index]; });
    else {
      for (const item of nonEmpty) {
        translations[item.index] = await requestGoogle(item.text, source, target);
        await delay(350);
      }
    }
    await delay(750);
  }
  return translations;
}

export async function processSrt(sourcePath, options = {}) {
  const outputPath = options.outputPath || outputPathFor(sourcePath);
  if (outputPath === sourcePath || await exists(outputPath)) return { status: "skipped", sourcePath, outputPath };
  const cues = parseSrt(decodeSubtitle(await fs.readFile(sourcePath)));
  if (looksChinese(cues.map((cue) => cue.text).join("\n"))) return { status: "skipped", reason: "source-looks-chinese", sourcePath, outputPath };
  const translator = options.translator || translateGoogle;
  const translations = await translator(cues.map((cue) => cue.text), options.sourceLanguage || "en", options.targetLanguage || "zh-CN");
  const rendered = renderSrt(cues, translations, options.mode || "bilingual");
  const temporaryPath = `${outputPath}.gss-tmp-${process.pid}`;
  await fs.writeFile(temporaryPath, rendered, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, outputPath);
  return { status: "created", sourcePath, outputPath };
}

async function extractEmbeddedSubtitle(videoPath) {
  const raw = await execFileAsync("ffprobe", ["-v", "error", "-select_streams", "s", "-show_entries", "stream=index,codec_name:stream_tags=language", "-of", "json", videoPath]);
  const streams = JSON.parse(raw).streams || [];
  const stream = streams.find((item) => TEXT_SUBTITLE_CODECS.has(item.codec_name) && ["en", "eng", "english", undefined].includes(item.tags?.language));
  if (!stream) return null;
  const extractedPath = `${videoPath}.gss-extracted-${process.pid}.srt`;
  await execFileAsync("ffmpeg", ["-v", "error", "-y", "-i", videoPath, "-map", `0:${stream.index}`, extractedPath]);
  return extractedPath;
}

export async function scanOnce(root, options = {}) {
  const files = await walk(root);
  const results = [];
  const videos = files.filter((file) => VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const videoStems = new Set(videos.map((file) => file.slice(0, -path.extname(file).length)));
  const sources = files
    .filter((file) => SOURCE_SUFFIX.test(file) && !GENERATED_SUFFIX.test(file))
    .filter((file) => !options.requireVideoMatch || videoStems.has(file.replace(SOURCE_SUFFIX, "")))
    .sort((left, right) => Number(!/\.(?:en|eng|english)\.srt$/i.test(left)) - Number(!/\.(?:en|eng|english)\.srt$/i.test(right)) || left.localeCompare(right));
  let remaining = Number.isFinite(options.maxNewOutputs) ? Math.max(0, options.maxNewOutputs) : Infinity;
  for (const sourcePath of sources) {
    if (remaining <= 0) break;
    try {
      const result = await processSrt(sourcePath, options);
      results.push(result);
      if (result.status === "created") remaining -= 1;
    } catch (error) {
      results.push({ status: "failed", sourcePath, error: error.message });
    }
  }

  let embeddedProbes = 0;
  const maxEmbeddedProbes = Math.max(0, Number(options.maxEmbeddedProbes ?? 20));
  for (const videoPath of videos) {
    if (remaining <= 0 || embeddedProbes >= maxEmbeddedProbes) break;
    const outputPath = videoPath.replace(path.extname(videoPath), ".zh-CN.srt");
    if (await exists(outputPath)) continue;
    const base = videoPath.slice(0, -path.extname(videoPath).length);
    if (sources.some((source) => source.replace(SOURCE_SUFFIX, "") === base)) continue;
    let extractedPath;
    try {
      embeddedProbes += 1;
      extractedPath = await extractEmbeddedSubtitle(videoPath);
      if (extractedPath) {
        const result = await processSrt(extractedPath, { ...options, outputPath });
        results.push(result);
        if (result.status === "created") remaining -= 1;
      }
    } catch (error) {
      results.push({ status: "failed", sourcePath: videoPath, error: error.message });
    } finally {
      if (extractedPath) await fs.rm(extractedPath, { force: true });
    }
  }
  return results;
}

async function main() {
  const root = process.env.MEDIA_ROOT || "/media";
  const statePath = process.env.STATE_PATH || "/config/state.json";
  const intervalMs = Math.max(60, Number(process.env.SCAN_INTERVAL_SECONDS || 600)) * 1000;
  const maxNewOutputs = Math.max(0, Number(process.env.MAX_NEW_OUTPUTS || 10));
  const options = {
    mode: process.env.SUBTITLE_MODE === "translated" ? "translated" : "bilingual",
    sourceLanguage: process.env.SOURCE_LANGUAGE || "en",
    targetLanguage: process.env.TARGET_LANGUAGE || "zh-CN",
    requireVideoMatch: true,
    maxEmbeddedProbes: Math.max(0, Number(process.env.MAX_EMBEDDED_PROBES_PER_SCAN || 20))
  };
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  for (;;) {
    try {
      let state = { created: 0 };
      try { state = { ...state, ...JSON.parse(await fs.readFile(statePath, "utf8")) }; } catch {}
      const allowance = Math.max(0, maxNewOutputs - Number(state.created || 0));
      const results = allowance > 0 ? await scanOnce(root, { ...options, maxNewOutputs: allowance }) : [];
      state.created = Number(state.created || 0) + results.filter((result) => result.status === "created").length;
      state.updatedAt = new Date().toISOString();
      const temporaryState = `${statePath}.tmp-${process.pid}`;
      await fs.writeFile(temporaryState, JSON.stringify(state, null, 2) + "\n", "utf8");
      await fs.rename(temporaryState, statePath);
      console.log(JSON.stringify({ time: state.updatedAt, scanned: root, pilotLimit: maxNewOutputs, created: state.created, results }));
    } catch (error) {
      console.error(JSON.stringify({ time: new Date().toISOString(), error: error.message }));
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
