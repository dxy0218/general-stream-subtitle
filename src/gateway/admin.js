GSS.Admin = (function createAdmin() {
  function escapeHtml(value) {
    return String(value === undefined ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function checked(value) { return value ? " checked" : ""; }
  function selected(value, expected) { return value === expected ? " selected" : ""; }
  function json(status, value) {
    GSS.Runtime.doneResponse(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, JSON.stringify(value, null, 2));
  }
  function page(config, token, message) {
    var html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>General Stream Subtitle</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:760px;margin:32px auto;padding:0 18px;line-height:1.45;background:#f5f5f7;color:#1d1d1f}main{background:#fff;border-radius:18px;padding:22px;box-shadow:0 8px 30px rgba(0,0,0,.08)}label{display:block;margin:14px 0 6px;font-weight:600}input,select{box-sizing:border-box;width:100%;padding:11px;border:1px solid #d2d2d7;border-radius:10px;font-size:16px}.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.check{display:flex;gap:9px;align-items:center;font-weight:500}.check input{width:auto}.actions{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}button,a.button{border:0;border-radius:10px;padding:11px 16px;background:#0071e3;color:#fff;text-decoration:none;font-size:15px}.muted{color:#6e6e73;font-size:14px}.ok{background:#e8f8ed;padding:10px;border-radius:10px}@media(max-width:620px){.row{grid-template-columns:1fr}}</style></head><body><main>'
      + '<h1>General Stream Subtitle</h1><p class="muted">v' + escapeHtml(GSS.VERSION) + ' · ' + escapeHtml(GSS.Runtime.name) + ' · Max adapter</p>'
      + (message ? '<p class="ok">' + escapeHtml(message) + '</p>' : '')
      + '<form action="/save" method="get"><input type="hidden" name="token" value="' + escapeHtml(token) + '">'
      + '<div class="row"><div><label>源语言</label><input name="source" value="' + escapeHtml(config.source) + '"></div><div><label>目标语言</label><input name="target" value="' + escapeHtml(config.target) + '"></div></div>'
      + '<label>字幕菜单名称</label><input name="trackName" value="' + escapeHtml(config.trackName) + '">'
      + '<label>翻译引擎</label><select name="provider"><option value="google"' + selected(config.provider, 'google') + '>Google 免费兼容接口（实验性）</option></select>'
      + '<label>双语排列</label><select name="bilingualOrder"><option value="translation-first"' + selected(config.bilingualOrder, 'translation-first') + '>中文在上</option><option value="original-first"' + selected(config.bilingualOrder, 'original-first') + '>英文在上</option></select>'
      + '<p class="check"><input type="checkbox" name="enabled" value="true"' + checked(config.enabled) + '>启用字幕注入</p>'
      + '<p class="check"><input type="checkbox" name="injectTranslated" value="true"' + checked(config.injectTranslated) + '>额外显示纯翻译轨</p>'
      + '<p class="check"><input type="checkbox" name="cacheEnabled" value="true"' + checked(config.cacheEnabled) + '>启用翻译缓存</p>'
      + '<p class="check"><input type="checkbox" name="debug" value="true"' + checked(config.debug) + '>启用调试日志</p>'
      + '<div class="actions"><button type="submit">保存设置</button><a class="button" href="/reset?token=' + escapeHtml(token) + '">恢复默认</a><a class="button" href="/health">运行状态</a></div></form>'
      + '<p class="muted">保存后请完全退出并重新打开 Max，再进入字幕菜单。这个页面由代理脚本合成，并不是真的在设备上常驻监听端口。</p>'
      + '</main></body></html>';
    GSS.Runtime.doneResponse(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, html);
  }
  function handle(url, config, logger) {
    var path = GSS.Url.path(url), query = GSS.Url.queryObject(url), token = GSS.getAdminToken();
    if (path === "/health") { json(200, { ok: true, version: GSS.VERSION, runtime: GSS.Runtime.name, config: config }); return true; }
    if (path === "/api/config") { json(200, { version: GSS.VERSION, runtime: GSS.Runtime.name, config: config }); return true; }
    if (path === "/save") {
      if (query.token !== token) { json(403, { ok: false, error: "invalid admin token" }); return true; }
      var values = {
        source: query.source, target: query.target, trackName: query.trackName, provider: query.provider,
        bilingualOrder: query.bilingualOrder, enabled: query.enabled === "true",
        injectTranslated: query.injectTranslated === "true", cacheEnabled: query.cacheEnabled === "true", debug: query.debug === "true"
      };
      GSS.saveSettings(values);
      logger.info("settings saved", values);
      page(GSS.getConfig(), token, "设置已保存。重新打开 Max 后生效。");
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
