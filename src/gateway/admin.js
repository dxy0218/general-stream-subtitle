GSS.Admin = (function createAdmin() {
  function escapeHtml(value) { return String(value === undefined ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function checked(value) { return value ? " checked" : ""; }
  function selected(value, expected) { return value === expected ? " selected" : ""; }
  function json(status, value) { GSS.Runtime.doneResponse(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, JSON.stringify(value, null, 2)); }
  function enabledIn(raw, id) {
    raw = String(raw || "all").toLowerCase();
    return raw === "all" || raw.split(/[,|]/).map(function (item) { return item.trim(); }).indexOf(id) >= 0;
  }
  function providerOptions(config) {
    return GSS.Providers.list().map(function (provider) {
      var suffix = provider.requiresKey ? (provider.configured ? " · 已配置密钥" : " · 需要密钥") : "";
      if (provider.experimental) suffix += " · 实验性";
      return '<option value="' + escapeHtml(provider.id) + '"' + selected(config.provider, provider.id) + '>' + escapeHtml(provider.name + suffix) + '</option>';
    }).join("");
  }
  function platformControls(config) {
    return GSS.Platforms.list().map(function (platform) {
      return '<label class="check"><input type="checkbox" name="platform_' + escapeHtml(platform.id) + '" value="true"' + checked(enabledIn(config.platforms, platform.id)) + '>'
        + escapeHtml(platform.name) + (platform.maturity !== "stable" ? ' <span class="tag">' + escapeHtml(platform.maturity) + '</span>' : '') + '</label>';
    }).join("");
  }
  function formatControls(config) {
    return GSS.Formats.list().map(function (format) {
      return '<label class="check"><input type="checkbox" name="format_' + escapeHtml(format.id) + '" value="true"' + checked(enabledIn(config.formats, format.id)) + '>' + escapeHtml(format.name) + '</label>';
    }).join("");
  }
  function publicConfig(config) {
    var copy = {};
    Object.keys(config || {}).forEach(function (key) { copy[key] = config[key]; });
    copy.providerConfigured = GSS.providerHasKey(config.provider);
    return copy;
  }
  function params(url) {
    var output = GSS.Url.queryObject(url), body = GSS.Runtime.request.body || "";
    if (String(GSS.Runtime.request.method || "GET").toUpperCase() === "POST" && body) {
      var bodyParams = GSS.parseArguments(body);
      Object.keys(bodyParams).forEach(function (key) { output[key] = bodyParams[key]; });
    }
    return output;
  }
  function logsPayload() {
    return {
      version: GSS.VERSION,
      runtime: GSS.Runtime.name,
      summary: GSS.Diagnostics ? GSS.Diagnostics.summary() : { total: 0, errors: 0, warnings: 0, rewritten: 0, bypassed: 0 },
      records: GSS.Diagnostics ? GSS.Diagnostics.list() : []
    };
  }
  function logsPage(token, message) {
    var payload = logsPayload(), rows = payload.records;
    var rowsHtml = rows.map(function (row) {
      var primary = row.message || row.error || row.details && row.details.reason || "";
      var details = JSON.stringify(row, null, 2);
      return '<tr><td class="time">' + escapeHtml(row.time || "") + (row.count > 1 ? '<br><span class="count">×' + escapeHtml(row.count) + '</span>' : '') + '</td>'
        + '<td><span class="level ' + escapeHtml(row.level || "info") + '">' + escapeHtml(row.level || "info") + '</span></td>'
        + '<td>' + escapeHtml(row.platform || "-") + '<br><span class="scope">' + escapeHtml(row.scope || "-") + '</span></td>'
        + '<td><strong>' + escapeHtml(row.type || "event") + '</strong><br><span class="status">' + escapeHtml(row.status || "observed") + '</span></td>'
        + '<td><div class="url">' + escapeHtml(row.url || "") + '</div><div>' + escapeHtml(primary) + '</div><details><summary>详细信息</summary><pre>' + escapeHtml(details) + '</pre></details></td></tr>';
    }).join("");
    if (!rowsHtml) rowsHtml = '<tr><td colspan="5" class="empty">暂无日志。请保持 LOGS 开启，然后重现一次播放或字幕错误。</td></tr>';
    var raw = JSON.stringify(payload, null, 2);
    var html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>GSS 运行日志</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;background:#f5f5f7;color:#1d1d1f}main{max-width:1180px;margin:24px auto;padding:0 14px}.card{background:#fff;border-radius:16px;padding:18px;box-shadow:0 6px 24px rgba(0,0,0,.07);margin-bottom:14px}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.metric{background:#f5f5f7;border-radius:12px;padding:12px}.metric b{display:block;font-size:22px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}button,a.button{border:0;border-radius:9px;padding:10px 13px;background:#0071e3;color:#fff;text-decoration:none;font-size:14px}.danger{background:#c9342f!important}.muted,.scope,.status,.url,.count{color:#6e6e73;font-size:12px}.notice{background:#e8f8ed;padding:10px;border-radius:10px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:10px 8px;border-bottom:1px solid #e5e5ea;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#fff}.time{white-space:nowrap}.level{font-size:11px;padding:3px 6px;border-radius:6px;background:#e8e8ed}.level.error{background:#ffe8e7;color:#b42318}.level.warn,.level.warning{background:#fff4ce;color:#7a4d00}.url{word-break:break-all;margin-bottom:4px}details{margin-top:6px}pre{white-space:pre-wrap;word-break:break-word;background:#f5f5f7;padding:9px;border-radius:8px;max-width:700px}textarea{box-sizing:border-box;width:100%;height:190px;margin-top:10px;font-family:ui-monospace,monospace;font-size:12px}.empty{text-align:center;padding:30px}.table-wrap{overflow:auto}@media(max-width:700px){.summary{grid-template-columns:repeat(2,1fr)}th:nth-child(1),td:nth-child(1){display:none}}</style></head><body><main>'
      + '<div class="card"><h1>GSS 运行日志</h1><p class="muted">v' + escapeHtml(GSS.VERSION) + ' · ' + escapeHtml(GSS.Runtime.name) + ' · 最多保留 80 条脱敏记录。URL 查询参数、Token、Cookie、Authorization、签名和 API Key 不会写入日志。</p>'
      + (message ? '<p class="notice">' + escapeHtml(message) + '</p>' : '')
      + '<div class="summary"><div class="metric"><b>' + escapeHtml(payload.summary.total) + '</b>当前记录</div><div class="metric"><b>' + escapeHtml(payload.summary.errors) + '</b>错误</div><div class="metric"><b>' + escapeHtml(payload.summary.warnings) + '</b>警告</div><div class="metric"><b>' + escapeHtml(payload.summary.rewritten) + '</b>已改写</div><div class="metric"><b>' + escapeHtml(payload.summary.bypassed) + '</b>放行/回退</div></div>'
      + '<div class="actions"><a class="button" href="/">返回设置</a><a class="button" href="/logs">刷新</a><a class="button" href="/logs.json">查看 JSON</a><button type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById(\'raw-logs\').value)">复制全部日志</button><a class="button danger" href="/clear-diagnostics?view=logs&amp;token=' + escapeHtml(token) + '">清空日志</a></div></div>'
      + '<div class="card table-wrap"><table><thead><tr><th>时间</th><th>级别</th><th>平台/范围</th><th>阶段/结果</th><th>地址与信息</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>'
      + '<div class="card"><details><summary>用于提交 Issue 的脱敏 JSON</summary><textarea id="raw-logs" readonly>' + escapeHtml(raw) + '</textarea></details></div>'
      + '</main></body></html>';
    GSS.Runtime.doneResponse(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, html);
  }
  function page(config, token, message) {
    var keyState = GSS.providerHasKey(config.provider) ? "当前引擎已保存 API Key；留空表示保持不变。" : "当前引擎尚未保存 API Key。";
    var html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>General Stream Subtitle</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:920px;margin:30px auto;padding:0 16px;background:#f5f5f7;color:#1d1d1f}main{background:#fff;border-radius:18px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.08)}h2{margin-top:28px}label{display:block;margin:12px 0 5px;font-weight:600}input,select,textarea{box-sizing:border-box;width:100%;padding:10px;border:1px solid #d2d2d7;border-radius:10px;font-size:15px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 15px;padding:12px;border:1px solid #e5e5ea;border-radius:12px}.check{display:flex;gap:8px;align-items:center;font-weight:500;margin:5px 0}.check input{width:auto}.tag{font-size:11px;background:#eee;padding:2px 5px;border-radius:5px;color:#666}.actions{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}button,a.button{border:0;border-radius:10px;padding:11px 16px;background:#0071e3;color:#fff;text-decoration:none;font-size:15px}.muted{color:#6e6e73;font-size:13px}.ok{background:#e8f8ed;padding:10px;border-radius:10px}@media(max-width:680px){.grid,.checks{grid-template-columns:1fr}}</style></head><body><main>'
      + '<h1>General Stream Subtitle</h1><p class="muted">v' + escapeHtml(GSS.VERSION) + ' · ' + escapeHtml(GSS.Runtime.name) + ' · HLS / DASH · 多字幕格式 · 多翻译引擎</p>'
      + (message ? '<p class="ok">' + escapeHtml(message) + '</p>' : '')
      + '<form action="/save" method="post"><input type="hidden" name="token" value="' + escapeHtml(token) + '">'
      + '<h2>字幕</h2><div class="grid"><div><label>源语言</label><input name="source" value="' + escapeHtml(config.source) + '" placeholder="auto / en / ja / ko"></div><div><label>目标语言</label><input name="target" value="' + escapeHtml(config.target) + '"></div></div>'
      + '<label>自动源语言优先级</label><input name="sourcePriority" value="' + escapeHtml(config.sourcePriority) + '">'
      + '<label>字幕菜单名称</label><input name="trackName" value="' + escapeHtml(config.trackName) + '">'
      + '<label>双语排列</label><select name="bilingualOrder"><option value="translation-first"' + selected(config.bilingualOrder, "translation-first") + '>译文在上</option><option value="original-first"' + selected(config.bilingualOrder, "original-first") + '>原文在上</option></select>'
      + '<h2>翻译引擎</h2><label>Provider</label><select name="provider">' + providerOptions(config) + '</select>'
      + '<label>备用 Provider</label><input name="fallbackProviders" value="' + escapeHtml(config.fallbackProviders) + '" placeholder="google-free,libretranslate"><p class="muted">主引擎失败后按顺序尝试，逗号分隔。</p>'
      + '<label>API Key</label><input type="password" name="providerApiKey" value="" autocomplete="new-password" placeholder="留空保持不变"><p class="muted">' + escapeHtml(keyState) + ' 密钥仅保存在当前代理软件的 persistentStore，不写入模块或健康接口。</p>'
      + '<label class="check"><input type="checkbox" name="clearProviderKey" value="true">清除所选 Provider 的已保存密钥</label>'
      + '<div class="grid"><div><label>自定义 Endpoint</label><input name="providerEndpoint" value="' + escapeHtml(config.providerEndpoint) + '" placeholder="可留空使用默认端点"></div><div><label>模型</label><input name="providerModel" value="' + escapeHtml(config.providerModel) + '" placeholder="gpt-5-mini / deepseek-chat / gemini-2.5-flash"></div></div>'
      + '<div class="grid"><div><label>Azure Region</label><input name="providerRegion" value="' + escapeHtml(config.providerRegion) + '"></div><div><label>Google Project / Location</label><input name="providerProject" value="' + escapeHtml(config.providerProject) + '" placeholder="预留"><input name="providerLocation" value="' + escapeHtml(config.providerLocation) + '" placeholder="global"></div></div>'
      + '<label>LLM 翻译指令</label><textarea name="providerPrompt" rows="4">' + escapeHtml(config.providerPrompt) + '</textarea>'
      + '<h2>YouTube / YouTube TV</h2><label>字幕接管策略</label><select name="youtubeStrategy"><option value="direct"' + selected(config.youtubeStrategy, "direct") + '>直接拦截 timedtext（推荐）</option><option value="virtual"' + selected(config.youtubeStrategy, "virtual") + '>虚拟字幕网关</option></select>'
      + '<label class="check"><input type="checkbox" name="youtubeUseAsr" value="true"' + checked(config.youtubeUseAsr) + '>使用 YouTube 自动生成字幕（ASR）</label>'
      + '<label class="check"><input type="checkbox" name="youtubeLive" value="true"' + checked(config.youtubeLive) + '>处理 YouTube / YouTube TV 直播文本字幕</label>'
      + '<label class="check"><input type="checkbox" name="youtubePreferManual" value="true"' + checked(config.youtubePreferManual) + '>官方人工字幕优先于 ASR</label><p class="muted">没有 captionTracks 的视频无法在纯模块内生成字幕；嵌入视频流但未转成 timedtext 的 CEA-608/708 也会安全放行。</p>'
      + '<h2>格式</h2><div class="checks">' + formatControls(config) + '</div><p class="muted">IMSC/TTML 的文本 XML 可处理；fMP4 内的二进制 IMSC1 目前只识别并安全放行。</p>'
      + '<h2>平台</h2><div class="checks">' + platformControls(config) + '</div>'
      + '<label class="check"><input type="checkbox" name="genericMode" value="true"' + checked(config.genericMode) + '>启用通用 HLS/DASH 模式</label>'
      + '<label>自定义域名</label><input name="customDomains" value="' + escapeHtml(config.customDomains) + '" placeholder="media.example.com,local.plex"><p class="muted">自定义域名仍需手动加入客户端 MITM hostname。</p>'
      + '<h2>运行</h2><label class="check"><input type="checkbox" name="enabled" value="true"' + checked(config.enabled) + '>启用字幕注入</label>'
      + '<label class="check"><input type="checkbox" name="injectTranslated" value="true"' + checked(config.injectTranslated) + '>额外显示纯翻译轨</label>'
      + '<label class="check"><input type="checkbox" name="cacheEnabled" value="true"' + checked(config.cacheEnabled) + '>启用翻译缓存</label>'
      + '<label class="check"><input type="checkbox" name="logEnabled" value="true"' + checked(config.logEnabled) + '>记录脱敏运行日志（推荐）</label>'
      + '<label class="check"><input type="checkbox" name="debug" value="true"' + checked(config.debug) + '>控制台详细调试输出</label>'
      + '<div class="actions"><button type="submit">保存设置</button><a class="button" href="/reset?token=' + escapeHtml(token) + '">恢复默认</a><a class="button" href="/health">运行状态</a><a class="button" href="/logs">运行日志</a></div></form>'
      + '<p class="muted">保存后请完全退出并重新打开流媒体 App。此页面由代理脚本合成，不是常驻 Web 服务。</p></main></body></html>';
    GSS.Runtime.doneResponse(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, html);
  }
  function handle(url, config, logger) {
    var path = GSS.Url.path(url), query = params(url), token = GSS.getAdminToken();
    if (path === "/health") { var diagnosticSummary = GSS.Diagnostics ? GSS.Diagnostics.summary() : { total: 0 }; json(200, { ok: true, version: GSS.VERSION, runtime: GSS.Runtime.name, providers: GSS.Providers.list(), formats: GSS.Formats.list(), platforms: GSS.Platforms.list(), config: publicConfig(config), diagnosticsCount: diagnosticSummary.total, diagnostics: diagnosticSummary }); return true; }
    if (path === "/logs") { logsPage(token, ""); return true; }
    if (path === "/logs.json" || path === "/diagnostics") { json(200, logsPayload()); return true; }
    if (path === "/clear-diagnostics") { if (query.token !== token) { json(403, { ok: false, error: "invalid admin token" }); return true; } if (GSS.Diagnostics) GSS.Diagnostics.clear(); if (query.view === "logs") logsPage(token, "日志已清空。"); else json(200, { ok: true, cleared: true }); return true; }
    if (path === "/api/config") { json(200, { version: GSS.VERSION, providers: GSS.Providers.list(), formats: GSS.Formats.list(), platforms: GSS.Platforms.list(), config: publicConfig(config) }); return true; }
    if (path === "/save") {
      if (query.token !== token) { json(403, { ok: false, error: "invalid admin token" }); return true; }
      var platformIds = [], formatIds = [];
      GSS.Platforms.list().forEach(function (item) { if (query["platform_" + item.id] === "true") platformIds.push(item.id); });
      GSS.Formats.list().forEach(function (item) { if (query["format_" + item.id] === "true") formatIds.push(item.id); });
      var values = {
        source: query.source, sourcePriority: query.sourcePriority, target: query.target, trackName: query.trackName,
        provider: query.provider, fallbackProviders: query.fallbackProviders, providerEndpoint: query.providerEndpoint,
        providerModel: query.providerModel, providerRegion: query.providerRegion, providerProject: query.providerProject,
        providerLocation: query.providerLocation, providerPrompt: query.providerPrompt, bilingualOrder: query.bilingualOrder,
        platforms: platformIds.length === GSS.Platforms.list().length ? "all" : (platformIds.join(",") || "none"),
        formats: formatIds.length === GSS.Formats.list().length ? "all" : (formatIds.join(",") || "none"),
        genericMode: query.genericMode === "true", customDomains: query.customDomains,
        youtubeStrategy: query.youtubeStrategy, youtubeUseAsr: query.youtubeUseAsr === "true",
        youtubeLive: query.youtubeLive === "true", youtubePreferManual: query.youtubePreferManual === "true",
        enabled: query.enabled === "true", injectTranslated: query.injectTranslated === "true",
        cacheEnabled: query.cacheEnabled === "true", logEnabled: query.logEnabled === "true", debug: query.debug === "true"
      };
      GSS.saveSettings(values);
      if (query.clearProviderKey === "true") GSS.saveProviderSecret(query.provider, "apiKey", "");
      else if (query.providerApiKey) GSS.saveProviderSecret(query.provider, "apiKey", query.providerApiKey);
      logger.info("settings saved", { provider: values.provider, platforms: values.platforms, formats: values.formats });
      page(GSS.getConfig(), token, "设置已保存。重新打开流媒体 App 后生效。");
      return true;
    }
    if (path === "/reset") {
      if (query.token !== token) { json(403, { ok: false, error: "invalid admin token" }); return true; }
      GSS.resetSettings(); page(GSS.getConfig(), token, "已恢复模块默认设置（API Key 未删除）。"); return true;
    }
    if (path === "/" || path === "/admin" || path === "/gss" || path === "/gss/") { page(config, token, ""); return true; }
    return false;
  }
  return { handle: handle };
})();
