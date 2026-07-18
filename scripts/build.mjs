import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const repo = "https://github.com/dxy0218/general-stream-subtitle";
const rawBase = process.env.REPO_RAW_BASE || "https://raw.githubusercontent.com/dxy0218/general-stream-subtitle/main";

function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8").trim(); }
function bundle(name, files) {
  const banner = `// General Stream Subtitle ${pkg.version} - ${name}\n// MIT License - generated file; edit src/ instead.\n`;
  const content = `${banner}(function () {\n"use strict";\nvar GSS = {};\n${files.map(read).join("\n\n")}\n})();\n`;
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist", `${name}.js`), content);
}

const common = [
  "src/shared/runtime.js",
  "src/shared/cache.js",
  "src/shared/language.js",
  "src/shared/config.js",
  "src/shared/logger.js",
  "src/shared/url.js",
  "src/platforms/registry.js"
];

bundle("manifest", common.concat([
  "src/manifest/m3u8.js",
  "src/manifest/main.js"
]));

bundle("gateway", common.concat([
  "src/shared/google.js",
  "src/manifest/m3u8.js",
  "src/subtitle/vtt.js",
  "src/subtitle/translate.js",
  "src/gateway/admin.js",
  "src/gateway/main.js"
]));

const manifestHostPattern = String.raw`(?:` + [
  String.raw`(?:play|play-edge|hls|hls-svod)\.itunes\.apple\.com`,
  String.raw`vod-[^\/]+-(?:amt|aoc|svod)\.tv\.apple\.com`,
  String.raw`(?:[^\/]+\.)?(?:max\.com|h264\.io|hbomaxcdn\.com|api\.hbo\.com)`,
  String.raw`[^\/]+\.(?:media|prod)\.(?:dssott|starott|dssedge)\.com`,
  String.raw`[^\/]+\.hls\.pv-cdn\.net`,
  String.raw`[^\/]+\.hls\.row\.aiv-cdn\.net`,
  String.raw`[^\/]*avodhlss3ww-a\.akamaihd\.net`,
  String.raw`s3\.amazonaws\.com`,
  String.raw`cf-timedtext\.aux\.pv-cdn\.net`,
  String.raw`(?:d1v5ir2lpwr8os|d22qjgkvxw22r6|d25xi40x97liuc|d27xxe7juh1us6|dmqdd6hw24ucf)\.cloudfront\.net`,
  String.raw`vodmanifest\.hulustream\.com`,
  String.raw`manifest-dp\.hulustream\.com`,
  String.raw`(?:[^\/]+\.pplus\.paramount\.tech|(?:vod-[^\/]+|[^\/]+\.airspace-[^\/]+|[^\/]+-pplus)\.(?:cbsaavideo|cbsivideo|cbs)\.com)`,
  String.raw`[^\/]+\.cdn\.peacocktv\.com`,
  String.raw`content-discovery\.uplynk\.com`,
  String.raw`dplus-ph-(?:prod-vod\.akamaized\.net|google-v2\.prod-vod\.h264\.io)`,
  String.raw`[^\/]+-vod\.fubo\.tv`,
  String.raw`hls\.ted\.com`
].join("|") + String.raw`)`;

const manifestPattern = String.raw`^https?:\/\/${manifestHostPattern}\/.*\.m3u8(?:\?.*)?$`;
const gatewayPattern = String.raw`^https?:\/\/(?:gss\.local|127\.0\.0\.1(?::6170)?|localhost(?::6170)?)\/.*`;
const mitmHosts = [
  "*.itunes.apple.com", "*.tv.apple.com",
  "*.max.com", "*.h264.io", "*.hbomaxcdn.com", "*.api.hbo.com",
  "*.media.dssott.com", "*.prod.dssott.com", "*.media.starott.com", "*.prod.starott.com", "*.media.dssedge.com", "*.prod.dssedge.com",
  "*.hls.pv-cdn.net", "*.hls.row.aiv-cdn.net", "*avodhlss3ww-a.akamaihd.net", "s3.amazonaws.com", "cf-timedtext.aux.pv-cdn.net",
  "d1v5ir2lpwr8os.cloudfront.net", "d22qjgkvxw22r6.cloudfront.net", "d25xi40x97liuc.cloudfront.net", "d27xxe7juh1us6.cloudfront.net", "dmqdd6hw24ucf.cloudfront.net",
  "vodmanifest.hulustream.com", "manifest-dp.hulustream.com",
  "*.pplus.paramount.tech", "*.cbsaavideo.com", "*.cbsivideo.com", "*.cbs.com",
  "*.cdn.peacocktv.com", "content-discovery.uplynk.com", "dplus-ph-prod-vod.akamaized.net", "dplus-ph-google-v2.prod-vod.h264.io",
  "*.fubo.tv", "hls.ted.com", "gss.local"
].join(", ");
const forceHttpHosts = [
  "*.hls.pv-cdn.net", "*.hls.row.aiv-cdn.net", "*avodhlss3ww-a.akamaihd.net", "s3.amazonaws.com", "cf-timedtext.aux.pv-cdn.net",
  "d1v5ir2lpwr8os.cloudfront.net", "d22qjgkvxw22r6.cloudfront.net", "d25xi40x97liuc.cloudfront.net", "d27xxe7juh1us6.cloudfront.net", "dmqdd6hw24ucf.cloudfront.net"
].join(", ");
const manifestUrl = `${rawBase}/dist/manifest.js`;
const gatewayUrl = `${rawBase}/dist/gateway.js`;
const defaultArgs = "source=auto&target=zh-CN&trackName=Translate-zh&platforms=all&injectTranslated=false&bilingualOrder=translation-first&cacheEnabled=true&debug=true";

