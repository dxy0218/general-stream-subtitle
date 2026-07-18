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

const base = [
  "src/shared/runtime.js", "src/shared/cache.js", "src/shared/language.js", "src/shared/config.js",
  "src/shared/logger.js", "src/shared/url.js", "src/formats/registry.js", "src/platforms/registry.js"
];
const formatFiles = ["src/formats/youtube.js", "src/formats/vtt.js", "src/formats/srt.js", "src/formats/ttml.js", "src/formats/ass.js", "src/formats/json.js"];
const providerFiles = [
  "src/providers/registry.js", "src/providers/google-free.js", "src/providers/google-cloud.js", "src/providers/deepl.js",
  "src/providers/azure.js", "src/providers/libretranslate.js", "src/providers/openai.js",
  "src/providers/openai-compatible.js", "src/providers/gemini.js", "src/providers/custom-json.js"
];

bundle("manifest", base.concat(formatFiles, ["src/manifest/m3u8.js", "src/manifest/mpd.js", "src/manifest/main.js"]));
bundle("gateway", base.concat(formatFiles, providerFiles, ["src/manifest/m3u8.js", "src/subtitle/translate.js", "src/gateway/admin.js", "src/gateway/main.js"]));
bundle("youtube", base.concat(["src/youtube/player.js", "src/youtube/main.js"]));
bundle("youtube-caption", base.concat(formatFiles, providerFiles, ["src/subtitle/translate.js", "src/youtube/caption-main.js"]));

