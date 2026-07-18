import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
function load(){
  const files=["src/shared/runtime.js","src/shared/cache.js","src/shared/language.js","src/shared/config.js","src/shared/url.js","src/formats/registry.js","src/formats/vtt.js","src/formats/srt.js","src/formats/ttml.js","src/formats/ass.js","src/formats/json.js"];
  const context=vm.createContext({console,Date,Math,$persistentStore:{read(){return null;},write(){return true;}}});
  return vm.runInContext(`var GSS={};\n${files.map(f=>fs.readFileSync(path.join(root,f),"utf8")).join("\n")};GSS;`,context);
}
function check(file,url,type,expectedId){
  const GSS=load(), body=fs.readFileSync(path.join(root,"tests/fixtures",file),"utf8"), format=GSS.Formats.detect(body,url,type,GSS.DEFAULTS);
  assert.equal(format.id,expectedId);
  const parsed=format.parse(body), texts=GSS.Formats.uniqueTexts(parsed.cues);
  assert.ok(texts.length>0);
  const translations=texts.map((_,i)=>`译文${i+1}`);
  const output=format.render(parsed,translations,"bilingual","translation-first");
  assert.match(output,/译文1/);
}
test("supports WebVTT",()=>check("sample.vtt","https://x/sub.vtt","text/vtt","vtt"));
test("supports SRT",()=>check("sample.srt","https://x/sub.srt","application/x-subrip","srt"));
test("supports TTML/DFXP text",()=>check("sample.ttml","https://x/sub.ttml","application/ttml+xml","ttml"));
test("supports ASS/SSA",()=>check("sample.ass","https://x/sub.ass","text/plain","ass"));
test("supports generic JSON cues",()=>check("sample.json","https://x/sub.json","application/json","json"));
