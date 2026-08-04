import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".m4v", ".avi", ".mov", ".ts", ".webm"]);
const TEXT_SUBTITLE_CODECS = new Set(["ass", "ssa", "subrip", "srt", "text", "webvtt"]);
const SOURCE_SUFFIX = /(?:\.(?:en|eng|english))?\.(?:srt|vtt)$/i;
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

async function translateGoogle(texts, source = "en", target = "zh-CN") {
  const translations = [];
  for (const text of texts) {
    if (!text) { translations.push(""); continue; }
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.search = new URLSearchParams({ client: "gtx", dt: "t", sl: source, tl: target, q: text });
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Google translation failed with HTTP ${response.status}`);
    const payload = await response.json();
    translations.push(payload[0].map((part) => part?.[0] || "").join(""));
  }
  return translations;
}

export async function processSrt(sourcePath, options = {}) {
  const outputPath = options.outputPath || outputPathFor(sourcePath);
  if (outputPath === sourcePath || await exists(outputPath)) return { status: "skipped", sourcePath, outputPath };
  const cues = parseSrt(await fs.readFile(sourcePath, "utf8"));
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
  const sources = files.filter((file) => SOURCE_SUFFIX.test(file) && !GENERATED_SUFFIX.test(file));
  for (const sourcePath of sources) results.push(await processSrt(sourcePath, options));

  for (const videoPath of files.filter((file) => VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()))) {
    const outputPath = videoPath.replace(path.extname(videoPath), ".zh-CN.srt");
    if (await exists(outputPath)) continue;
    const base = videoPath.slice(0, -path.extname(videoPath).length);
    if (sources.some((source) => source.replace(SOURCE_SUFFIX, "") === base)) continue;
    let extractedPath;
    try {
      extractedPath = await extractEmbeddedSubtitle(videoPath);
      if (extractedPath) results.push(await processSrt(extractedPath, { ...options, outputPath }));
    } finally {
      if (extractedPath) await fs.rm(extractedPath, { force: true });
    }
  }
  return results;
}

async function main() {
  const root = process.env.MEDIA_ROOT || "/media";
  const intervalMs = Math.max(60, Number(process.env.SCAN_INTERVAL_SECONDS || 600)) * 1000;
  const options = {
    mode: process.env.SUBTITLE_MODE === "translated" ? "translated" : "bilingual",
    sourceLanguage: process.env.SOURCE_LANGUAGE || "en",
    targetLanguage: process.env.TARGET_LANGUAGE || "zh-CN"
  };
  for (;;) {
    try {
      const results = await scanOnce(root, options);
      console.log(JSON.stringify({ time: new Date().toISOString(), scanned: root, results }));
    } catch (error) {
      console.error(JSON.stringify({ time: new Date().toISOString(), error: error.message }));
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