const manifestPattern = String.raw`^https?:\/\/.+\.(?:m3u8|mpd)(?:\?.*)?$`;
const maxManifestPattern = String.raw`^https?:\/\/(?:[^\/]+\.)?(?:max\.com|h264\.io|hbomaxcdn\.com|api\.hbo\.com)\/.*(?:manifest|playlist|playback|hls|dash).*`;
const gatewayPattern = String.raw`^https?:\/\/(?:gss\.local|127\.0\.0\.1(?::6170)?|localhost(?::6170)?)\/.*`;
const youtubePlayerPattern = String.raw`^https?:\/\/(?:www\.youtube\.com|m\.youtube\.com|music\.youtube\.com|tv\.youtube\.com|youtubei\.googleapis\.com)\/youtubei\/v1\/player(?:\?.*)?$`;
const youtubeCaptionPattern = String.raw`^https?:\/\/(?:www\.youtube\.com|m\.youtube\.com|music\.youtube\.com|tv\.youtube\.com)\/api\/timedtext\?.*(?:gss_mode|gss_v)=.*`;
const mitmHosts = [
  "*.itunes.apple.com", "*.tv.apple.com",
  "*.max.com", "*.h264.io", "*.hbomaxcdn.com", "*.api.hbo.com",
  "*.media.dssott.com", "*.prod.dssott.com", "*.media.starott.com", "*.prod.starott.com", "*.media.dssedge.com", "*.prod.dssedge.com",
  "*.hls.pv-cdn.net", "*.hls.row.aiv-cdn.net", "*avodhlss3ww-a.akamaihd.net", "s3.amazonaws.com", "cf-timedtext.aux.pv-cdn.net",
  "d1v5ir2lpwr8os.cloudfront.net", "d22qjgkvxw22r6.cloudfront.net", "d25xi40x97liuc.cloudfront.net", "d27xxe7juh1us6.cloudfront.net", "dmqdd6hw24ucf.cloudfront.net",
  "vodmanifest.hulustream.com", "manifest-dp.hulustream.com", "*.pplus.paramount.tech", "*.cbsaavideo.com", "*.cbsivideo.com", "*.cbs.com",
  "*.cdn.peacocktv.com", "content-discovery.uplynk.com", "dplus-ph-prod-vod.akamaized.net", "dplus-ph-google-v2.prod-vod.h264.io",
  "*.fubo.tv", "hls.ted.com",
  "*.bbci.co.uk", "vod-*-live.akamaized.net", "*.viki.io", "*.viki.com", "*.tubi.video", "*.tubitv.com", "*.pluto.tv",
  "*.crunchyroll.com", "*.vrv.co", "*.dazn.com", "*.dazn-api.com", "*.plex.tv",
  "*.youtube.com", "youtubei.googleapis.com", "gss.local"
].join(", ");
const forceHttpHosts = [
  "*.hls.pv-cdn.net", "*.hls.row.aiv-cdn.net", "*avodhlss3ww-a.akamaihd.net", "s3.amazonaws.com", "cf-timedtext.aux.pv-cdn.net",
  "d1v5ir2lpwr8os.cloudfront.net", "d22qjgkvxw22r6.cloudfront.net", "d25xi40x97liuc.cloudfront.net", "d27xxe7juh1us6.cloudfront.net", "dmqdd6hw24ucf.cloudfront.net"
].join(", ");
const manifestUrl = `${rawBase}/dist/manifest.js`;
const gatewayUrl = `${rawBase}/dist/gateway.js`;
const youtubeUrl = `${rawBase}/dist/youtube.js`;
const youtubeCaptionUrl = `${rawBase}/dist/youtube-caption.js`;
const defaultArgs = "source=auto&target=zh-CN&trackName=Translate-zh&provider=google-free&platforms=all&formats=all&genericMode=false&youtubeStrategy=direct&youtubeUseAsr=true&youtubeLive=true&youtubePreferManual=true&injectTranslated=false&bilingualOrder=translation-first&cacheEnabled=true&debug=true";
const surgeArgs = "source=%SOURCE%&target=%TARGET%&trackName=%TRACK_NAME%&provider=%PROVIDER%&platforms=%PLATFORMS%&formats=%FORMATS%&genericMode=%GENERIC%&youtubeStrategy=%YT_STRATEGY%&youtubeUseAsr=%YT_ASR%&youtubeLive=%YT_LIVE%&youtubePreferManual=%YT_MANUAL%&injectTranslated=%PURE_TRACK%&bilingualOrder=%ORDER%&cacheEnabled=%CACHE%&debug=%DEBUG%";
const shadowArgs = "source={{{SOURCE}}}&target={{{TARGET}}}&trackName={{{TRACK_NAME}}}&provider={{{PROVIDER}}}&platforms={{{PLATFORMS}}}&formats={{{FORMATS}}}&genericMode={{{GENERIC}}}&youtubeStrategy={{{YT_STRATEGY}}}&youtubeUseAsr={{{YT_ASR}}}&youtubeLive={{{YT_LIVE}}}&youtubePreferManual={{{YT_MANUAL}}}&injectTranslated={{{PURE_TRACK}}}&bilingualOrder={{{ORDER}}}&cacheEnabled={{{CACHE}}}&debug={{{DEBUG}}}";

