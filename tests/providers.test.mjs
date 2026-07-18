import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const files=["src/shared/runtime.js","src/shared/cache.js","src/shared/language.js","src/shared/config.js","src/shared/logger.js","src/shared/url.js","src/providers/registry.js","src/providers/google-free.js","src/providers/google-cloud.js","src/providers/deepl.js","src/providers/azure.js","src/providers/libretranslate.js","src/providers/openai.js","src/providers/openai-compatible.js","src/providers/gemini.js","src/providers/custom-json.js"];
function load(httpClient){
  const store=new Map();
  const context=vm.createContext({console,Date,Math,$httpClient:httpClient,$persistentStore:{read(k){return store.get(k)||null;},write(v,k){store.set(k,v);return true;}}});
  const GSS=vm.runInContext(`var GSS={};\n${files.map(f=>fs.readFileSync(path.join(root,f),"utf8")).join("\n")};GSS;`,context);
  return {GSS,store};
}
const logger={info(){},warn(){},error(){},debug(){}};

test("provider registry exposes all configured adapters",()=>{
  const {GSS}=load();
  const ids=GSS.Providers.list().map(x=>x.id);
  for(const id of ["google-free","google-cloud","deepl","azure","libretranslate","openai","openai-compatible","gemini","custom-json"]) assert.ok(ids.includes(id));
});

test("provider secrets are stored separately from normal settings",()=>{
  const {GSS,store}=load();
  GSS.saveSettings({provider:"deepl",providerEndpoint:"https://api-free.deepl.com/v2/translate"});
  GSS.saveProviderSecret("deepl","apiKey","secret");
  assert.doesNotMatch(store.get("GSS_SETTINGS_V4"),/secret/);
  assert.match(store.get("GSS_PROVIDER_SECRETS_V1"),/secret/);
});

test("DeepL provider sends an authenticated JSON batch and preserves order",()=>{
  let request;
  const {GSS}=load({post(options,cb){request=options;cb(null,{status:200},JSON.stringify({translations:[{text:"你好"},{text:"再见"}]}));}});
  GSS.saveProviderSecret("deepl","apiKey","key-1");
  const config={...GSS.DEFAULTS,provider:"deepl",providerEndpoint:"https://api-free.deepl.com/v2/translate"};
  let output,error;
  GSS.Providers.translateMany(["Hello","Bye"],"en","zh-CN",config,logger,(e,v)=>{error=e;output=v;});
  assert.equal(error,null);
  assert.deepEqual(Array.from(output),["你好","再见"]);
  assert.equal(request.headers.Authorization,"DeepL-Auth-Key key-1");
  assert.deepEqual(JSON.parse(request.body).text,["Hello","Bye"]);
});

test("OpenAI-compatible provider parses a strict translations object",()=>{
  let request;
  const {GSS}=load({post(options,cb){request=options;cb(null,{status:200},JSON.stringify({choices:[{message:{content:'{"translations":["你好","再见"]}'}}]}));}});
  GSS.saveProviderSecret("openai-compatible","apiKey","key-2");
  const config={...GSS.DEFAULTS,provider:"openai-compatible",providerEndpoint:"https://api.example.com/v1",providerModel:"model-x"};
  let output,error;
  GSS.Providers.translateMany(["Hello","Bye"],"en","zh-CN",config,logger,(e,v)=>{error=e;output=v;});
  assert.equal(error,null);
  assert.deepEqual(Array.from(output),["你好","再见"]);
  assert.equal(request.url,"https://api.example.com/v1/chat/completions");
  assert.equal(JSON.parse(request.body).model,"model-x");
});
