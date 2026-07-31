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
  "src/shared/logger.js", "src/shared/url.js", "src/shared/diagnostics.js", "src/formats/registry.js", "src/platforms/registry.js"
];
const formatFiles = ["src/formats/youtube.js", "src/formats/vtt.js", "src/formats/srt.js", "src/formats/ttml.js", "src/formats/ass.js", "src/formats/json.js"];
const providerFiles = [
  "src/providers/registry.js", "src/providers/google-free.js", "src/providers/google-cloud.js", "src/providers/deepl.js",
  "src/providers/azure.js", "src/providers/libretranslate.js", "src/providers/openai.js",
  "src/providers/openai-compatible.js", "src/providers/gemini.js", "src/providers/custom-json.js"
];

bundle("manifest", base.concat(formatFiles, ["src/platforms/playback-json.js", "src/manifest/m3u8.js", "src/manifest/mpd.js", "src/manifest/main.js"]));
bundle("gateway", base.concat(formatFiles, providerFiles, ["src/manifest/m3u8.js", "src/subtitle/translate.js", "src/gateway/admin.js", "src/gateway/main.js"]));
bundle("youtube", base.concat(["src/youtube/player.js", "src/youtube/main.js"]));
bundle("youtube-caption", base.concat(formatFiles, providerFiles, ["src/subtitle/translate.js", "src/youtube/caption-main.js"]));

