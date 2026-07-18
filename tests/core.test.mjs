import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(files) {
  const store = new Map();
  const context = vm.createContext({ console, Date, Math, $persistentStore: { read(k){return store.get(k)||null;}, write(v,k){store.set(k,v);return true;} } });
  const code = `var GSS = {};\n${files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n")}; GSS;`;
  return { GSS: vm.runInContext(code, context), store };
}

test("injects a visible Translate-zh bilingual track", () => {
  const { GSS } = load(["src/shared/runtime.js","src/shared/cache.js","src/shared/config.js","src/shared/url.js","src/manifest/m3u8.js"]);
  const body = fs.readFileSync(path.join(root,"tests/fixtures/master.m3u8"),"utf8");
  const output = GSS.M3U8.injectTracks(body,"https://cf.prod.media.max.com/title/hls.m3u8?sig=1",GSS.DEFAULTS,{info(){}});
  assert.match(output,/NAME="Translate-zh"/);
  assert.match(output,/https:\/\/gss\.local\/playlist\?origin=/);
  assert.doesNotMatch(output,/Translate-zh-only/);
  assert.match(decodeURIComponent(output),/subs\/en\/playlist\.m3u8\?token=abc/);
});

test("optionally injects a pure translated track", () => {
  const { GSS } = load(["src/shared/runtime.js","src/shared/cache.js","src/shared/config.js","src/shared/url.js","src/manifest/m3u8.js"]);
  const body = fs.readFileSync(path.join(root,"tests/fixtures/master.m3u8"),"utf8");
  const config = { ...GSS.DEFAULTS, injectTranslated:true };
  const output = GSS.M3U8.injectTracks(body,"https://cf.prod.media.max.com/title/hls.m3u8",config,{info(){}});
  assert.match(output,/Translate-zh-only/);
});

test("virtualizes every subtitle segment without touching signed origin URLs", () => {
  const { GSS } = load(["src/shared/runtime.js","src/shared/cache.js","src/shared/config.js","src/shared/url.js","src/manifest/m3u8.js"]);
  const body = fs.readFileSync(path.join(root,"tests/fixtures/media.m3u8"),"utf8");
  const output = GSS.M3U8.decorateSubtitlePlaylist(body,"https://cdn.max.com/subs/en/playlist.m3u8?token=playlist","bilingual","en","zh-CN",GSS.DEFAULTS,{info(){}});
  assert.equal((output.match(/https:\/\/gss\.local\/subtitle/g)||[]).length,2);
  assert.match(decodeURIComponent(output),/segment-001\.vtt\?token=abc/);
  assert.match(decodeURIComponent(output),/\/subs\/segments\/segment-002\.vtt\?token=def/);
});
