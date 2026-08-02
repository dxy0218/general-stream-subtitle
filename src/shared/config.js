GSS.VERSION = "0.6.9";
GSS.SETTINGS_KEY = "GSS_SETTINGS_V4";
GSS.PROVIDER_SECRETS_KEY = "GSS_PROVIDER_SECRETS_V1";
GSS.ADMIN_TOKEN_KEY = "GSS_ADMIN_TOKEN_V1";

GSS.DEFAULTS = {
  enabled: true,
  provider: "google-free",
  fallbackProviders: "",
  providerEndpoint: "",
  providerModel: "",
  providerRegion: "",
  providerProject: "",
  providerLocation: "global",
  providerPrompt: "Translate each subtitle naturally and concisely. Preserve names, tone, punctuation, and the order of items.",
  source: "auto",
  sourcePriority: "en,ja,ko,es,fr,de,it,pt",
  target: "zh-CN",
  trackName: "Translate-zh",
  injectTranslated: false,
  translatedTrackName: "Translate-zh-only",
  bilingualOrder: "translation-first",
  platforms: "all",
  discoveryMode: "full",
  safePlayback: false,
  presetMode: false,
  hyMt2Preset: false,
  platformDiscovery: false,
  discoveryHlsOnly: true,
  platformMax: true,
  platformPluto: true,
  platformPrime: true,
  platformHulu: true,
  platformYoutube: true,
  formats: "all",
  genericMode: false,
  customDomains: "",
  youtubeStrategy: "direct",
  youtubeUseAsr: true,
  youtubeLive: true,
  youtubePreferManual: true,
  logEnabled: true,
  debug: false,
  cacheEnabled: true,
  cacheTTL: 6 * 60 * 60 * 1000,
  cacheLimit: 120,
  batchChars: 1600,
  batchItems: 12,
  translationConcurrency: 2,
  virtualOrigin: "https://example.com"
};

GSS.parseArguments = function parseArguments(raw) {
  var result = {};
  if (!raw || typeof raw !== "string") return result;
  raw.replace(/^\?/, "").split(/[&,]/).forEach(function (pair) {
    if (!pair) return;
    var index = pair.indexOf("=");
    var key = index >= 0 ? pair.slice(0, index) : pair;
    var value = index >= 0 ? pair.slice(index + 1) : "true";
    try { key = decodeURIComponent(key.trim()); value = decodeURIComponent(value.trim()); } catch (_) {}
    if (key) result[key] = value;
  });
  return result;
};

GSS.asBoolean = function asBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
};

GSS.allowedSettings = {
  enabled: "boolean", provider: "string", fallbackProviders: "string", providerEndpoint: "string",
  providerModel: "string", providerRegion: "string", providerProject: "string", providerLocation: "string",
  providerPrompt: "string", source: "string", sourcePriority: "string", target: "string", trackName: "string",
  injectTranslated: "boolean", translatedTrackName: "string", bilingualOrder: "string", platforms: "string", discoveryMode: "string",
  safePlayback: "boolean", presetMode: "boolean", hyMt2Preset: "boolean", platformDiscovery: "boolean", discoveryHlsOnly: "boolean",
  platformMax: "boolean", platformPluto: "boolean", platformPrime: "boolean", platformHulu: "boolean", platformYoutube: "boolean",
  formats: "string", genericMode: "boolean", customDomains: "string", youtubeStrategy: "string",
  youtubeUseAsr: "boolean", youtubeLive: "boolean", youtubePreferManual: "boolean", logEnabled: "boolean", debug: "boolean", cacheEnabled: "boolean",
  cacheTTL: "number", cacheLimit: "number", batchChars: "number", batchItems: "number", translationConcurrency: "number"
};

GSS.normalizeSettings = function normalizeSettings(input) {
  var output = {};
  Object.keys(GSS.allowedSettings).forEach(function (key) {
    if (!input || input[key] === undefined || input[key] === null || input[key] === "") return;
    var type = GSS.allowedSettings[key];
    if (type === "boolean") output[key] = GSS.asBoolean(input[key], false);
    else if (type === "number" && !isNaN(Number(input[key]))) output[key] = Math.max(0, Number(input[key]));
    else if (type === "string") output[key] = String(input[key]).slice(0, key === "providerPrompt" ? 1200 : 600);
  });
  if (output.bilingualOrder && output.bilingualOrder !== "original-first") output.bilingualOrder = "translation-first";
  if (output.discoveryMode) {
    output.discoveryMode = String(output.discoveryMode).toLowerCase();
    if (output.discoveryMode !== "off" && output.discoveryMode !== "hls-only") output.discoveryMode = "full";
  }
  if (output.youtubeStrategy && output.youtubeStrategy !== "virtual") output.youtubeStrategy = "direct";
  if (output.source) output.source = GSS.Language ? GSS.Language.normalize(output.source) : String(output.source).toLowerCase();
  if (output.translationConcurrency !== undefined) output.translationConcurrency = Math.max(1, Math.min(4, Math.floor(output.translationConcurrency)));
  return output;
};