const manifestPattern = String.raw`^https?:\/\/(?!(?:[^\/]+\.)*(?:pluto\.tv|pplus\.paramount\.tech|paramount\.tech|paramountplus\.com|cbsaavideo\.com|cbsivideo\.com|cbs\.com|max\.com|discomax\.com|h264\.io|hbomaxcdn\.com|api\.hbo\.com|uplynk\.com)(?::\d+)?\/).+\.(?:m3u8|mpd)(?:\?.*)?$`;
const plutoMasterPattern = String.raw`^https?:\/\/(?:stitcher-ipv4\.pluto\.tv|service-stitcher\.clusters\.pluto\.tv|stitcher\.pluto\.tv)\/.*\/master(?:\/[^?]*\.m3u8|\.m3u8)(?:\?.*)?$`;
const paramountManifestPattern = String.raw`^https?:\/\/(?:[^\/]+\.)*(?:pplus\.paramount\.tech|paramount\.tech|paramountplus\.com|cbsaavideo\.com|cbsivideo\.com|cbs\.com)\/.*(?:master|manifest)[^?]*\.(?:m3u8|mpd)(?:\?.*)?$`;
const paramountPlaybackPattern = String.raw`^https?:\/\/(?:[^\/]+\.)*(?:pplus\.paramount\.tech|paramount\.tech|paramountplus\.com|cbsaavideo\.com|cbsivideo\.com|cbs\.com)\/.*(?:playback|stream|live|linear|channel|station|session|manifest).*`;
// Max uses opaque playback/GraphQL paths, while Discovery account and device
// hosts can reject HTTPS interception on Apple TV. Keep Discovery interception
// on identifiable media CDNs and leave its app/API hosts untouched.
const warnerPlaybackPattern = String.raw`^https?:\/\/(?:(?:[^\/]+\.)*(?:max\.com|discomax\.com|h264\.io|hbomaxcdn\.com|api\.hbo\.com)|[^\/.]*discovery[^\/.]*\.uplynk\.com)\/.*`;
const gatewayPattern = String.raw`^https?:\/\/(?:gss\.local|127\.0\.0\.1(?::6170)?|localhost(?::6170)?)\/.*`;
const youtubePlayerPattern = String.raw`^https?:\/\/(?:www\.youtube\.com|m\.youtube\.com|music\.youtube\.com|tv\.youtube\.com|youtubei\.googleapis\.com)\/youtubei\/v1\/player(?:\?.*)?$`;
const youtubeCaptionPattern = String.raw`^https?:\/\/(?:www\.youtube\.com|m\.youtube\.com|music\.youtube\.com|tv\.youtube\.com)\/api\/timedtext\?.*(?:gss_mode|gss_v)=.*`;
const mitmHosts = [
  // Apple Music and Apple TV share play.itunes.apple.com. Intercepting it from
  // the default module triggers Apple Music's certificate validation, so Apple
  // media hosts must remain opt-in rather than part of the safe default.
  "*.max.com", "*.discomax.com", "*.h264.io", "*.hbomaxcdn.com", "*.api.hbo.com",
  "*.media.dssott.com", "*.prod.dssott.com", "*.media.starott.com", "*.prod.starott.com", "*.media.dssedge.com", "*.prod.dssedge.com",
  "*.hls.pv-cdn.net", "*.hls.row.aiv-cdn.net", "*avodhlss3ww-a.akamaihd.net", "s3.amazonaws.com", "cf-timedtext.aux.pv-cdn.net",
  "d1v5ir2lpwr8os.cloudfront.net", "d22qjgkvxw22r6.cloudfront.net", "d25xi40x97liuc.cloudfront.net", "d27xxe7juh1us6.cloudfront.net", "dmqdd6hw24ucf.cloudfront.net",
  "vodmanifest.hulustream.com", "manifest-dp.hulustream.com", "*.pplus.paramount.tech", "*.paramount.tech", "*.paramountplus.com", "*.cbsaavideo.com", "*.cbsivideo.com", "*.cbs.com",
  // Discovery app, account, and device hosts remain outside MITM. Only known
  // Discovery media CDN host shapes are intercepted by default.
  "*.cdn.peacocktv.com", "*discovery*.uplynk.com", "dplus-*.akamaized.net",
  "*.fubo.tv", "hls.ted.com",
  "*.bbci.co.uk", "vod-*-live.akamaized.net", "*.viki.io", "*.viki.com", "*.tubi.video", "*.tubitv.com", "stitcher-ipv4.pluto.tv", "service-stitcher.clusters.pluto.tv", "stitcher.pluto.tv",
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
const defaultArgs = "source=auto&target=zh-CN&trackName=Translate-zh&provider=google-free&platforms=all&discoveryMode=full&formats=all&genericMode=false&youtubeStrategy=direct&youtubeUseAsr=true&youtubeLive=true&youtubePreferManual=true&injectTranslated=false&bilingualOrder=translation-first&cacheEnabled=true&debug=false";
const surgeArgs = "source=%SOURCE%&target=%TARGET%&trackName=%TRACK_NAME%&provider=%PROVIDER%&platforms=%PLATFORMS%&discoveryMode=%DISCOVERY_MODE%&formats=%FORMATS%&genericMode=%GENERIC%&youtubeStrategy=%YT_STRATEGY%&youtubeUseAsr=%YT_ASR%&youtubeLive=%YT_LIVE%&youtubePreferManual=%YT_MANUAL%&injectTranslated=%PURE_TRACK%&bilingualOrder=%ORDER%&cacheEnabled=%CACHE%&debug=%DEBUG%";
const shadowArgs = "source={{{SOURCE}}}&target={{{TARGET}}}&trackName={{{TRACK_NAME}}}&provider={{{PROVIDER}}}&platforms={{{PLATFORMS}}}&discoveryMode={{{DISCOVERY_MODE}}}&formats={{{FORMATS}}}&genericMode={{{GENERIC}}}&youtubeStrategy={{{YT_STRATEGY}}}&youtubeUseAsr={{{YT_ASR}}}&youtubeLive={{{YT_LIVE}}}&youtubePreferManual={{{YT_MANUAL}}}&injectTranslated={{{PURE_TRACK}}}&bilingualOrder={{{ORDER}}}&cacheEnabled={{{CACHE}}}&debug={{{DEBUG}}}";
const shadowParameters = [
  { key: "SOURCE", value: "auto", options: ["auto", "en", "ja", "ko", "es", "fr", "de", "it", "pt", "ru", "ar", "hi", "th", "vi", "id", "zh-CN", "zh-TW"], description: "源字幕语言；auto 自动识别" },
  { key: "TARGET", value: "zh-CN", options: ["zh-CN", "zh-TW", "en", "ja", "ko", "es", "fr", "de", "it", "pt", "ru", "ar", "hi", "th", "vi", "id"], description: "翻译目标语言" },
  { key: "TRACK_NAME", value: "Translate-zh", options: ["Translate-zh", "中文双语", "双语字幕", "中文字幕"], description: "字幕菜单中显示的翻译轨名称" },
  { key: "PROVIDER", value: "google-free", options: ["google-free", "google-cloud", "deepl", "azure", "libretranslate", "openai", "openai-compatible", "gemini", "custom-json"], description: "翻译引擎；API Key 在 gss.local 保存" },
  { key: "PLATFORMS", value: "all", options: ["all", "discovery", "max", "disney", "prime", "apple-tv-plus", "apple-fitness", "apple-tv", "youtube|youtube-tv", "paramount|paramount-live", "peacock", "hulu", "fubo", "ted", "bbc", "viki", "tubi", "pluto", "crunchyroll", "dazn", "plex"], description: "启用平台；组合预设使用竖线分隔" },
  { key: "DISCOVERY_MODE", value: "full", options: ["full", "hls-only", "off"], description: "Discovery+ 处理范围；始终覆盖 gss.local 旧设置" },
  { key: "FORMATS", value: "all", options: ["all", "youtube", "vtt", "srt", "ttml", "ass", "json"], description: "启用字幕格式" },
  { key: "GENERIC", value: "false", options: ["false", "true"], description: "通用 HLS/DASH 检查" },
  { key: "YT_STRATEGY", value: "direct", options: ["direct", "virtual"], description: "YouTube 字幕接管方式" },
  { key: "YT_ASR", value: "true", options: ["true", "false"], description: "允许 YouTube 自动生成字幕" },
  { key: "YT_LIVE", value: "true", options: ["true", "false"], description: "处理 YouTube 直播字幕" },
  { key: "YT_MANUAL", value: "true", options: ["true", "false"], description: "优先选择 YouTube 人工字幕" },
  { key: "PURE_TRACK", value: "false", options: ["false", "true"], description: "额外显示纯翻译字幕轨" },
  { key: "ORDER", value: "translation-first", options: ["translation-first", "original-first"], description: "双语字幕显示顺序" },
  { key: "CACHE", value: "true", options: ["true", "false"], description: "启用翻译缓存" },
  { key: "DEBUG", value: "false", options: ["false", "true"], description: "输出调试日志" }
];
const shadowArgumentHeader = shadowParameters.map((item) => `${item.key}:${item.value}`).join(", ");
const shadowArgumentDescription = shadowParameters
  .map((item) => `${item.key}: [${item.options.join(", ")}]\\n${item.description}`)
  .join("\\n\\n");

const surge = `#!name=General Stream Subtitle\n#!desc=多平台 HLS/DASH、多字幕格式、多翻译引擎（v${pkg.version}）\n#!author=dxy0218 & contributors\n#!homepage=${repo}\n#!arguments=SOURCE=auto&TARGET=zh-CN&TRACK_NAME=Translate-zh&PROVIDER=google-free&PLATFORMS=all&FORMATS=all&GENERIC=false&YT_STRATEGY=direct&YT_ASR=true&YT_LIVE=true&YT_MANUAL=true&PURE_TRACK=false&ORDER=translation-first&CACHE=true&DEBUG=false\n\n[General]\nforce-http-engine-hosts = %APPEND% ${forceHttpHosts}\n\n[Script]\nGSS Manifest = type=http-response, pattern=${manifestPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${surgeArgs}\nGSS Pluto Master = type=http-response, pattern=${plutoMasterPattern}, requires-body=1, max-size=4194304, timeout=20, script-path=${manifestUrl}, argument=${surgeArgs}\nGSS Paramount Live Manifest = type=http-response, pattern=${paramountManifestPattern}, requires-body=1, max-size=4194304, timeout=20, script-path=${manifestUrl}, argument=${surgeArgs}\nGSS Paramount Playback = type=http-response, pattern=${paramountPlaybackPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${surgeArgs}\nGSS Max Discovery Playback = type=http-response, pattern=${warnerPlaybackPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${surgeArgs}\nGSS Gateway = type=http-request, pattern=${gatewayPattern}, requires-body=1, timeout=90, script-path=${gatewayUrl}, argument=${surgeArgs}
GSS YouTube Player = type=http-response, pattern=${youtubePlayerPattern}, requires-body=1, max-size=4194304, timeout=30, script-path=${youtubeUrl}, argument=${surgeArgs}
GSS YouTube Caption = type=http-response, pattern=${youtubeCaptionPattern}, requires-body=1, max-size=4194304, timeout=90, script-path=${youtubeCaptionUrl}, argument=${surgeArgs}\n\n[MITM]\nhostname = %APPEND% ${mitmHosts}\n`;
const loon = `#!name=General Stream Subtitle\n#!desc=多平台 HLS/DASH、多字幕格式、多翻译引擎（v${pkg.version}）\n#!author=dxy0218 & contributors\n#!homepage=${repo}\n\n[Script]\nhttp-response ${manifestPattern} script-path=${manifestUrl}, timeout=25, requires-body=true, argument=${defaultArgs}, tag=GSS Manifest, enable=true\nhttp-response ${plutoMasterPattern} script-path=${manifestUrl}, timeout=20, requires-body=true, argument=${defaultArgs}, tag=GSS Pluto Master, enable=true\nhttp-response ${paramountManifestPattern} script-path=${manifestUrl}, timeout=20, requires-body=true, argument=${defaultArgs}, tag=GSS Paramount Live Manifest, enable=true\nhttp-response ${paramountPlaybackPattern} script-path=${manifestUrl}, timeout=25, requires-body=true, argument=${defaultArgs}, tag=GSS Paramount Playback, enable=true\nhttp-response ${warnerPlaybackPattern} script-path=${manifestUrl}, timeout=25, requires-body=true, argument=${defaultArgs}, tag=GSS Max Discovery Playback, enable=true\nhttp-request ${gatewayPattern} script-path=${gatewayUrl}, timeout=90, requires-body=true, argument=${defaultArgs}, tag=GSS Gateway, enable=true
http-response ${youtubePlayerPattern} script-path=${youtubeUrl}, timeout=30, requires-body=true, argument=${defaultArgs}, tag=GSS YouTube Player, enable=true
http-response ${youtubeCaptionPattern} script-path=${youtubeCaptionUrl}, timeout=90, requires-body=true, argument=${defaultArgs}, tag=GSS YouTube Caption, enable=true\n\n[MITM]\nhostname = ${mitmHosts}\n`;
const shadowrocket = `#!name=General Stream Subtitle\n#!desc=多平台 HLS/DASH、多字幕格式、多翻译引擎（v${pkg.version}）\n#!author=dxy0218 & contributors\n#!homepage=${repo}\n#!arguments=${shadowArgumentHeader}\n#!arguments-desc=${shadowArgumentDescription}\n\n[Script]\nGSS Manifest = type=http-response, pattern=${manifestPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${shadowArgs}\nGSS Pluto Master = type=http-response, pattern=${plutoMasterPattern}, requires-body=1, max-size=4194304, timeout=20, script-path=${manifestUrl}, argument=${shadowArgs}\nGSS Paramount Live Manifest = type=http-response, pattern=${paramountManifestPattern}, requires-body=1, max-size=4194304, timeout=20, script-path=${manifestUrl}, argument=${shadowArgs}\nGSS Paramount Playback = type=http-response, pattern=${paramountPlaybackPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${shadowArgs}\nGSS Max Discovery Playback = type=http-response, pattern=${warnerPlaybackPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${shadowArgs}\nGSS Gateway = type=http-request, pattern=${gatewayPattern}, requires-body=1, timeout=90, script-path=${gatewayUrl}, argument=${shadowArgs}
GSS YouTube Player = type=http-response, pattern=${youtubePlayerPattern}, requires-body=1, max-size=4194304, timeout=30, script-path=${youtubeUrl}, argument=${shadowArgs}
GSS YouTube Caption = type=http-response, pattern=${youtubeCaptionPattern}, requires-body=1, max-size=4194304, timeout=90, script-path=${youtubeCaptionUrl}, argument=${shadowArgs}\n\n[MITM]\nhostname = %APPEND% ${mitmHosts}\n`;

const surgeModule = surge.replace("PLATFORMS=all&FORMATS=all", "PLATFORMS=all&DISCOVERY_MODE=full&FORMATS=all");
const shadowrocketModule = shadowrocket;

fs.mkdirSync(path.join(root, "modules"), { recursive: true });
fs.writeFileSync(path.join(root, "modules", "GeneralStreamSubtitle.sgmodule"), surgeModule);
fs.writeFileSync(path.join(root, "modules", "GeneralStreamSubtitle.plugin"), loon);
fs.writeFileSync(path.join(root, "modules", "GeneralStreamSubtitle.module"), shadowrocketModule);
console.log(`Built General Stream Subtitle ${pkg.version}`);
