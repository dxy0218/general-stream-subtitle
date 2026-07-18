GSS.Admin = (function createAdmin() {
  function escapeHtml(value) {
    return String(value === undefined ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function checked(value) { return value ? " checked" : ""; }
  function selected(value, expected) { return value === expected ? " selected" : ""; }
  function json(status, value) {
    GSS.Runtime.doneResponse(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, JSON.stringify(value, null, 2));
  }
  function platformEnabled(config, id) {
    var raw = String(config.platforms || "all").toLowerCase();
    return raw === "all" || raw.split(",").indexOf(id) >= 0;
  }
  function platformControls(config) {
    return GSS.Platforms.list().map(function (platform) {
      return '<label class="check platform"><input type="checkbox" name="platform_' + escapeHtml(platform.id) + '" value="true"'
        + checked(platformEnabled(config, platform.id)) + '>' + escapeHtml(platform.name) + '</label>';
    }).join("");
  }
  function page(config, token, message) {
    var html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>General Stream Subtitle</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:820px;margin:32px auto;padding:0 18px;line-height:1.45;background:#f5f5f7;color:#1d1d1f}main{background:#fff;border-radius:18px;padding:22px;box-shadow:0 8px 30px rgba(0,0,0,.08)}label{display:block;margin:14px 0 6px;font-weight:600}input,select{box-sizing:border-box;width:100%;padding:11px;border:1px solid #d2d2d7;border-radius:10px;font-size:16px}.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.check{display:flex;gap:9px;align-items:center;font-weight:500;margin:8px 0}.check input{width:auto}.platforms{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 16px;padding:12px;border:1px solid #e5e5ea;border-radius:12px}.actions{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}button,a.button{border:0;border-radius:10px;padding:11px 16px;background:#0071e3;color:#fff;text-decoration:none;font-size:15px}.muted{color:#6e6e73;font-size:14px}.ok{background:#e8f8ed;padding:10px;border-radius:10px}@media(max-width:620px){.row,.platforms{grid-template-columns:1fr}}</style></head><body><main>'
      + '<h1>General Stream Subtitle</h1><p class="muted">v' + escapeHtml(GSS.VERSION) + ' · ' + escapeHtml(GSS.Runtime.name) + ' · 多平台 HLS/WebVTT</p>'
      + (message ? '<p class="ok">' + escapeHtml(message) + '</p>' : '')
      + '<form action="/save" method="get"><input type="hidden" name="token" value="' + escapeHtml(token) + '">'
      + '<div class="row"><div><label>源语言</label><input list="source-languages" name="source" value="' + escapeHtml(config.source) + '" placeholder="auto / en / ja / ko"><datalist id="source-languages"><option value="auto"><option value="en"><option value="ja"><option value="ko"><option value="es"><option value="fr"><option value="de"><option value="it"><option value="pt"><option value="ru"><option value="ar"></datalist><p class="muted">auto 会从非强制字幕中自动挑选一条；也可填写任意 BCP-47 语言代码。</p></div>'
      + '<div><label>目标语言</label><input list="target-languages" name="target" value="' + escapeHtml(config.target) + '"><datalist id="target-languages"><option value="zh-CN"><option value="zh-TW"><option value="en"><option value="ja"><option value="ko"><option value="es"><option value="fr"><option value="de"></datalist></div></div>'
      + '<label>自动选择优先级</label><input name="sourcePriority" value="' + escapeHtml(config.sourcePriority) + '"><p class="muted">仅 source=auto 时使用，逗号分隔。例如 en,ja,ko,es。</p>'
      + '<label>字幕菜单名称</label><input name="trackName" value="' + escapeHtml(config.trackName) + '">'
      + '<label>翻译引擎</label><select name="provider"><option value="google"' + selected(config.provider, 'google') + '>Google 免费兼容接口（实验性）</option></select>'
      + '<label>双语排列</label><select name="bilingualOrder"><option value="translation-first"' + selected(config.bilingualOrder, 'translation-first') + '>译文在上</option><option value="original-first"' + selected(config.bilingualOrder, 'original-first') + '>原文在上</option></select>'
      + '<label>启用的平台</label><div class="platforms">' + platformControls(config) + '</div>'
      + '<p class="check"><input type="checkbox" name="enabled" value="true"' + checked(config.enabled) + '>启用字幕注入</p>'
      + '<p class="check"><input type="checkbox" name="injectTranslated" value="true"' + checked(config.injectTranslated) + '>额外显示纯翻译轨</p>'
      + '<p class="check"><input type="checkbox" name="cacheEnabled" value="true"' + checked(config.cacheEnabled) + '>启用翻译缓存</p>'
      + '<p class="check"><input type="checkbox" name="debug" value="true"' + checked(config.debug) + '>启用调试日志</p>'
      + '<div class="actions"><button type="submit">保存设置</button><a class="button" href="/reset?token=' + escapeHtml(token) + '">恢复默认</a><a class="button" href="/health">运行状态</a></div></form>'
      + '<p class="muted">保存后请完全退出并重新打开对应流媒体 App。此页面由代理脚本合成，并非设备上的常驻服务器。</p>'
      + '</main></body></html>';
    GSS.Runtime.doneResponse(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, html);
  }
  function handle(url, config, logger) {
    var path = GSS.Url.path(url), query = GSS.Url.queryObject(url), token = GSS.getAdminToken();
    if (path === "/health") { json(200, { ok: true, version: GSS.VERSION, runtime: GSS.Runtime.name, platforms: GSS.Platforms.list(), config: config }); return true; }
    if (path === "/api/config") { json(200, { version: GSS.VERSION, runtime: GSS.Runtime.name, platforms: GSS.Platforms.list(), config: config }); return true; }
    if (path === "/save") {
      if (query.token !== token) { json(403, { ok: false, error: "invalid admin token" }); return true; }
      var platformIds = [];
      GSS.Platforms.list().forEach(function (platform) {
        if (query["platform_" + platform.id] === "true") platformIds.push(platform.id);
      });
      var values = {
        source: query.source,
        sourcePriority: query.sourcePriority,
        target: query.target,
        trackName: query.trackName,
        provider: query.provider,
        bilingualOrder: query.bilingualOrder,
        platforms: platformIds.length === GSS.Platforms.list().length ? "all" : (platformIds.join(",") || "none"),
        enabled: query.enabled === "true",
        injectTranslated: query.injectTranslated === "true",
        cacheEnabled: query.cacheEnabled === "true",
        debug: query.debug === "true"
      };
      GSS.saveSettings(values);
      logger.info("settings saved", values);
      page(GSS.getConfig(), token, "设置已保存。重新打开流媒体 App 后生效。");
      return true;
    }
    if (path === "/reset") {
      if (query.token !== token) { json(403, { ok: false, error: "invalid admin token" }); return true; }
      GSS.resetSettings();
      page(GSS.getConfig(), token, "已恢复模块默认设置。");
      return true;
    }
    if (path === "/" || path === "/admin" || path === "/gss" || path === "/gss/") { page(config, token, ""); return true; }
    return false;
  }
  return { handle: handle };
})();