GSS.readStoredSettings = function readStoredSettings() {
  try { var raw = GSS.Runtime.read(GSS.SETTINGS_KEY); return raw ? GSS.normalizeSettings(JSON.parse(raw)) : {}; }
  catch (_) { return {}; }
};
GSS.saveSettings = function saveSettings(input) { return GSS.Runtime.write(JSON.stringify(GSS.normalizeSettings(input)), GSS.SETTINGS_KEY); };
GSS.resetSettings = function resetSettings() { return GSS.Runtime.write("", GSS.SETTINGS_KEY); };

GSS.readProviderSecrets = function readProviderSecrets() {
  try { return JSON.parse(GSS.Runtime.read(GSS.PROVIDER_SECRETS_KEY) || "{}"); } catch (_) { return {}; }
};
GSS.getProviderSecret = function getProviderSecret(provider, key) {
  var all = GSS.readProviderSecrets();
  return all[provider] && all[provider][key] ? String(all[provider][key]) : "";
};
GSS.saveProviderSecret = function saveProviderSecret(provider, key, value) {
  var all = GSS.readProviderSecrets();
  if (!all[provider]) all[provider] = {};
  if (value) all[provider][key] = String(value); else delete all[provider][key];
  return GSS.Runtime.write(JSON.stringify(all), GSS.PROVIDER_SECRETS_KEY);
};
GSS.providerHasKey = function providerHasKey(provider) { return !!GSS.getProviderSecret(provider, "apiKey"); };

GSS.getAdminToken = function getAdminToken() {
  var token = GSS.Runtime.read(GSS.ADMIN_TOKEN_KEY);
  if (token) return token;
  token = GSS.Hash ? GSS.Hash(String(Date.now()) + ":" + String(Math.random())) : String(Date.now());
  GSS.Runtime.write(token, GSS.ADMIN_TOKEN_KEY);
  return token;
};

GSS.getConfig = function getConfig() {
  var config = {};
  Object.keys(GSS.DEFAULTS).forEach(function (key) { config[key] = GSS.DEFAULTS[key]; });
  var args = GSS.normalizeSettings(GSS.parseArguments(typeof $argument !== "undefined" ? $argument : ""));
  var forcedDiscoveryMode = args.discoveryMode;
  Object.keys(args).forEach(function (key) { config[key] = args[key]; });
  var stored = GSS.readStoredSettings();
  Object.keys(stored).forEach(function (key) { config[key] = stored[key]; });
  // This compatibility switch must remain controllable from module arguments
  // even when older gss.local settings override normal module parameters.
  if (forcedDiscoveryMode) config.discoveryMode = forcedDiscoveryMode;
  if (args.presetMode) {
    var useHyMt2 = !!args.hyMt2Preset;
    var presetPlatforms = [];
    if (args.platformDiscovery) presetPlatforms.push("discovery");
    if (args.platformMax) presetPlatforms.push("max");
    if (args.platformPluto) presetPlatforms.push("pluto");
    if (args.platformPrime) presetPlatforms.push("prime");
    if (args.platformHulu) presetPlatforms.push("hulu");
    if (args.platformYoutube) { presetPlatforms.push("youtube"); presetPlatforms.push("youtube-tv"); }
    config.enabled = true;
    config.source = "auto";
    config.target = "zh-CN";
    config.trackName = "Translate-zh";
    config.provider = useHyMt2 ? "openai-compatible" : "google-free";
    config.fallbackProviders = useHyMt2 ? "google-free" : "";
    if (useHyMt2) {
      // Keep providerEndpoint in persistent settings so a private server URL and
      // API key never enter the public module. Shadowrocket only selects the
      // tested Hy-MT2 request profile here.
      config.providerModel = "hy-mt2-1.8b";
      config.providerPrompt = "Translate each subtitle naturally and concisely into Simplified Chinese. Preserve names, tone, punctuation, item count, and item order.";
      // These values belong to the fast fallback provider. The Hy-MT2 adapter
      // applies its own 512-token safety guard before sending a request.
      config.translationConcurrency = 4;
      config.batchItems = 12;
      config.batchChars = 1600;
    }
    config.platforms = presetPlatforms.join("|") || "none";
    config.discoveryMode = args.platformDiscovery ? (args.discoveryHlsOnly === false ? "full" : "hls-only") : "off";
    config.formats = "all";
    config.genericMode = !!args.genericMode;
    config.youtubeStrategy = "direct";
    config.youtubeUseAsr = args.youtubeUseAsr !== false;
    config.youtubeLive = args.youtubeLive !== false;
    config.youtubePreferManual = true;
    config.injectTranslated = !!args.injectTranslated;
    config.bilingualOrder = "translation-first";
    config.cacheEnabled = args.cacheEnabled !== false;
    config.logEnabled = args.logEnabled !== false;
    config.debug = !!args.debug;
    config.safePlayback = true;
    config.presetMode = true;
    config.hyMt2Preset = useHyMt2;
  }
  config.source = config.source || "auto";
  config.provider = config.provider || "google-free";
  config.trackName = config.trackName || "Translate-zh";
  config.translatedTrackName = config.translatedTrackName || "Translate-zh-only";
  config.platforms = config.platforms || "all";
  config.discoveryMode = config.discoveryMode || "full";
  config.formats = config.formats || "all";
  return config;
};
