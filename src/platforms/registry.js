GSS.Platforms = (function createPlatformRegistry() {
  var list = [
    { id: "youtube-tv", name: "YouTube TV", maturity: "experimental", test: function (host) { return host === "tv.youtube.com"; } },
    { id: "youtube", name: "YouTube / Shorts / Live", maturity: "experimental", test: function (host) { return /(^|\.)(youtube\.com|youtube-nocookie\.com)$/.test(host) || host === "youtubei.googleapis.com"; } },
    { id: "apple-fitness", name: "Apple Fitness+", maturity: "stable", test: function (host, path) { return /(^|\.)itunes\.apple\.com$/.test(host) && /\/hls\/workout\//.test(path); } },
    { id: "apple-tv-plus", name: "Apple TV+", maturity: "stable", test: function (host, path) { return /(^|\.)itunes\.apple\.com$/.test(host) && /\/hls\/subscription\//.test(path); } },
    { id: "apple-tv", name: "Apple TV", maturity: "stable", test: function (host) { return /(^|\.)itunes\.apple\.com$/.test(host) || /(^|\.)tv\.apple\.com$/.test(host); } },
    { id: "max", name: "Max / HBO Max", maturity: "stable", test: function (host) { return /(^|\.)(max\.com|h264\.io|hbomaxcdn\.com|api\.hbo\.com)$/.test(host); } },
    { id: "disney", name: "Disney+", maturity: "stable", test: function (host) { return /\.(media|prod)\.(dssott|starott|dssedge)\.com$/.test(host); } },
    { id: "prime", name: "Prime Video", maturity: "stable", test: function (host) { return /(\.hls\.(pv-cdn|row\.aiv-cdn)\.net$|avodhlss3ww-a\.akamaihd\.net$|^s3\.amazonaws\.com$|^cf-timedtext\.aux\.pv-cdn\.net$|^(d1v5ir2lpwr8os|d22qjgkvxw22r6|d25xi40x97liuc|d27xxe7juh1us6|dmqdd6hw24ucf)\.cloudfront\.net$)/.test(host); } },
    { id: "hulu", name: "Hulu", maturity: "stable", test: function (host) { return /(^|\.)(hulustream\.com|huluim\.com)$/.test(host) || host === "assetshuluimcom-a.akamaihd.net"; } },
    { id: "paramount", name: "Paramount+", maturity: "stable", test: function (host) { return /(^|\.)(pplus\.paramount\.tech|cbsaavideo\.com|cbsivideo\.com|cbs\.com)$/.test(host); } },
    { id: "peacock", name: "Peacock", maturity: "stable", test: function (host) { return /\.cdn\.peacocktv\.com$/.test(host); } },
    { id: "discovery", name: "Discovery+", maturity: "stable", test: function (host) { return host === "content-discovery.uplynk.com" || /dplus-ph-/.test(host); } },
    { id: "fubo", name: "Fubo", maturity: "stable", test: function (host) { return /-vod\.fubo\.tv$/.test(host); } },
    { id: "ted", name: "TED", maturity: "stable", test: function (host) { return host === "hls.ted.com"; } },
    { id: "bbc", name: "BBC iPlayer", maturity: "experimental", test: function (host) { return /(^|\.)bbci\.co\.uk$/.test(host) || /^vod-.*-live\.akamaized\.net$/.test(host); } },
    { id: "viki", name: "Rakuten Viki", maturity: "experimental", test: function (host) { return /(^|\.)(viki\.io|viki\.com)$/.test(host); } },
    { id: "tubi", name: "Tubi", maturity: "experimental", test: function (host) { return /(^|\.)(tubi\.video|tubitv\.com)$/.test(host); } },
    { id: "pluto", name: "Pluto TV", maturity: "experimental", test: function (host) { return /(^|\.)pluto\.tv$/.test(host); } },
    { id: "crunchyroll", name: "Crunchyroll / VRV", maturity: "experimental", test: function (host) { return /(^|\.)(crunchyroll\.com|vrv\.co)$/.test(host); } },
    { id: "dazn", name: "DAZN", maturity: "experimental", test: function (host) { return /(^|\.)(dazn\.com|dazn-api\.com)$/.test(host); } },
    { id: "plex", name: "Plex", maturity: "experimental", test: function (host) { return /(^|\.)plex\.tv$/.test(host); } }
  ];

  function customDomainMatch(host, config) {
    var domains = String(config.customDomains || "").split(/[,|]/).map(function (item) { return item.trim().toLowerCase().replace(/^\*\./, ""); }).filter(Boolean);
    for (var i = 0; i < domains.length; i += 1) if (host === domains[i] || host.slice(-(domains[i].length + 1)) === "." + domains[i]) return true;
    return false;
  }

  function detect(url, config) {
    var host = GSS.Url.host(url), path = GSS.Url.path(url);
    for (var i = 0; i < list.length; i += 1) if (list[i].test(host, path, url)) return list[i];
    if (customDomainMatch(host, config || {})) return { id: "custom", name: "Custom Domain", maturity: "custom" };
    if (config && config.genericMode && /\.(m3u8|mpd)(?:$|[?#])/i.test(url)) return { id: "generic", name: "Generic HLS/DASH", maturity: "experimental" };
    return null;
  }

  function enabled(platform, config) {
    if (!platform) return false;
    var raw = String(config.platforms || "all").trim().toLowerCase();
    if (!raw || raw === "all") return true;
    var enabledIds = raw.split(/[,|]/).map(function (item) { return item.trim(); });
    return enabledIds.indexOf(platform.id) >= 0;
  }

  function publicList() {
    var output = list.map(function (item) { return { id: item.id, name: item.name, maturity: item.maturity }; });
    output.push({ id: "custom", name: "Custom Domains", maturity: "custom" });
    output.push({ id: "generic", name: "Generic HLS/DASH", maturity: "experimental" });
    return output;
  }

  return { detect: detect, enabled: enabled, list: publicList };
})();
