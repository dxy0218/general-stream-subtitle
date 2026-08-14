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
  const distRoot = path.join(root, "dist");
  const versionedDistRoot = path.join(distRoot, `v${pkg.version}`);
  fs.mkdirSync(versionedDistRoot, { recursive: true });
  fs.writeFileSync(path.join(distRoot, `${name}.js`), content);
  fs.writeFileSync(path.join(versionedDistRoot, `${name}.js`), content);
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

const manifestPattern = String.raw`^https?:\/\/(?!(?:[^\/]+\.)*(?:pluto\.tv|plutotv\.net|pplus\.paramount\.tech|paramount\.tech|paramountplus\.com|cbsaavideo\.com|cbsivideo\.com|cbs\.com|max\.com|discomax\.com|h264\.io|hbomaxcdn\.com|api\.hbo\.com|uplynk\.com|pv-cdn\.net|aiv-cdn\.net|hulustream\.com|huluim\.com)(?::\d+)?\/).+\.(?:m3u8|mpd)(?:\?.*)?$`;
const plutoHlsPattern = String.raw`^https?:\/\/(?:(?:[^\/]+\.)*prd\.pluto\.tv|stitcher-ipv4\.pluto\.tv|service-stitcher\.clusters\.pluto\.tv|stitcher\.pluto\.tv|(?:[^\/]+\.)*plutotv\.net)\/.*\.m3u8(?:\?.*)?$`;
const primeHlsPattern = String.raw`^https?:\/\/(?:(?:[^\/]+\.)*hls\.(?:pv-cdn|row\.aiv-cdn)\.net|avodhlss3ww-a\.akamaihd\.net|(?:d1v5ir2lpwr8os|d22qjgkvxw22r6|d25xi40x97liuc|d27xxe7juh1us6|dmqdd6hw24ucf)\.cloudfront\.net)\/.*\.m3u8(?:\?.*)?$`;
const primeDashPattern = String.raw`^https?:\/\/(?:[^\/]+\.)*dash\.row\.aiv-cdn\.net\/.*\.mpd(?:\?.*)?$`;
const huluHlsPattern = String.raw`^https?:\/\/(?:(?:vodmanifest|manifest-dp|livemanifest-f|live-sc)\.hulustream\.com|assets\.huluim\.com|assetshuluimcom-a\.akamaihd\.net)\/.*\.m3u8(?:\?.*)?$`;
const paramountHlsPattern = String.raw`^https?:\/\/(?:(?:[^\/]+\.)*(?:pplus\.paramount\.tech|paramount\.tech|cbsaavideo\.com|cbsivideo\.com)|(?:[^\/.]+-pplus|cc)\.cbs\.com|cbsi\.live\.ott\.irdeto\.com)\/.*\.m3u8(?:\?.*)?$`;
const paramountPlaybackPattern = String.raw`^https?:\/\/(?:[^\/]+\.)*(?:pplus\.paramount\.tech|paramount\.tech|paramountplus\.com|cbsaavideo\.com|cbsivideo\.com|cbs\.com)\/.*(?:playback|stream|live|linear|channel|station|session|manifest).*`;
// Paramount's Apple clients obtain the playback description before AVPlayer
// opens the CDN. Keep this response rule limited to the VOD metadata endpoint;
// authentication, profile and account paths on the same host are excluded.
// iPhone/iPad use video/cid metadata, while the current tvOS app identifies
// itself as the single platform token "appletvtvos". Its show page first uses
// dynamicplay, then the selected episode is resolved by content/playability.
// Keep the rule limited to these VOD description endpoints so account, DRM and
// general catalogue JSON stay out.
const paramountApplePlaybackPattern = String.raw`^https?:\/\/www\.paramountplus\.com\/apps-api\/v\d+(?:\.\d+)*\/(?:iphone|ipad|ios|appletv|tvos|appletvtvos)\/(?:video\/cid\/[^\/?#]+|dynamicplay\/(?:show|movie)\/[^\/?#]+|content\/playability)\.json(?:\?.*)?$`;
// Only media delivery hosts and explicit manifest files are inspected. App,
// account, playback-session, GraphQL and DRM endpoints stay outside the rule.
const warnerMediaPattern = String.raw`^https?:\/\/(?:(?:[^\/]+\.)*(?:prod\.media\.max\.com|prd\.media\.max\.com|prod\.media\.h264\.io|prd\.media\.h264\.io|hbomaxcdn\.com)|manifests(?:\.v2)?\.api\.hbo\.com|[^\/.]*discovery[^\/.]*\.uplynk\.com|(?:dplus|discovery)[^\/.]*\.(?:h264\.io|akamaized\.net))\/.*\.(?:m3u8|mpd)(?:\?.*)?$`;
const gatewayGetPattern = String.raw`^https?:\/\/(?:example\.com|gss\.local|127\.0\.0\.1(?::6170)?|localhost(?::6170)?)\/(?!save(?:[\/?#]|$)).*`;
const gatewaySavePattern = String.raw`^https?:\/\/(?:example\.com|gss\.local|127\.0\.0\.1(?::6170)?|localhost(?::6170)?)\/save(?:\?.*)?$`;
const youtubePlayerPattern = String.raw`^https?:\/\/(?:www\.youtube\.com|m\.youtube\.com|music\.youtube\.com|tv\.youtube\.com|youtubei\.googleapis\.com)\/youtubei\/v1\/player(?:\?.*)?$`;
const youtubeCaptionPattern = String.raw`^https?:\/\/(?:www\.youtube\.com|m\.youtube\.com|music\.youtube\.com|tv\.youtube\.com)\/api\/timedtext\?.*(?:gss_mode|gss_v)=.*`;
const mitmHosts = [
  // Apple Music and Apple TV share play.itunes.apple.com. Intercepting it from
  // the default module triggers Apple Music's certificate validation, so Apple
  // media hosts must remain opt-in rather than part of the safe default.
  "*.prod.media.max.com", "*.prd.media.max.com", "*.prod.media.h264.io", "*.prd.media.h264.io", "*.hbomaxcdn.com", "manifests.api.hbo.com", "manifests.v2.api.hbo.com",
  "*.media.dssott.com", "*.prod.dssott.com", "*.media.starott.com", "*.prod.starott.com", "*.media.dssedge.com", "*.prod.dssedge.com",
  "*.hls.pv-cdn.net", "*.hls.row.aiv-cdn.net", "*.dash.row.aiv-cdn.net", "*avodhlss3ww-a.akamaihd.net", "cf-timedtext.aux.pv-cdn.net",
  "d1v5ir2lpwr8os.cloudfront.net", "d22qjgkvxw22r6.cloudfront.net", "d25xi40x97liuc.cloudfront.net", "d27xxe7juh1us6.cloudfront.net", "dmqdd6hw24ucf.cloudfront.net",
  "vodmanifest.hulustream.com", "manifest-dp.hulustream.com", "livemanifest-f.hulustream.com", "live-sc.hulustream.com", "assets.huluim.com", "assetshuluimcom-a.akamaihd.net", "*.pplus.paramount.tech", "*.paramount.tech", "*.paramountplus.com", "*.cbsaavideo.com", "*.cbsivideo.com", "*.cbs.com", "cbsi.live.ott.irdeto.com",
  // Discovery app, account, and device hosts remain outside MITM. Only known
  // Discovery media CDN host shapes are intercepted by default.
  "*.cdn.peacocktv.com", "*.stream.peacocktv.com", "*discovery*.uplynk.com", "dplus-*.akamaized.net", "dplus-*.h264.io", "discovery-*.h264.io",
  "*.fubo.tv", "hls.ted.com",
  "vod-*.live.cf.md.bbci.co.uk", "vod-*-live.akamaized.net", "manifest-viki.viki.io", "*.tubi.video", "*.tubitv.com", "stitcher-ipv4.pluto.tv", "service-stitcher.clusters.pluto.tv", "stitcher.pluto.tv", "*.prd.pluto.tv", "*.plutotv.net",
  "*.crunchyroll.com", "*.vrv.co", "*.dazn.com", "*.dazn-api.com", "*.plex.direct",
  "*.youtube.com", "youtubei.googleapis.com", "example.com", "gss.local"
].join(", ");
const shadowMitmHosts = [
  "*.prod.media.max.com", "*.prd.media.max.com", "*.prod.media.h264.io", "*.prd.media.h264.io", "*.hbomaxcdn.com", "manifests.api.hbo.com", "manifests.v2.api.hbo.com",
  "*discovery*.uplynk.com", "dplus-*.akamaized.net", "dplus-*.h264.io", "discovery-*.h264.io",
  "stitcher-ipv4.pluto.tv", "service-stitcher.clusters.pluto.tv", "stitcher.pluto.tv", "*.prd.pluto.tv", "*.plutotv.net",
  "*.hls.pv-cdn.net", "*.hls.row.aiv-cdn.net", "*avodhlss3ww-a.akamaihd.net",
  "d1v5ir2lpwr8os.cloudfront.net", "d22qjgkvxw22r6.cloudfront.net", "d25xi40x97liuc.cloudfront.net", "d27xxe7juh1us6.cloudfront.net", "dmqdd6hw24ucf.cloudfront.net",
  "vodmanifest.hulustream.com", "manifest-dp.hulustream.com", "livemanifest-f.hulustream.com", "live-sc.hulustream.com", "assets.huluim.com", "assetshuluimcom-a.akamaihd.net",
  "*.pplus.paramount.tech", "*.paramount.tech", "*.cbsaavideo.com", "*.cbsivideo.com", "*-pplus.cbs.com", "cc.cbs.com", "cbsi.live.ott.irdeto.com", "www.paramountplus.com",
  "*.media.dssott.com", "*.prod.dssott.com", "*.media.starott.com", "*.prod.starott.com", "*.media.dssedge.com", "*.prod.dssedge.com",
  "*.cdn.peacocktv.com", "*.stream.peacocktv.com", "*-vod.fubo.tv", "hls.ted.com",
  "vod-*.live.cf.md.bbci.co.uk", "vod-*-live.akamaized.net", "manifest-viki.viki.io", "*.tubi.video", "*.tubitv.com",
  "*.crunchyroll.com", "*.vrv.co", "*.dazn.com", "*.dazn-api.com", "*.plex.direct",
  // YouTube's tvOS clients reject Shadowrocket's MITM certificate and report
  // an offline state. Keep YouTube interception in the Surge/Loon modules, but
  // never append those hosts from the Apple TV-safe Shadowrocket preset.
  "example.com", "gss.local"
].join(", ");
const forceHttpHosts = [
  "*.hls.pv-cdn.net", "*.hls.row.aiv-cdn.net", "*.dash.row.aiv-cdn.net", "*avodhlss3ww-a.akamaihd.net", "cf-timedtext.aux.pv-cdn.net",
  "d1v5ir2lpwr8os.cloudfront.net", "d22qjgkvxw22r6.cloudfront.net", "d25xi40x97liuc.cloudfront.net", "d27xxe7juh1us6.cloudfront.net", "dmqdd6hw24ucf.cloudfront.net"
].join(", ");
// Some proxy clients cache scripts by pathname and ignore query parameters.
// Publish immutable runtime paths on every release so an updated module cannot
// accidentally keep a gateway or manifest bundle from an older version.
const versionedDistUrl = `${rawBase}/dist/v${encodeURIComponent(pkg.version)}`;
const manifestUrl = `${versionedDistUrl}/manifest.js`;
const gatewayUrl = `${versionedDistUrl}/gateway.js`;
const youtubeUrl = `${versionedDistUrl}/youtube.js`;
const youtubeCaptionUrl = `${versionedDistUrl}/youtube-caption.js`;
const defaultArgs = "source=auto&target=zh-CN&trackName=Translate-zh&provider=google-free&platforms=all&discoveryMode=full&safePlayback=false&trackStrategy=replace-source&formats=all&genericMode=false&youtubeStrategy=direct&youtubeUseAsr=true&youtubeLive=true&youtubePreferManual=true&injectTranslated=false&bilingualOrder=translation-first&cacheEnabled=true&logEnabled=true&debug=false";
const surgeArgs = "source=%SOURCE%&target=%TARGET%&trackName=%TRACK_NAME%&provider=%PROVIDER%&platforms=%PLATFORMS%&discoveryMode=%DISCOVERY_MODE%&trackStrategy=%TRACK_STRATEGY%&formats=%FORMATS%&genericMode=%GENERIC%&youtubeStrategy=%YT_STRATEGY%&youtubeUseAsr=%YT_ASR%&youtubeLive=%YT_LIVE%&youtubePreferManual=%YT_MANUAL%&injectTranslated=%PURE_TRACK%&bilingualOrder=%ORDER%&cacheEnabled=%CACHE%&logEnabled=%LOGS%&debug=%DEBUG%";
const shadowArgs = "presetMode=true&safePlayback=true&trackStrategy=replace-source&maxReplaceSource=true&paramountReplaceSource=true&hyMt2Preset={{{HY_MT2}}}&platformDiscovery={{{DISCOVERY}}}&discoveryHlsOnly={{{DISCOVERY_HLS_ONLY}}}&platformMax={{{MAX}}}&platformPluto={{{PLUTO}}}&platformPrime={{{PRIME}}}&platformHulu={{{HULU}}}&platformParamount={{{PARAMOUNT}}}&platformOther={{{OTHER}}}&injectTranslated={{{PURE_TRACK}}}&cacheEnabled={{{CACHE}}}&logEnabled={{{LOGS}}}&debug={{{DEBUG}}}";
const shadowSwitches = [
  { key: "DISCOVERY", value: false, description: "Discovery+ 实验适配；默认关闭，打开后仅处理 HLS 主清单" },
  { key: "DISCOVERY_HLS_ONLY", value: true, description: "Discovery+ 播放保护；保持开启以跳过 DASH 和播放 JSON" },
  { key: "MAX", value: true, description: "Max / HBO Max HLS 中文字幕" },
  { key: "PLUTO", value: true, description: "Pluto TV HLS 中文字幕" },
  { key: "PRIME", value: true, description: "Amazon Prime Video HLS 中文字幕" },
  { key: "HULU", value: true, description: "Hulu HLS 中文字幕" },
  { key: "HY_MT2", value: false, description: "使用私有 Hy-MT2 翻译服务；先在管理页保存 Endpoint 和 API Key" },
  { key: "PURE_TRACK", value: false, description: "额外显示纯翻译字幕轨" },
  { key: "CACHE", value: true, description: "启用翻译缓存" },
  { key: "LOGS", value: true, description: "保存脱敏运行日志，便于排查播放和字幕错误" },
  { key: "DEBUG", value: false, description: "输出调试日志" }
];
shadowSwitches.splice(6, 0, { key: "PARAMOUNT", value: true, description: "Paramount+ HLS 中文字幕" });
shadowSwitches.splice(7, 0, { key: "OTHER", value: true, description: "其他 HLS 平台：Disney+、Peacock、Fubo、TED、BBC、Viki、Tubi、Crunchyroll、DAZN、Plex" });
const shadowArgumentHeader = shadowSwitches.map((item) => `${item.key}:${item.value}`).join(", ");
const shadowArgumentDescription = shadowSwitches.map((item) => `${item.key}: ${item.description}`).join("\\n\\n");

