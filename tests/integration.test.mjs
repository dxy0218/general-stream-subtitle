import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function run(relative, globals) {
  const context = vm.createContext({ console, Date, Math, ...globals });
  vm.runInContext(fs.readFileSync(path.join(root,relative),"utf8"),context);
  return context;
}

test("built manifest exposes Translate-zh", () => {
  const master=fs.readFileSync(path.join(root,"tests/fixtures/master.m3u8"),"utf8");
  const store=new Map(); let result;
  run("dist/manifest.js",{
    $request:{url:"https://cf.prod.media.max.com/title/hls.m3u8",headers:{}},
    $response:{body:master,headers:{"Content-Type":"application/vnd.apple.mpegurl","Content-Length":"10"}},
    $persistentStore:{read(k){return store.get(k)||null;},write(v,k){store.set(k,v);return true;}},
    $done(p){result=p;}
  });
  assert.match(result.body,/NAME="Translate-zh"/);
  assert.equal(result.headers["Content-Length"],undefined);
});

test("gateway fetches original VTT and returns bilingual translation", () => {
  const vtt=fs.readFileSync(path.join(root,"tests/fixtures/sample.vtt"),"utf8");
  const store=new Map(); let result; let calls=0;
  const origin="https://cdn.max.com/sub/1.vtt?token=abc";
  run("dist/gateway.js",{
    $request:{url:"https://gss.local/subtitle?origin="+encodeURIComponent(origin)+"&mode=bilingual&source=en&target=zh-CN",headers:{"User-Agent":"Max"}},
    $httpClient:{get(options,cb){calls++; if(options.url===origin) cb(null,{status:200,headers:{"Content-Type":"text/vtt"}},vtt); else cb(null,{status:200},JSON.stringify([[["[[GSS_0000]]\n你好。\n[[GSS_0001]]\n你好吗？","",null,null]]]));}},
    $persistentStore:{read(k){return store.get(k)||null;},write(v,k){store.set(k,v);return true;}},
    $done(p){result=p;}
  });
  assert.ok(calls>=2);
  assert.match(result.response.body,/你好。\nHello there\./);
  assert.match(result.response.body,/你好吗？\n<v Speaker>How are you\?<\/v>/);
});

test("local admin endpoint saves settings with its token", () => {
  const store=new Map([["GSS_ADMIN_TOKEN_V1","abc"]]); let result;
  run("dist/gateway.js",{
    $request:{url:"http://127.0.0.1:6170/save?token=abc&source=en&target=zh-TW&trackName=Translate-zh-TW&provider=google&bilingualOrder=original-first&enabled=true&injectTranslated=false&cacheEnabled=true&debug=false",headers:{}},
    $persistentStore:{read(k){return store.get(k)||null;},write(v,k){store.set(k,v);return true;}},
    $done(p){result=p;}
  });
  assert.equal(result.response.status,200);
  const saved=JSON.parse(store.get("GSS_SETTINGS_V1"));
  assert.equal(saved.target,"zh-TW");
  assert.equal(saved.trackName,"Translate-zh-TW");
  assert.equal(saved.bilingualOrder,"original-first");
});
