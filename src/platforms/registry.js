GSS.Platforms = (function createPlatformRegistry() {
  var list = [
    { id: "apple-fitness", name: "Apple Fitness+", test: function (host, path) { return /(^|\.)itunes\.apple\.com$/.test(host) && /\/hls\/workout\//.test(path); } },
    { id: "apple-tv-plus", name: "Apple TV+", test: function (host, path) { return /(^|\.)itunes\.apple\.com$/.test(host) && /\/hls\/subscription\//.test(path); } },
    { id: "apple-tv", name: "Apple TV", test: function (host, path) { return /(^|\.)itunes\.apple\.com$/.test(host) || /(^|\.)tv\.apple\.com$/.test(host); } },
    { id: "max", name: "Max / HBO Max", test: function (host) { return /(^|\.)(max\.com|h264\.io|hbomaxcdn\.com|api\.hbo\.com)$/.test(host); } },
    { id: "disney", name: "Disney+", test: function (host) { return /\.(media|prod)\.(dssott|starott|dssedge)\.com$/.test(host); } },
    { id: "prime", name: "Prime Video (HLS)", test: function (host) { return /(\.hls\.(pv-cdn|row\.aiv-cdn)\.net$|avodhlss3ww-a\.akamaihd\.net$|^s3\.amazonaws\.com$|^cf-timedtext\.aux\.pv-cdn\.net$|^(d1v5ir2lpwr8os|d22qjgkvxw22r6|d25xi40x97liuc|d27xxe7juh1us6|dmqdd6hw24ucf)\.cloudfront\.net$)/.test(host); } },
    { id: "hulu", name: "Hulu", test: function (host) { return /(^|\.)(hulustream\.com|huluim\.com)$/.test(host) || host === "assetshuluimcom-a.akamaihd.net"; } },
    { id: "paramount", name: "Paramount+", test: function (host) { return /(^|\.)(pplus\.paramount\.tech|cbsaavideo\.com|cbsivideo\.com|cbs\.com)$/.test(host); } },
    { id: "peacock", name: "Peacock", test: function (host) { return /\.cdn\.peacocktv\.com$/.test(host); } },
    { id: "discovery", name: "Discovery+", test: function (host) { return host === "content-discovery.uplynk.com" || /dplus-ph-/.test(host); } },
    { id: "fubo", name: "Fubo", test: function (host) { return /-vod\.fubo\.tv$/.test(host); } },
    { id: "ted", name: "TED", test: function (host) { return host === "hls.ted.com"; } }
  ];

  function detect(url) {
    var host = GSS.Url.host(url);
    var path = GSS.Url.path(url);
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].test(host, path, url)) return list[i];
    }
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
    return list.map(function (item) { return { id: item.id, name: item.name }; });
  }

  return { detect: detect, enabled: enabled, list: publicList };
})();
