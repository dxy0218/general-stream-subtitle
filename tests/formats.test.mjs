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

test("WebVTT cue identifiers never become translated cue text", () => {
  const GSS = load();
  const body = [
    "WEBVTT",
    "X-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000",
    "",
    "1",
    "00:00:01.000 --> 00:00:03.000 align:middle",
    "Hello",
    "",
    "2",
    "00:00:04.000 --> 00:00:06.000",
    "World",
    ""
  ].join("\n");
  const parsed = GSS.VTT.parse(body);
  assert.deepEqual(Array.from(GSS.VTT.uniqueTexts(parsed.cues)), ["Hello", "World"]);
  const output = GSS.VTT.render(parsed, ["\u4f60\u597d\n\n", "\u4e16\u754c"], "bilingual", "translation-first");
  const reparsed = GSS.VTT.parse(output);
  assert.equal(reparsed.cues.length, 2);
  assert.deepEqual(Array.from(reparsed.cues, (cue) => cue.text), ["\u4f60\u597d\nHello", "\u4e16\u754c\nWorld"]);
  assert.equal((output.match(/^1$/gm) || []).length, 1);
  assert.equal((output.match(/^2$/gm) || []).length, 1);
  assert.match(output, /X-TIMESTAMP-MAP=MPEGTS:900000/);
});

test("validates the WebVTT header and preserves the cue count", () => {
  const GSS = load();
  const body = fs.readFileSync(path.join(root,"tests/fixtures/sample.vtt"),"utf8");
  const parsed = GSS.VTT.parse(body);
  const valid = GSS.VTT.validate(body, parsed.cues.length);
  assert.equal(valid.valid, true);
  assert.equal(valid.headerValid, true);
  assert.equal(valid.cueCount, parsed.cues.length);
  assert.equal(valid.cueCountValid, true);
  assert.equal(GSS.VTT.validate(body.replace(/^WEBVTT/, "INVALID"), parsed.cues.length).valid, false);
  assert.equal(GSS.VTT.validate(body, parsed.cues.length + 1).valid, false);
});
