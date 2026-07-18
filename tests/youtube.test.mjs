import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
function run(relative,globals){
  const context=vm.createContext({console,Date,Math,...globals});
  vm.runInContext(fs.readFileSync(path.join(root,relative),"utf8"),context);
  return context;
}
function storeApi(initial=[]){
  const store=new Map(initial);
  return {store,api:{read(k){return store.get(k)||null;},write(v,k){store.set(k,v);return true;}}};
}
function playerResponse({live=false,tracks}={}){
  return {
    videoDetails:{videoId:"abc",isLiveContent:live},
    captions:{playerCaptionsTracklistRenderer:{
      captionTracks:tracks||[
        {baseUrl:"https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=json3",name:{simpleText:"English"},languageCode:"en",vssId:".en"},
        {baseUrl:"https://www.youtube.com/api/timedtext?v=abc&lang=en&kind=asr&fmt=json3",name:{simpleText:"English (auto-generated)"},languageCode:"en",kind:"asr",vssId:"a.en"}
      ],
      audioTracks:[{captionTrackIndices:[0,1],defaultCaptionTrackIndex:0}]
    }}
  };
}

test("YouTube player injects Translate-zh and prefers manual captions",()=>{
  const {api}=storeApi(); let result;
  run("dist/youtube.js",{
    $request:{url:"https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false",body:'{"context":{"client":{"clientName":"IOS"}}}',headers:{}},
    $response:{body:JSON.stringify(playerResponse()),headers:{"Content-Type":"application/json","Content-Length":"10"}},
    $persistentStore:api,$done(p){result=p;}
  });
  const data=JSON.parse(result.body);
  const renderer=data.captions.playerCaptionsTracklistRenderer;
  assert.equal(renderer.captionTracks.length,3);
  const injected=renderer.captionTracks[2];
  assert.equal(injected.name.simpleText,"Translate-zh");
  assert.match(injected.baseUrl,/gss_mode=bilingual/);
  assert.match(injected.baseUrl,/lang=en/);
  assert.doesNotMatch(injected.baseUrl,/kind=asr/);
  assert.ok(renderer.audioTracks[0].captionTrackIndices.includes(2));
  assert.equal(result.headers["Content-Length"],undefined);
});

test("YouTube ASR track is used when it is the only textual caption",()=>{
  const {api}=storeApi(); let result;
  const tracks=[{baseUrl:"https://www.youtube.com/api/timedtext?v=live&lang=en&kind=asr&fmt=json3",name:{simpleText:"English (auto-generated)"},languageCode:"en",kind:"asr"}];
  run("dist/youtube.js",{
    $request:{url:"https://www.youtube.com/youtubei/v1/player",body:'{"context":{"client":{"clientName":"WEB"}}}',headers:{}},
    $response:{body:JSON.stringify(playerResponse({live:true,tracks})),headers:{}},
    $persistentStore:api,$done(p){result=p;}
  });
  const injected=JSON.parse(result.body).captions.playerCaptionsTracklistRenderer.captionTracks[1];
  assert.equal(injected.name.simpleText,"Translate-zh");
  assert.match(injected.baseUrl,/gss_live=1/);
  assert.match(injected.baseUrl,/gss_platform=youtube/);
});

test("YouTube TV is detected from the TVHTML5 client",()=>{
  const {api}=storeApi(); let result;
  run("dist/youtube.js",{
    $request:{url:"https://youtubei.googleapis.com/youtubei/v1/player",body:'{"context":{"client":{"clientName":"TVHTML5"}}}',headers:{}},
    $response:{body:JSON.stringify(playerResponse({live:true})),headers:{}},
    $persistentStore:api,$done(p){result=p;}
  });
  const injected=JSON.parse(result.body).captions.playerCaptionsTracklistRenderer.captionTracks[2];
  assert.match(injected.baseUrl,/gss_platform=youtube-tv/);
});

test("YouTube player fails open when no captionTracks exist",()=>{
  const {api}=storeApi(); let result;
  run("dist/youtube.js",{
    $request:{url:"https://youtubei.googleapis.com/youtubei/v1/player",body:"{}",headers:{}},
    $response:{body:JSON.stringify({videoDetails:{videoId:"none"}}),headers:{}},
    $persistentStore:api,$done(p){result=p;}
  });
  assert.equal(Object.keys(result).length,0);
});

