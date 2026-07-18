GSS.Language = (function createLanguageTools() {
  var aliases = {
    en: ["english", "英文", "英语"],
    ja: ["japanese", "日本語", "日文", "日语"],
    ko: ["korean", "한국어", "韩文", "韩语"],
    es: ["spanish", "español", "西班牙语"],
    fr: ["french", "français", "法语"],
    de: ["german", "deutsch", "德语"],
    it: ["italian", "italiano", "意大利语"],
    pt: ["portuguese", "português", "葡萄牙语"],
    ru: ["russian", "русский", "俄语"],
    ar: ["arabic", "العربية", "阿拉伯语"],
    hi: ["hindi", "हिन्दी", "印地语"],
    th: ["thai", "ไทย", "泰语"],
    vi: ["vietnamese", "tiếng việt", "越南语"],
    id: ["indonesian", "bahasa indonesia", "印度尼西亚语"],
    zh: ["chinese", "中文", "简体中文", "繁體中文", "繁体中文"]
  };

  function normalize(value) {
    return String(value || "").trim().replace(/_/g, "-").toLowerCase();
  }

  function base(value) {
    var normalized = normalize(value);
    if (!normalized) return "";
    if (normalized === "zh-hans" || normalized === "zh-cn" || normalized === "cmn-hans") return "zh-cn";
    if (normalized === "zh-hant" || normalized === "zh-tw" || normalized === "zh-hk" || normalized === "cmn-hant") return "zh-tw";
    return normalized.split("-")[0];
  }

  function matches(language, name, wanted) {
    wanted = normalize(wanted || "auto");
    if (wanted === "auto") return true;
    var normalizedLanguage = normalize(language);
    var wantedBase = base(wanted);
    var languageBase = base(normalizedLanguage);
    if (normalizedLanguage === wanted || languageBase === wantedBase) return true;
    var loweredName = String(name || "").toLowerCase();
    var names = aliases[wantedBase] || [];
    for (var i = 0; i < names.length; i += 1) {
      if (loweredName.indexOf(names[i].toLowerCase()) >= 0) return true;
    }
    return false;
  }

  function googleSource(language, configured) {
    configured = normalize(configured || "auto");
    if (configured !== "auto") return base(configured) || configured;
    var detected = base(language);
    return detected || "auto";
  }

  function priority(language, name, preferred) {
    var normalized = base(language);
    var list = String(preferred || "en,ja,ko,es,fr,de,it,pt").split(/[,|]/).map(function (item) { return base(item); });
    var index = list.indexOf(normalized);
    if (index >= 0) return Math.max(0, 40 - index);
    var loweredName = String(name || "").toLowerCase();
    for (var key in aliases) {
      if (!Object.prototype.hasOwnProperty.call(aliases, key)) continue;
      for (var i = 0; i < aliases[key].length; i += 1) {
        if (loweredName.indexOf(aliases[key][i].toLowerCase()) >= 0) {
          var aliasIndex = list.indexOf(key);
          return aliasIndex >= 0 ? Math.max(0, 40 - aliasIndex) : 0;
        }
      }
    }
    return 0;
  }

  return {
    normalize: normalize,
    base: base,
    matches: matches,
    googleSource: googleSource,
    priority: priority
  };
})();
