import { execFile } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
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

export function pickEmbeddedTextStream(streams) {
  return (streams || []).find((item) => {
    if (!TEXT_SUBTITLE_CODECS.has(item.codec_name)) return false;
    const language = String(item.tags?.language || "").trim().toLowerCase();
    return language && !language.startsWith("zh") && !["chi", "zho", "cmn", "chs", "cht", "chinese"].includes(language);
  }) || (streams || []).find((item) => TEXT_SUBTITLE_CODECS.has(item.codec_name) && !item.tags?.language);
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
  const utf8 = input.toString("utf8").replace(/^\uFEFF/, "");
  const replacementCharacters = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCharacters >= 8 && replacementCharacters / Math.max(input.length, 1) >= 0.005) {
    try {
      const legacyChinese = new TextDecoder("gb18030", { fatal: true }).decode(input);
      if (looksChinese(legacyChinese)) return legacyChinese;
    } catch {}
  }
  return utf8;
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

export async function buildExternalInventory(sources) {
  const tasks = new Map();
  for (const sourcePath of sources) {
    const outputPath = outputPathFor(sourcePath);
    if (!tasks.has(outputPath)) tasks.set(outputPath, sourcePath);
  }
  const inventory = { total: 0, completed: 0, pending: 0, skippedChinese: 0, invalid: 0 };
  for (const [outputPath, sourcePath] of tasks) {
    try {
      const cues = parseSrt(decodeSubtitle(await fs.readFile(sourcePath)));
      if (!cues.some((cue) => Number.isInteger(cue.timeIndex) && cue.timeIndex >= 0 && cue.text)) {
        inventory.invalid += 1;
        continue;
      }
      if (looksChinese(cues.map((cue) => cue.text).join("\n"))) {
        inventory.skippedChinese += 1;
        continue;
      }
      inventory.total += 1;
      if (await exists(outputPath)) inventory.completed += 1;
      else inventory.pending += 1;
    } catch {
      inventory.invalid += 1;
    }
  }
  return inventory;
}

