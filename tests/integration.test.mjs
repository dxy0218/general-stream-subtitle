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

test("built HLS manifest exposes Translate-zh on Max", () => {
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

test("built DASH manifest injects a direct text adaptation track", () => {
  const mpd=fs.readFileSync(path.join(root,"tests/fixtures/simple.mpd"),"utf8");
  const store=new Map(); let result;
  run("dist/manifest.js",{
    $request:{url:"https://video.viki.io/movie/manifest.mpd",headers:{}},
    $response:{body:mpd,headers:{"Content-Type":"application/dash+xml"}},
    $persistentStore:{read(k){return store.get(k)||null;},write(v,k){store.set(k,v);return true;}},
    $done(p){result=p;}
  });
  assert.match(result.body,/gss-[0-9a-f]+/);
  assert.match(result.body,/Translate-zh/);
  assert.match(result.body,/gss\.local\/subtitle/);
});

test("gateway translates WebVTT through Google free provider", () => {
  const vtt=fs.readFileSync(path.join(root,"tests/fixtures/sample.vtt"),"utf8");
  const store=new Map(); let result; let calls=0;
  const origin="https://cdn.max.com/sub/1.vtt?token=abc";
  run("dist/gateway.js",{
    $request:{url:"https://gss.local/subtitle?origin="+encodeURIComponent(origin)+"&mode=bilingual&source=en&target=zh-CN&platform=max",headers:{"User-Agent":"Max"}},
    $httpClient:{get(options,cb){calls++; if(options.url===origin) cb(null,{status:200,headers:{"Content-Type":"text/vtt"}},vtt); else cb(null,{status:200},JSON.stringify([[['[[GSS_0000]]\n你好。\n[[GSS_0001]]\n你好吗？','',null,null]]]));}},
    $persistentStore:{read(k){return store.get(k)||null;},write(v,k){store.set(k,v);return true;}},
    $done(p){result=p;}
  });
  assert.ok(calls>=2);
  assert.match(result.response.body,/你好。\nHello there\./);
  assert.match(result.response.body,/你好吗？\n<v Speaker>How are you\?<\/v>/);
});

test("gss.localhost serves the diagnostics endpoint without DNS", () => {
  const store=new Map(); let result;
  run("dist/gateway.js",{
    $request:{url:"http://gss.localhost/diagnostics",method:"GET",headers:{}},
    $persistentStore:{read(k){return store.get(k)||null;},write(v,k){store.set(k,v);return true;}},
    $done(p){result=p;}
  });
  assert.equal(result.response.status,200);
  assert.match(result.response.body,/"version":"0\.5\.3"/);
  assert.match(result.response.body,/"records":\[\]/);
});

test("admin POST saves provider, formats, platforms, and API key without exposing it", () => {
  const store=new Map([["GSS_ADMIN_TOKEN_V1","abc"]]); let result;
  const body = [
    "token=abc","source=auto","sourcePriority=en%2Cja%2Cko","target=zh-TW","trackName=Translate-zh-TW",
    "provider=deepl","providerApiKey=secret-key","providerEndpoint=https%3A%2F%2Fapi-free.deepl.com%2Fv2%2Ftranslate",
    "bilingualOrder=original-first","enabled=true","cacheEnabled=true","platform_max=true","platform_apple-fitness=true",
    "format_vtt=true","format_srt=true","format_ttml=true"
  ].join("&");
  run("dist/gateway.js",{
    $request:{url:"http://127.0.0.1:6170/save",method:"POST",body,headers:{"Content-Type":"application/x-www-form-urlencoded"}},
    $persistentStore:{read(k){return store.get(k)||null;},write(v,k){store.set(k,v);return true;}},
    $done(p){result=p;}
  });
  assert.equal(result.response.status,200);
  const saved=JSON.parse(store.get("GSS_SETTINGS_V4"));
  const secrets=JSON.parse(store.get("GSS_PROVIDER_SECRETS_V1"));
  assert.equal(saved.provider,"deepl");
  assert.equal(saved.formats,"vtt,srt,ttml");
  assert.equal(saved.platforms,"apple-fitness,max");
  assert.equal(secrets.deepl.apiKey,"secret-key");
  assert.doesNotMatch(result.response.body,/secret-key/);
});