const surge = `#!name=General Stream Subtitle
#!desc=多平台 HLS/DASH、多字幕格式、多翻译引擎（v${pkg.version}）
#!author=dxy0218 & contributors
#!homepage=${repo}
#!arguments=SOURCE=auto&TARGET=zh-CN&TRACK_NAME=Translate-zh&PROVIDER=google-free&PLATFORMS=all&DISCOVERY_MODE=full&TRACK_STRATEGY=replace-source&FORMATS=all&GENERIC=false&YT_STRATEGY=direct&YT_ASR=true&YT_LIVE=true&YT_MANUAL=true&PURE_TRACK=false&ORDER=translation-first&CACHE=true&LOGS=true&DEBUG=false

[General]
force-http-engine-hosts = %APPEND% ${forceHttpHosts}

[Script]
GSS Manifest = type=http-response, pattern=${manifestPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${surgeArgs}
GSS Max Discovery Media = type=http-response, pattern=${warnerMediaPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${surgeArgs}
GSS Pluto HLS = type=http-response, pattern=${plutoHlsPattern}, requires-body=1, max-size=4194304, timeout=20, script-path=${manifestUrl}, argument=${surgeArgs}
GSS Prime Video HLS = type=http-response, pattern=${primeHlsPattern}, requires-body=1, max-size=4194304, timeout=20, script-path=${manifestUrl}, argument=${surgeArgs}
GSS Prime Video DASH = type=http-response, pattern=${primeDashPattern}, requires-body=1, max-size=4194304, timeout=20, script-path=${manifestUrl}, argument=${surgeArgs}
GSS Hulu HLS = type=http-response, pattern=${huluHlsPattern}, requires-body=1, max-size=4194304, timeout=20, script-path=${manifestUrl}, argument=${surgeArgs}
GSS Paramount HLS = type=http-response, pattern=${paramountHlsPattern}, requires-body=1, max-size=4194304, timeout=20, script-path=${manifestUrl}, argument=${surgeArgs}
GSS Paramount Playback = type=http-response, pattern=${paramountPlaybackPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${surgeArgs}
GSS Gateway = type=http-request, pattern=${gatewayGetPattern}, requires-body=0, timeout=90, script-path=${gatewayUrl}, argument=${surgeArgs}
GSS Gateway Save = type=http-request, pattern=${gatewaySavePattern}, requires-body=1, timeout=90, script-path=${gatewayUrl}, argument=${surgeArgs}
GSS YouTube Player = type=http-response, pattern=${youtubePlayerPattern}, requires-body=1, max-size=4194304, timeout=30, script-path=${youtubeUrl}, argument=${surgeArgs}
GSS YouTube Caption = type=http-response, pattern=${youtubeCaptionPattern}, requires-body=1, max-size=4194304, timeout=90, script-path=${youtubeCaptionUrl}, argument=${surgeArgs}

[MITM]
hostname = %APPEND% ${mitmHosts}
`;
const loon = `#!name=General Stream Subtitle
#!desc=多平台 HLS/DASH、多字幕格式、多翻译引擎（v${pkg.version}）
#!author=dxy0218 & contributors
#!homepage=${repo}

[Script]
http-response ${manifestPattern} script-path=${manifestUrl}, timeout=25, requires-body=true, argument=${defaultArgs}, tag=GSS Manifest, enable=true
http-response ${warnerMediaPattern} script-path=${manifestUrl}, timeout=25, requires-body=true, argument=${defaultArgs}, tag=GSS Max Discovery Media, enable=true
http-response ${plutoHlsPattern} script-path=${manifestUrl}, timeout=20, requires-body=true, argument=${defaultArgs}, tag=GSS Pluto HLS, enable=true
http-response ${primeHlsPattern} script-path=${manifestUrl}, timeout=20, requires-body=true, argument=${defaultArgs}, tag=GSS Prime Video HLS, enable=true
http-response ${primeDashPattern} script-path=${manifestUrl}, timeout=20, requires-body=true, argument=${defaultArgs}, tag=GSS Prime Video DASH, enable=true
http-response ${huluHlsPattern} script-path=${manifestUrl}, timeout=20, requires-body=true, argument=${defaultArgs}, tag=GSS Hulu HLS, enable=true
http-response ${paramountHlsPattern} script-path=${manifestUrl}, timeout=20, requires-body=true, argument=${defaultArgs}, tag=GSS Paramount HLS, enable=true
http-response ${paramountPlaybackPattern} script-path=${manifestUrl}, timeout=25, requires-body=true, argument=${defaultArgs}, tag=GSS Paramount Playback, enable=true
http-request ${gatewayGetPattern} script-path=${gatewayUrl}, timeout=90, requires-body=false, argument=${defaultArgs}, tag=GSS Gateway, enable=true
http-request ${gatewaySavePattern} script-path=${gatewayUrl}, timeout=90, requires-body=true, argument=${defaultArgs}, tag=GSS Gateway Save, enable=true
http-response ${youtubePlayerPattern} script-path=${youtubeUrl}, timeout=30, requires-body=true, argument=${defaultArgs}, tag=GSS YouTube Player, enable=true
http-response ${youtubeCaptionPattern} script-path=${youtubeCaptionUrl}, timeout=90, requires-body=true, argument=${defaultArgs}, tag=GSS YouTube Caption, enable=true

[MITM]
hostname = ${mitmHosts}
`;
const shadowrocket = `#!name=General Stream Subtitle
#!desc=Apple TV 播放优先的 HLS 中文字幕安全适配（v${pkg.version}）
#!author=dxy0218 & contributors
#!homepage=${repo}
#!arguments=${shadowArgumentHeader}
#!arguments-desc=${shadowArgumentDescription}

[Script]
GSS Other Media Manifest = type=http-response, pattern=${manifestPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${shadowArgs}
GSS Max Discovery Media = type=http-response, pattern=${warnerMediaPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${shadowArgs}
GSS Pluto HLS = type=http-response, pattern=${plutoHlsPattern}, requires-body=1, max-size=4194304, timeout=20, script-path=${manifestUrl}, argument=${shadowArgs}
GSS Prime Video HLS = type=http-response, pattern=${primeHlsPattern}, requires-body=1, max-size=4194304, timeout=20, script-path=${manifestUrl}, argument=${shadowArgs}
GSS Hulu HLS = type=http-response, pattern=${huluHlsPattern}, requires-body=1, max-size=4194304, timeout=20, script-path=${manifestUrl}, argument=${shadowArgs}
GSS Paramount HLS = type=http-response, pattern=${paramountHlsPattern}, requires-body=1, max-size=4194304, timeout=20, script-path=${manifestUrl}, argument=${shadowArgs}
GSS Paramount Playback Metadata = type=http-response, pattern=${paramountApplePlaybackPattern}, requires-body=1, max-size=4194304, timeout=25, script-path=${manifestUrl}, argument=${shadowArgs}
GSS Gateway = type=http-request, pattern=${gatewayGetPattern}, requires-body=0, timeout=90, script-path=${gatewayUrl}, argument=${shadowArgs}
GSS Gateway Save = type=http-request, pattern=${gatewaySavePattern}, requires-body=1, timeout=90, script-path=${gatewayUrl}, argument=${shadowArgs}

[Rule]
# Pluto's segment CDN is poisoned as 0.0.0.0 by some local DNS resolvers.
# Resolve it through the selected proxy so video, keys and captions stay usable.
DOMAIN-SUFFIX,plutotv.net,PROXY,force-remote-dns

[MITM]
hostname = %APPEND% ${shadowMitmHosts}
`;

const surgeModule = surge;
const shadowrocketModule = shadowrocket;
const versionedShadowrocketModule = shadowrocket.replace(
  "#!name=General Stream Subtitle",
  `#!name=General Stream Subtitle v${pkg.version}`
);

fs.mkdirSync(path.join(root, "modules"), { recursive: true });
fs.writeFileSync(path.join(root, "modules", "GeneralStreamSubtitle.sgmodule"), surgeModule);
fs.writeFileSync(path.join(root, "modules", "GeneralStreamSubtitle.plugin"), loon);
fs.writeFileSync(path.join(root, "modules", "GeneralStreamSubtitle.module"), shadowrocketModule);
fs.writeFileSync(path.join(root, "modules", `GeneralStreamSubtitle-v${pkg.version}.module`), versionedShadowrocketModule);
console.log(`Built General Stream Subtitle ${pkg.version}`);