test("YouTube timedtext XML format renders bilingual text",()=>{
  const files=["src/shared/runtime.js","src/shared/cache.js","src/shared/language.js","src/shared/config.js","src/shared/url.js","src/formats/registry.js","src/formats/youtube.js"];
  const context=vm.createContext({console,Date,Math});
  const GSS=vm.runInContext(`var GSS={};\n${files.map(f=>fs.readFileSync(path.join(root,f),"utf8")).join("\n")};GSS;`,context);
  const format=GSS.Formats.detect('<transcript><text start="0" dur="1">Hello &amp; bye</text></transcript>',"https://www.youtube.com/api/timedtext","text/xml",GSS.DEFAULTS);
  const parsed=format.parse('<transcript><text start="0" dur="1">Hello &amp; bye</text></transcript>');
  GSS.Formats.uniqueTexts(parsed.cues);
  const output=format.render(parsed,["你好，再见"],"bilingual","translation-first");
  assert.match(output,/你好，再见&#10;Hello &amp; bye/);
});

test("YouTube JSON3 format preserves event timing and adds bilingual text",()=>{
  const files=["src/shared/runtime.js","src/shared/cache.js","src/shared/language.js","src/shared/config.js","src/shared/url.js","src/formats/registry.js","src/formats/youtube.js"];
  const context=vm.createContext({console,Date,Math});
  const GSS=vm.runInContext(`var GSS={};\n${files.map(f=>fs.readFileSync(path.join(root,f),"utf8")).join("\n")};GSS;`,context);
  const body=JSON.stringify({events:[{tStartMs:1200,dDurationMs:800,segs:[{utf8:"Hello "},{utf8:"world"}]}]});
  const format=GSS.Formats.detect(body,"https://www.youtube.com/api/timedtext?fmt=json3","application/json",GSS.DEFAULTS);
  const parsed=format.parse(body); GSS.Formats.uniqueTexts(parsed.cues);
  const data=JSON.parse(format.render(parsed,["你好，世界"],"bilingual","translation-first"));
  assert.equal(data.events[0].tStartMs,1200);
  assert.equal(data.events[0].segs[0].utf8,"你好，世界\nHello world");
});

test("direct YouTube caption response is translated through the module",()=>{
  const {api}=storeApi(); let result; let calls=0;
  const body=JSON.stringify({events:[{tStartMs:0,dDurationMs:1000,segs:[{utf8:"Hello"}]}]});
  run("dist/youtube-caption.js",{
    $request:{url:"https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=json3&gss_mode=bilingual&gss_source=en&gss_target=zh-CN",headers:{}},
    $response:{body,headers:{"Content-Type":"application/json","Content-Length":"100"}},
    $httpClient:{get(options,cb){calls++;cb(null,{status:200},JSON.stringify([[["你好","",null,null]]]));}},
    $persistentStore:api,$done(p){result=p;}
  });
  assert.equal(calls,1);
  const data=JSON.parse(result.body);
  assert.equal(data.events[0].segs[0].utf8,"你好\nHello");
  assert.equal(result.headers["Content-Type"],"application/json; charset=utf-8");
  assert.equal(result.headers["Content-Length"],undefined);
});

test("virtual YouTube gateway forwards live sequence parameters",()=>{
  const {api}=storeApi(); let result; const urls=[];
  const origin="https://www.youtube.com/api/timedtext?v=live&lang=en&fmt=json3";
  const body=JSON.stringify({events:[{tStartMs:0,segs:[{utf8:"Live now"}]}]});
  run("dist/gateway.js",{
    $request:{url:"https://gss.local/youtube?origin="+encodeURIComponent(origin)+"&mode=bilingual&source=en&target=zh-CN&platform=youtube-tv&live=1&seq=42&pot=abc",headers:{}},
    $httpClient:{get(options,cb){urls.push(options.url); if(urls.length===1) cb(null,{status:200,headers:{"Content-Type":"application/json"}},body); else cb(null,{status:200},JSON.stringify([[["正在直播","",null,null]]]));}},
    $persistentStore:api,$done(p){result=p;}
  });
  assert.match(urls[0],/[?&]seq=42/);
  assert.match(urls[0],/[?&]pot=abc/);
  assert.doesNotMatch(urls[0],/[?&]tlang=/);
  assert.match(result.response.body,/正在直播/);
});

test("generated modules include YouTube player and timedtext scripts",()=>{
  for(const file of ["GeneralStreamSubtitle.module","GeneralStreamSubtitle.plugin","GeneralStreamSubtitle.sgmodule"]){
    const text=fs.readFileSync(path.join(root,"modules",file),"utf8");
    assert.match(text,/GSS YouTube Player/);
    assert.match(text,/GSS YouTube Caption/);
    assert.match(text,/youtubei\.googleapis/);
    assert.match(text,/\*\.youtube\.com/);
  }
});
