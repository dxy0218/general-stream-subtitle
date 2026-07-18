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

bundle("manifest", [
  "src/shared/runtime.js", "src/shared/cache.js", "src/shared/config.js", "src/shared/logger.js", "src/shared/url.js",
  "src/manifest/m3u8.js", "src/manifest/main.js"
]);

bundle("gateway", [
  "src/shared/runtime.js", "src/shared/cache.js", "src/shared/config.js", "src/shared/logger.js", "src/shared/url.js",
  "src/shared/google.js", "src/manifest/m3u8.js", "src/subtitle/vtt.js", "src/subtitle/translate.js",
  "src/gateway/admin.js", "src/gateway/main.js"
]);

const domainPattern = String.raw`(?:[^\/]+\.)?(?:max\.com|h264\.io|hbomaxcdn\.com|api\.hbo\.com)`;
const manifestPattern = String.raw`^https?:\/\/${domainPattern}\/.*\.m3u8(?:\?.*)?$`;
const gatewayPattern = String.raw`^https?:\/\/(?:gss\.local|127\.0\.0\.1(?::6170)?|localhost(?::6170)?)\/.*`;
const mitmHosts = "*.max.com, *.h264.io, *.hbomaxcdn.com, *.api.hbo.com, gss.local";
const manifestUrl = `${rawBase}/dist/manifest.js`;
const gatewayUrl = `${rawBase}/dist/gateway.js`;
const defaultArgs = "source=en&target=zh-CN&trackName=Translate-zh&injectTranslated=false&bilingualOrder=translation-first&cacheEnabled=true&debug=true";

const surgeArgs = "source=en&target=%TARGET%&trackName=%TRACK_NAME%&injectTranslated=%PURE_TRACK%&bilingualOrder=%ORDER%&cacheEnabled=%CACHE%&debug=%DEBUG%";
const surge = `#!name=General Stream Subtitle\n#!desc=为 Max 注入 Translate-zh 双语字幕轨（v${pkg.version}）\n#!author=dxy0218 & contributors\n#!homepage=${repo}\n#!arguments=TARGET=zh-CN&TRACK_NAME=Translate-zh&PURE_TRACK=false&ORDER=translation-first&CACHE=true&DEBUG=true\n\n[Script]\nGSS Manifest = type=http-response, pattern=${manifestPattern}, requires-body=1, max-size=2097152, timeout=15, script-path=${manifestUrl}, argument=${surgeArgs}\nGSS Gateway = type=http-request, pattern=${gatewayPattern}, timeout=60, script-path=${gatewayUrl}, argument=${surgeArgs}\n\n[MITM]\nhostname = %APPEND% ${mitmHosts}\n`;

const loon = `#!name=General Stream Subtitle\n#!desc=为 Max 注入 Translate-zh 双语字幕轨（v${pkg.version}）\n#!author=dxy0218 & contributors\n#!homepage=${repo}\n\n[Script]\nhttp-response ${manifestPattern} script-path=${manifestUrl}, timeout=15, requires-body=true, argument=${defaultArgs}, tag=GSS Manifest, enable=true\nhttp-request ${gatewayPattern} script-path=${gatewayUrl}, timeout=60, argument=${defaultArgs}, tag=GSS Gateway, enable=true\n\n[MITM]\nhostname = ${mitmHosts}\n`;

const shadowArgs = "source=en&target={{{TARGET}}}&trackName={{{TRACK_NAME}}}&injectTranslated={{{PURE_TRACK}}}&bilingualOrder={{{ORDER}}}&cacheEnabled={{{CACHE}}}&debug={{{DEBUG}}}";
const shadowrocket = `#!name=General Stream Subtitle\n#!desc=为 Max 注入 Translate-zh 双语字幕轨（v${pkg.version}）\n#!author=dxy0218 & contributors\n#!homepage=${repo}\n#!arguments=TARGET:zh-CN, TRACK_NAME:Translate-zh, PURE_TRACK:false, ORDER:translation-first, CACHE:true, DEBUG:true\n#!arguments-desc=TARGET：目标语言\\n\\nTRACK_NAME：字幕菜单名称\\n\\nPURE_TRACK：是否额外加入纯翻译字幕\\n\\nORDER：translation-first 或 original-first\\n\\nCACHE：翻译缓存\\n\\nDEBUG：调试日志\n\n[Script]\nGSS Manifest = type=http-response, pattern=${manifestPattern}, requires-body=1, max-size=2097152, timeout=15, script-path=${manifestUrl}, argument=${shadowArgs}\nGSS Gateway = type=http-request, pattern=${gatewayPattern}, timeout=60, script-path=${gatewayUrl}, argument=${shadowArgs}\n\n[MITM]\nhostname = %APPEND% ${mitmHosts}\n`;

fs.mkdirSync(path.join(root, "modules"), { recursive: true });
fs.writeFileSync(path.join(root, "modules", "GeneralStreamSubtitle.sgmodule"), surge);
fs.writeFileSync(path.join(root, "modules", "GeneralStreamSubtitle.plugin"), loon);
fs.writeFileSync(path.join(root, "modules", "GeneralStreamSubtitle.module"), shadowrocket);
console.log(`Built General Stream Subtitle ${pkg.version}`);
console.log(`Raw base: ${rawBase}`);