const surge = `#!name=General Stream Subtitle\n#!desc=多平台 HLS/DASH、多字幕格式、多翻译引擎（v${pkg.version}）\n#!author=dxy0218 & contributors\n#!homepage=${repo}\n#!arguments=SOURCE=auto&TARGET=zh-CN&TRACK_NAME=Translate-zh&PROVIDER=google-free&PLATFORMS=all&FORMATS=all&GENERIC=false&YT_STRATEGY=direct&YT_ASR=true&YT_LIVE=true&YT_MANUAL=true&PURE_TRACK=false&ORDER=translation-first&CACHE=true&DEBUG=true\n\n[General]\nforce-http-engine-hosts = %APPEND% ${forceHttpHosts}\n\n[Script]\nGSS Manifest = type=http-response, pattern=${manifestPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${surgeArgs}\nGSS Max Manifest = type=http-response, pattern=${maxManifestPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${surgeArgs}\nGSS Gateway = type=http-request, pattern=${gatewayPattern}, requires-body=1, timeout=90, script-path=${gatewayUrl}, argument=${surgeArgs}
GSS YouTube Player = type=http-response, pattern=${youtubePlayerPattern}, requires-body=1, max-size=4194304, timeout=30, script-path=${youtubeUrl}, argument=${surgeArgs}
GSS YouTube Caption = type=http-response, pattern=${youtubeCaptionPattern}, requires-body=1, max-size=4194304, timeout=90, script-path=${youtubeCaptionUrl}, argument=${surgeArgs}\n\n[MITM]\nhostname = %APPEND% ${mitmHosts}\n`;
const loon = `#!name=General Stream Subtitle\n#!desc=多平台 HLS/DASH、多字幕格式、多翻译引擎（v${pkg.version}）\n#!author=dxy0218 & contributors\n#!homepage=${repo}\n\n[Script]\nhttp-response ${manifestPattern} script-path=${manifestUrl}, timeout=25, requires-body=true, argument=${defaultArgs}, tag=GSS Manifest, enable=true\nhttp-response ${maxManifestPattern} script-path=${manifestUrl}, timeout=25, requires-body=true, argument=${defaultArgs}, tag=GSS Max Manifest, enable=true\nhttp-request ${gatewayPattern} script-path=${gatewayUrl}, timeout=90, requires-body=true, argument=${defaultArgs}, tag=GSS Gateway, enable=true
http-response ${youtubePlayerPattern} script-path=${youtubeUrl}, timeout=30, requires-body=true, argument=${defaultArgs}, tag=GSS YouTube Player, enable=true
http-response ${youtubeCaptionPattern} script-path=${youtubeCaptionUrl}, timeout=90, requires-body=true, argument=${defaultArgs}, tag=GSS YouTube Caption, enable=true\n\n[MITM]\nhostname = ${mitmHosts}\n`;
const shadowrocket = `#!name=General Stream Subtitle\n#!desc=多平台 HLS/DASH、多字幕格式、多翻译引擎（v${pkg.version}）\n#!author=dxy0218 & contributors\n#!homepage=${repo}\n#!arguments=SOURCE:auto, TARGET:zh-CN, TRACK_NAME:Translate-zh, PROVIDER:google-free, PLATFORMS:all, FORMATS:all, GENERIC:false, YT_STRATEGY:direct, YT_ASR:true, YT_LIVE:true, YT_MANUAL:true, PURE_TRACK:false, ORDER:translation-first, CACHE:true, DEBUG:true\n#!arguments-desc=SOURCE：auto 或语言代码\\n\\nTARGET：目标语言\\n\\nPROVIDER：翻译引擎\\n\\nPLATFORMS：平台 ID\\n\\nFORMATS：youtube|vtt|srt|ttml|ass|json\\n\\nYT_STRATEGY：direct 或 virtual\\n\\nYT_ASR：YouTube 自动字幕\\n\\nYT_LIVE：YouTube 直播字幕\\n\\nAPI Key 请在 http://gss.local/ 保存\n\n[Script]\nGSS Manifest = type=http-response, pattern=${manifestPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${shadowArgs}\nGSS Max Manifest = type=http-response, pattern=${maxManifestPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${shadowArgs}\nGSS Gateway = type=http-request, pattern=${gatewayPattern}, requires-body=1, timeout=90, script-path=${gatewayUrl}, argument=${shadowArgs}
GSS YouTube Player = type=http-response, pattern=${youtubePlayerPattern}, requires-body=1, max-size=4194304, timeout=30, script-path=${youtubeUrl}, argument=${shadowArgs}
GSS YouTube Caption = type=http-response, pattern=${youtubeCaptionPattern}, requires-body=1, max-size=4194304, timeout=90, script-path=${youtubeCaptionUrl}, argument=${shadowArgs}\n\n[MITM]\nhostname = %APPEND% ${mitmHosts}\n`;

fs.mkdirSync(path.join(root, "modules"), { recursive: true });
fs.writeFileSync(path.join(root, "modules", "GeneralStreamSubtitle.sgmodule"), surge);
fs.writeFileSync(path.join(root, "modules", "GeneralStreamSubtitle.plugin"), loon);
fs.writeFileSync(path.join(root, "modules", "GeneralStreamSubtitle.module"), shadowrocket);
console.log(`Built General Stream Subtitle ${pkg.version}`);