const surgeArgs = "source=%SOURCE%&target=%TARGET%&trackName=%TRACK_NAME%&platforms=%PLATFORMS%&injectTranslated=%PURE_TRACK%&bilingualOrder=%ORDER%&cacheEnabled=%CACHE%&debug=%DEBUG%";
const surge = `#!name=General Stream Subtitle\n#!desc=为多平台 HLS 视频注入 Translate-zh 双语字幕轨（v${pkg.version}）\n#!author=dxy0218 & contributors\n#!homepage=${repo}\n#!arguments=SOURCE=auto&TARGET=zh-CN&TRACK_NAME=Translate-zh&PLATFORMS=all&PURE_TRACK=false&ORDER=translation-first&CACHE=true&DEBUG=true\n\n[General]\nforce-http-engine-hosts = %APPEND% ${forceHttpHosts}\n\n[Script]\nGSS Manifest = type=http-response, pattern=${manifestPattern}, requires-body=1, max-size=2097152, timeout=20, script-path=${manifestUrl}, argument=${surgeArgs}\nGSS Gateway = type=http-request, pattern=${gatewayPattern}, timeout=60, script-path=${gatewayUrl}, argument=${surgeArgs}\n\n[MITM]\nhostname = %APPEND% ${mitmHosts}\n`;

const loon = `#!name=General Stream Subtitle\n#!desc=为多平台 HLS 视频注入 Translate-zh 双语字幕轨（v${pkg.version}）\n#!author=dxy0218 & contributors\n#!homepage=${repo}\n\n[Script]\nhttp-response ${manifestPattern} script-path=${manifestUrl}, timeout=20, requires-body=true, argument=${defaultArgs}, tag=GSS Manifest, enable=true\nhttp-request ${gatewayPattern} script-path=${gatewayUrl}, timeout=60, argument=${defaultArgs}, tag=GSS Gateway, enable=true\n\n[MITM]\nhostname = ${mitmHosts}\n`;

const shadowArgs = "source={{{SOURCE}}}&target={{{TARGET}}}&trackName={{{TRACK_NAME}}}&platforms={{{PLATFORMS}}}&injectTranslated={{{PURE_TRACK}}}&bilingualOrder={{{ORDER}}}&cacheEnabled={{{CACHE}}}&debug={{{DEBUG}}}";
const shadowrocket = `#!name=General Stream Subtitle\n#!desc=为多平台 HLS 视频注入 Translate-zh 双语字幕轨（v${pkg.version}）\n#!author=dxy0218 & contributors\n#!homepage=${repo}\n#!arguments=SOURCE:auto, TARGET:zh-CN, TRACK_NAME:Translate-zh, PLATFORMS:all, PURE_TRACK:false, ORDER:translation-first, CACHE:true, DEBUG:true\n#!arguments-desc=SOURCE：auto、en、ja、ko 或其他语言代码\\n\\nTARGET：目标语言\\n\\nTRACK_NAME：字幕菜单名称\\n\\nPLATFORMS：all 或平台 ID（多个用竖线分隔）\\n\\nPURE_TRACK：是否额外加入纯翻译字幕\\n\\nORDER：translation-first 或 original-first\\n\\nCACHE：翻译缓存\\n\\nDEBUG：调试日志\n\n[Script]\nGSS Manifest = type=http-response, pattern=${manifestPattern}, requires-body=1, max-size=2097152, timeout=20, script-path=${manifestUrl}, argument=${shadowArgs}\nGSS Gateway = type=http-request, pattern=${gatewayPattern}, timeout=60, script-path=${gatewayUrl}, argument=${shadowArgs}\n\n[MITM]\nhostname = %APPEND% ${mitmHosts}\n`;

fs.mkdirSync(path.join(root, "modules"), { recursive: true });
fs.writeFileSync(path.join(root, "modules", "GeneralStreamSubtitle.sgmodule"), surge);
fs.writeFileSync(path.join(root, "modules", "GeneralStreamSubtitle.plugin"), loon);
fs.writeFileSync(path.join(root, "modules", "GeneralStreamSubtitle.module"), shadowrocket);
console.log(`Built General Stream Subtitle ${pkg.version}`);
console.log(`Raw base: ${rawBase}`);