export function dashboardHtml() {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>字幕翻译进度</title><style>
:root{color-scheme:dark;font-family:ui-sans-serif,system-ui,-apple-system,"PingFang SC",sans-serif;background:#08111f;color:#e5eefc}*{box-sizing:border-box}body{margin:0;padding:24px;background:radial-gradient(circle at top,#16355c 0,#08111f 42%);min-height:100vh}.wrap{max-width:920px;margin:auto}.head{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:20px}h1{font-size:28px;margin:0}.badge{padding:7px 12px;border-radius:999px;background:#17385f;color:#9bd4ff;font-weight:700}.card{background:#0f1d30dd;border:1px solid #28415f;border-radius:18px;padding:20px;margin:14px 0;box-shadow:0 14px 40px #0005}.row{display:flex;justify-content:space-between;gap:16px;align-items:end}.big{font-size:38px;font-weight:800}.muted{color:#92a7c2}.bar{height:18px;background:#243349;border-radius:999px;overflow:hidden;margin:16px 0 8px}.fill{height:100%;width:0;background:linear-gradient(90deg,#38bdf8,#34d399);transition:width .5s}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stat{background:#12263e;border-radius:14px;padding:14px}.stat b{display:block;font-size:24px;margin-top:5px}.current{font-family:ui-monospace,monospace;word-break:break-all;color:#d8e9ff}.recent{margin:8px 0 0;padding-left:22px}.recent li{margin:7px 0;word-break:break-all}@media(max-width:680px){body{padding:14px}.grid{grid-template-columns:repeat(2,1fr)}.row{align-items:start;flex-direction:column}.big{font-size:32px}}
</style></head><body><main class="wrap"><div class="head"><h1>字幕翻译进度</h1><span class="badge" id="phase">连接中</span></div>
<section class="card"><div class="row"><div><div class="muted">已发现文字字幕任务</div><div class="big"><span id="done">—</span> / <span id="total">—</span></div></div><div class="muted" id="updated">尚未更新</div></div><div class="bar"><div class="fill" id="fill"></div></div><div class="muted" id="percent">正在读取状态…</div></section>
<section class="grid"><div class="stat"><span class="muted">累计新建</span><b id="created">—</b></div><div class="stat"><span class="muted">本轮完成</span><b id="batch">—</b></div><div class="stat"><span class="muted">跳过中文</span><b id="chinese">—</b></div><div class="stat"><span class="muted">失败/延期</span><b id="failures">—</b></div></section>
<section class="card"><div class="muted">当前处理</div><p class="current" id="current">等待下一轮</p><div class="muted" id="next"></div></section>
<section class="card"><div class="muted">最近完成</div><ol class="recent" id="recent"></ol></section>
<p class="muted">这里只显示文件名和计数，不读取或展示字幕正文。内嵌字幕仍在逐批发现，因此本进度条表示当前已发现的文字字幕任务。</p></main>
<script>
const $=id=>document.getElementById(id);const phaseNames={starting:'启动中',scanning:'扫描中',inventory:'盘点中',transcribing:'语音识别中',translating:'翻译中',sleeping:'等待下一轮',error:'发生错误'};
function time(value){if(!value)return '—';return new Date(value).toLocaleString('zh-CN',{hour12:false})}
async function refresh(){try{const s=await fetch('./api/status',{cache:'no-store'}).then(r=>r.json());const i=s.inventory||{};const done=Number(i.completed||0)+Number(s.batchCreated||0);const total=Number(i.total||0);const pct=total?Math.min(100,done/total*100):0;$('phase').textContent=phaseNames[s.phase]||s.phase||'运行中';$('done').textContent=done;$('total').textContent=total;$('fill').style.width=pct+'%';$('percent').textContent=total?pct.toFixed(1)+'% · 待处理 '+Math.max(0,total-done):'正在盘点任务';$('created').textContent=s.created??0;$('batch').textContent=(s.batchCreated??0)+' / '+(s.perScanLimit??10);$('chinese').textContent=i.skippedChinese??0;$('failures').textContent=(s.failureCount??0)+' / '+(s.deferredFailures??0);$('current').textContent=s.currentPath||'等待下一轮';$('updated').textContent='最近更新：'+time(s.updatedAt);$('next').textContent=s.nextScanAt?'下一轮预计：'+time(s.nextScanAt):'';const list=$('recent');list.replaceChildren(...(s.recent||[]).map(value=>{const li=document.createElement('li');li.textContent=value;return li;}));}catch{$('phase').textContent='连接失败'}}refresh();setInterval(refresh,3000);
</script></body></html>`;
}

export function startStatusServer(getStatus, options = {}) {
  const host = options.host || "0.0.0.0";
  const port = Number(options.port ?? 8787);
  const html = dashboardHtml();
  const username = String(options.username || "");
  const password = String(options.password || "");
  const authorized = (request) => {
    if (!username || !password) return true;
    const authorization = String(request.headers.authorization || "");
    if (!authorization.startsWith("Basic ")) return false;
    let supplied;
    try { supplied = Buffer.from(authorization.slice(6), "base64").toString("utf8"); } catch { return false; }
    const expected = Buffer.from(`${username}:${password}`);
    const received = Buffer.from(supplied);
    return expected.length === received.length && timingSafeEqual(expected, received);
  };
  const server = createServer((request, response) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    if (!authorized(request)) {
      response.writeHead(401, { "content-type": "text/plain; charset=utf-8", "www-authenticate": 'Basic realm="GSS Progress", charset="UTF-8"' });
      response.end("Authentication required\n");
      return;
    }
    if (request.url === "/api/status") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(getStatus()));
      return;
    }
    if (request.url === "/" || request.url === "/index.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
  });
  server.listen(port, host);
  return server;
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 8 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${command} failed: ${stderr || error.message}`));
      else resolve(stdout);
    });
  });
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function requestGoogle(text, source, target) {
  if (process.env.TRANSLATION_RELAY_URL) {
    const response = await fetch(process.env.TRANSLATION_RELAY_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.TRANSLATION_RELAY_TOKEN || ""}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ text, source, target }),
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error(`Translation relay failed with HTTP ${response.status}`);
    const payload = await response.json();
    if (typeof payload?.translation !== "string") throw new Error("Translation relay returned an invalid response");
    return payload.translation;
  }
  const endpoints = [
    "https://translate.googleapis.com/translate_a/single",
    "https://translate.google.com/translate_a/single"
  ];
  const failures = [];
  for (const endpoint of endpoints) {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({ client: "gtx", dt: "t", sl: source, tl: target, q: text });
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload?.[0])) throw new Error("unexpected response");
      return payload[0].map((part) => part?.[0] || "").join("");
    } catch (error) {
      const detail = error?.cause?.code || error?.cause?.message || error?.message || String(error);
      failures.push(`${url.hostname}: ${detail}`);
    }
  }
  throw new Error(`Google translation failed (${failures.join("; ")})`);
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

export async function translateGoogle(texts, source = "auto", target = "zh-CN") {
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
  const decoded = decodeSubtitle(await fs.readFile(sourcePath));
  const cues = parseSrt(decoded);
  if (!cues.some((cue) => Number.isInteger(cue.timeIndex) && cue.timeIndex >= 0 && cue.text)) {
    return { status: "skipped", reason: "unsupported-or-invalid-srt", sourcePath, outputPath };
  }
  if (looksChinese(cues.map((cue) => cue.text).join("\n"))) {
    if (!options.allowChineseSource) return { status: "skipped", reason: "source-looks-chinese", sourcePath, outputPath };
    const temporaryPath = `${outputPath}.gss-tmp-${process.pid}`;
    await fs.writeFile(temporaryPath, `${decoded.trim()}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporaryPath, outputPath);
    return { status: "created", sourcePath, outputPath, translated: false };
  }
  const translator = options.translator || translateGoogle;
  const translations = await translator(cues.map((cue) => cue.text), options.sourceLanguage || "auto", options.targetLanguage || "zh-CN");
  const rendered = renderSrt(cues, translations, options.mode || "bilingual");
  const temporaryPath = `${outputPath}.gss-tmp-${process.pid}`;
  await fs.writeFile(temporaryPath, rendered, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, outputPath);
  return { status: "created", sourcePath, outputPath };
}

async function extractEmbeddedSubtitle(videoPath) {
  const raw = await execFileAsync("ffprobe", ["-v", "error", "-select_streams", "s", "-show_entries", "stream=index,codec_name:stream_tags=language", "-of", "json", videoPath]);
  const streams = JSON.parse(raw).streams || [];
  const stream = pickEmbeddedTextStream(streams);
  if (!stream) return { extractedPath: null, hasTextStream: streams.some((item) => TEXT_SUBTITLE_CODECS.has(item.codec_name)) };
  const extractedPath = `${videoPath}.gss-extracted-${process.pid}.srt`;
  await execFileAsync("ffmpeg", ["-v", "error", "-y", "-i", videoPath, "-map", `0:${stream.index}`, extractedPath]);
  return { extractedPath, hasTextStream: true };
}

export function matchesAsrInclude(videoPath, pattern) {
  if (!pattern) return false;
  pattern.lastIndex = 0;
  return pattern.test(videoPath);
}

export async function transcribeVideo(videoPath, options = {}) {
  const command = options.whisperCommand || process.env.WHISPER_COMMAND || "whisper-cli";
  const modelPath = options.whisperModelPath || process.env.WHISPER_MODEL_PATH || "/models/ggml-base.bin";
  const threads = String(Math.max(1, Number(options.whisperThreads || process.env.WHISPER_THREADS || 2)));
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gss-asr-"));
  const audioPath = path.join(temporaryRoot, "audio.wav");
  const outputBase = path.join(temporaryRoot, "transcript");
  const outputPath = `${outputBase}.srt`;
  try {
    await execFileAsync("ffmpeg", ["-v", "error", "-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audioPath]);
    await execFileAsync(command, ["-m", modelPath, "-f", audioPath, "-l", "auto", "-t", threads, "-osrt", "-of", outputBase, "-np"], { timeout: Number(options.asrTimeoutMs || process.env.ASR_TIMEOUT_MS || 12 * 60 * 60 * 1000) });
    if (!await exists(outputPath)) throw new Error("Whisper did not create an SRT transcript");
    const body = await fs.readFile(outputPath);
    const durablePath = `${videoPath}.gss-asr-${process.pid}.srt`;
    await fs.writeFile(durablePath, body, { flag: "wx" });
    return durablePath;
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function scanOnce(root, options = {}) {
  const files = await walk(root);
  const results = [];
  const videos = files.filter((file) => VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const videoStems = new Set(videos.map((file) => file.slice(0, -path.extname(file).length)));
  const sources = files
    .filter((file) => SOURCE_SUFFIX.test(file) && !GENERATED_SUFFIX.test(file))
    .filter((file) => !options.requireVideoMatch || videoStems.has(file.replace(SOURCE_SUFFIX, "")))
    .filter((file) => !options.skipPaths?.has(file))
    .sort((left, right) => Number(!/\.(?:en|eng|english)\.srt$/i.test(left)) - Number(!/\.(?:en|eng|english)\.srt$/i.test(right)) || left.localeCompare(right));
  if (options.onInventory) options.onInventory(await buildExternalInventory(sources));
  let remaining = Number.isFinite(options.maxNewOutputs) ? Math.max(0, options.maxNewOutputs) : Infinity;
  let translationFailures = 0;
  const maxTranslationFailures = Math.max(1, Number(options.maxTranslationFailures ?? 3));
  for (const sourcePath of sources) {
    if (remaining <= 0) break;
    try {
      options.onProgress?.({ phase: "translating", currentPath: sourcePath });
      const result = await processSrt(sourcePath, options);
      results.push(result);
      if (result.status === "created") remaining -= 1;
      options.onProgress?.({ phase: "translating", currentPath: sourcePath, result });
    } catch (error) {
      results.push({ status: "failed", sourcePath, error: error.message });
      translationFailures += 1;
      if (translationFailures >= maxTranslationFailures) break;
    }
  }

  if (translationFailures >= maxTranslationFailures) {
    results.push({ status: "paused", reason: "translation-failure-limit", failures: translationFailures });
    return results;
  }

  let embeddedProbes = 0;
  let asrStarted = 0;
  const maxEmbeddedProbes = Math.max(0, Number(options.maxEmbeddedProbes ?? 20));
  const maxAsrPerScan = Math.max(0, Number(options.maxAsrPerScan ?? 0));
  for (const videoPath of videos) {
    if (remaining <= 0 || embeddedProbes >= maxEmbeddedProbes) break;
    if (options.skipPaths?.has(videoPath)) continue;
    const outputPath = videoPath.replace(path.extname(videoPath), ".zh-CN.srt");
    if (await exists(outputPath)) continue;
    const base = videoPath.slice(0, -path.extname(videoPath).length);
    if (sources.some((source) => source.replace(SOURCE_SUFFIX, "") === base)) continue;
    let extractedPath;
    let transcriptPath;
    try {
      options.onProgress?.({ phase: "scanning", currentPath: videoPath });
      embeddedProbes += 1;
      const embedded = options.embeddedExtractor ? await options.embeddedExtractor(videoPath) : await extractEmbeddedSubtitle(videoPath);
      extractedPath = typeof embedded === "string" ? embedded : embedded?.extractedPath;
      if (extractedPath) {
        const result = await processSrt(extractedPath, { ...options, outputPath });
        results.push(result);
        if (result.status === "created") remaining -= 1;
        options.onProgress?.({ phase: "translating", currentPath: videoPath, result });
      } else if (!embedded?.hasTextStream && options.asrEnabled && asrStarted < maxAsrPerScan && matchesAsrInclude(videoPath, options.asrIncludePattern)) {
        asrStarted += 1;
        options.onProgress?.({ phase: "transcribing", currentPath: videoPath });
        const transcriber = options.transcriber || transcribeVideo;
        transcriptPath = await transcriber(videoPath, options);
        options.onProgress?.({ phase: "translating", currentPath: videoPath });
        const translated = await processSrt(transcriptPath, { ...options, outputPath, allowChineseSource: true });
        const result = { ...translated, sourcePath: videoPath, transcription: true };
        results.push(result);
        if (result.status === "created") remaining -= 1;
        options.onProgress?.({ phase: "translating", currentPath: videoPath, result });
      }
    } catch (error) {
      results.push({ status: "failed", sourcePath: videoPath, error: error.message });
      translationFailures += 1;
      if (translationFailures >= maxTranslationFailures) break;
    } finally {
      if (extractedPath) await fs.rm(extractedPath, { force: true });
      if (transcriptPath) await fs.rm(transcriptPath, { force: true });
    }
  }
  return results;
}

export function updateFailureLedger(ledger, results, maxAttempts = 3, now = new Date().toISOString()) {
  const next = { ...(ledger || {}) };
  for (const result of results || []) {
    if (!result?.sourcePath) continue;
    if (result.status === "failed") {
      const previous = next[result.sourcePath] || {};
      next[result.sourcePath] = {
        attempts: Math.min(maxAttempts, Number(previous.attempts || 0) + 1),
        lastError: String(result.error || "unknown failure").slice(0, 500),
        lastAttemptAt: now
      };
    } else if (result.status === "created" || result.status === "skipped") {
      delete next[result.sourcePath];
    }
  }
  return next;
}

async function main() {
  const root = process.env.MEDIA_ROOT || "/media";
  const statePath = process.env.STATE_PATH || "/config/state.json";
  const intervalMs = Math.max(60, Number(process.env.SCAN_INTERVAL_SECONDS || 600)) * 1000;
  const configuredTotalLimit = Math.max(0, Number(process.env.MAX_NEW_OUTPUTS || 0));
  const maxTotalOutputs = configuredTotalLimit > 0 ? configuredTotalLimit : Infinity;
  const maxNewOutputsPerScan = Math.max(1, Number(process.env.MAX_NEW_OUTPUTS_PER_SCAN || 10));
  const maxFailureAttempts = Math.max(1, Number(process.env.MAX_FAILURE_ATTEMPTS || 3));
  const asrEnabled = String(process.env.ASR_ENABLED || "false").toLowerCase() === "true";
  const asrIncludeValue = String(process.env.ASR_INCLUDE_PATTERN || "").trim();
  if (asrEnabled && !asrIncludeValue) throw new Error("ASR_INCLUDE_PATTERN is required when ASR_ENABLED=true");
  let asrIncludePattern = null;
  if (asrIncludeValue) {
    try { asrIncludePattern = new RegExp(asrIncludeValue, "i"); }
    catch (error) { throw new Error(`Invalid ASR_INCLUDE_PATTERN: ${error.message}`); }
  }
  const options = {
    mode: process.env.SUBTITLE_MODE === "translated" ? "translated" : "bilingual",
    sourceLanguage: process.env.SOURCE_LANGUAGE || "auto",
    targetLanguage: process.env.TARGET_LANGUAGE || "zh-CN",
    requireVideoMatch: true,
    maxTranslationFailures: Math.max(1, Number(process.env.MAX_TRANSLATION_FAILURES_PER_SCAN || 3)),
    maxEmbeddedProbes: Math.max(0, Number(process.env.MAX_EMBEDDED_PROBES_PER_SCAN || 20)),
    asrEnabled,
    asrIncludePattern,
    maxAsrPerScan: Math.max(0, Number(process.env.MAX_ASR_PER_SCAN || 1)),
    whisperCommand: process.env.WHISPER_COMMAND || "whisper-cli",
    whisperModelPath: process.env.WHISPER_MODEL_PATH || "/models/ggml-base.bin",
    whisperThreads: Math.max(1, Number(process.env.WHISPER_THREADS || 2))
  };
  const runtime = {
    revision: process.env.GSS_BUILD_REV || "image",
    asrEnabled,
    phase: "starting",
    startedAt: new Date().toISOString(),
    created: 0,
    batchCreated: 0,
    perScanLimit: maxNewOutputsPerScan,
    inventory: null,
    failureCount: 0,
    deferredFailures: 0,
    currentPath: null,
    recent: []
  };
  const statusPort = Math.max(0, Number(process.env.STATUS_PORT || 8787));
  if (statusPort > 0) {
    let dashboardAuth = { username: process.env.DASHBOARD_USERNAME, password: process.env.DASHBOARD_PASSWORD };
    try { dashboardAuth = { ...dashboardAuth, ...JSON.parse(await fs.readFile(process.env.DASHBOARD_AUTH_PATH || "/config/dashboard-auth.json", "utf8")) }; } catch {}
    const server = startStatusServer(() => runtime, { port: statusPort, host: process.env.STATUS_HOST || "0.0.0.0", ...dashboardAuth });
    server.on("listening", () => console.log(JSON.stringify({ time: new Date().toISOString(), statusPage: `http://${process.env.STATUS_HOST || "0.0.0.0"}:${statusPort}` })));
  }
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  for (;;) {
    try {
      let state = { created: 0, failures: {} };
      try { state = { ...state, ...JSON.parse(await fs.readFile(statePath, "utf8")) }; } catch {}
      Object.assign(runtime, { phase: "scanning", created: Number(state.created || 0), batchCreated: 0, currentPath: null, updatedAt: state.updatedAt || null, inventory: state.inventory || runtime.inventory, recent: state.recent || runtime.recent });
      const remainingTotal = Math.max(0, maxTotalOutputs - Number(state.created || 0));
      const allowance = Math.min(maxNewOutputsPerScan, remainingTotal);
      const skipPaths = new Set(Object.entries(state.failures || {}).filter(([, failure]) => Number(failure?.attempts || 0) >= maxFailureAttempts).map(([sourcePath]) => sourcePath));
      const results = allowance > 0 ? await scanOnce(root, {
        ...options,
        maxNewOutputs: allowance,
        skipPaths,
        onInventory: (inventory) => Object.assign(runtime, { phase: "inventory", inventory }),
        onProgress: ({ phase, currentPath, result }) => {
          runtime.phase = phase;
          runtime.currentPath = currentPath ? path.relative(root, currentPath) : null;
          if (result?.status === "created") runtime.batchCreated += 1;
        }
      }) : [];
      state.created = Number(state.created || 0) + results.filter((result) => result.status === "created").length;
      state.updatedAt = new Date().toISOString();
      state.failures = updateFailureLedger(state.failures, results, maxFailureAttempts, state.updatedAt);
      state.inventory = runtime.inventory;
      state.recent = (state.recent || []).concat(results.filter((result) => result.status === "created").map((result) => path.relative(root, result.outputPath))).slice(-10);
      const temporaryState = `${statePath}.tmp-${process.pid}`;
      await fs.writeFile(temporaryState, JSON.stringify(state, null, 2) + "\n", "utf8");
      await fs.rename(temporaryState, statePath);
      const deferredFailures = Object.values(state.failures).filter((failure) => Number(failure?.attempts || 0) >= maxFailureAttempts).length;
      Object.assign(runtime, { phase: "sleeping", created: state.created, batchCreated: results.filter((result) => result.status === "created").length, failureCount: Object.keys(state.failures).length, deferredFailures, currentPath: null, recent: state.recent, updatedAt: state.updatedAt, nextScanAt: new Date(Date.now() + intervalMs).toISOString() });
      console.log(JSON.stringify({ time: state.updatedAt, revision: process.env.GSS_BUILD_REV || "image", scanned: root, totalLimit: Number.isFinite(maxTotalOutputs) ? maxTotalOutputs : null, perScanLimit: maxNewOutputsPerScan, created: state.created, deferredFailures: Object.values(state.failures).filter((failure) => Number(failure?.attempts || 0) >= maxFailureAttempts).length, results }));
    } catch (error) {
      Object.assign(runtime, { phase: "error", currentPath: null, lastError: error.message, updatedAt: new Date().toISOString(), nextScanAt: new Date(Date.now() + intervalMs).toISOString() });
      console.error(JSON.stringify({ time: new Date().toISOString(), error: error.message }));
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
