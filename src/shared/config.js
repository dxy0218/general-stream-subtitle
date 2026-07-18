GSS.VERSION = "0.2.0";
GSS.SETTINGS_KEY = "GSS_SETTINGS_V1";
GSS.ADMIN_TOKEN_KEY = "GSS_ADMIN_TOKEN_V1";

GSS.DEFAULTS = {
  enabled: true,
  provider: "google",
  source: "en",
  target: "zh-CN",
  trackName: "Translate-zh",
  injectTranslated: false,
  translatedTrackName: "Translate-zh-only",
  bilingualOrder: "translation-first",
  debug: true,
  cacheEnabled: true,
  cacheTTL: 6 * 60 * 60 * 1000,
  cacheLimit: 100,
  batchChars: 1000,
  batchItems: 6,
  virtualOrigin: "https://gss.local"
};

GSS.parseArguments = function parseArguments(raw) {
  var result = {};
  if (!raw || typeof raw !== "string") return result;
  raw.replace(/^\?/, "").split(/[&,]/).forEach(function (pair) {
    if (!pair) return;
    var index = pair.indexOf("=");
    var key = index >= 0 ? pair.slice(0, index) : pair;
    var value = index >= 0 ? pair.slice(index + 1) : "true";
    try {
      key = decodeURIComponent(key.trim());
      value = decodeURIComponent(value.trim());
    } catch (_) {}
    if (key) result[key] = value;
  });
  return result;
};

GSS.asBoolean = function asBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
};

GSS.allowedSettings = {
  enabled: "boolean",
  provider: "string",
  source: "string",
  target: "string",
  trackName: "string",
  injectTranslated: "boolean",
  translatedTrackName: "string",
  bilingualOrder: "string",
  debug: "boolean",
  cacheEnabled: "boolean",
  cacheTTL: "number"
};

GSS.normalizeSettings = function normalizeSettings(input) {
  var output = {};
  Object.keys(GSS.allowedSettings).forEach(function (key) {
    if (!input || input[key] === undefined || input[key] === null || input[key] === "") return;
    var type = GSS.allowedSettings[key];
    if (type === "boolean") output[key] = GSS.asBoolean(input[key], false);
    else if (type === "number" && !isNaN(Number(input[key]))) output[key] = Math.max(0, Number(input[key]));
    else if (type === "string") output[key] = String(input[key]).slice(0, 120);
  });
  if (output.provider && output.provider !== "google") output.provider = "google";
  if (output.bilingualOrder && output.bilingualOrder !== "original-first") output.bilingualOrder = "translation-first";
  return output;
};

GSS.readStoredSettings = function readStoredSettings() {
  try {
    var raw = GSS.Runtime.read(GSS.SETTINGS_KEY);
    return raw ? GSS.normalizeSettings(JSON.parse(raw)) : {};
  } catch (_) {
    return {};
  }
};

GSS.saveSettings = function saveSettings(input) {
  var normalized = GSS.normalizeSettings(input);
  return GSS.Runtime.write(JSON.stringify(normalized), GSS.SETTINGS_KEY);
};

GSS.resetSettings = function resetSettings() {
  return GSS.Runtime.write("", GSS.SETTINGS_KEY);
};

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
  Object.keys(args).forEach(function (key) { config[key] = args[key]; });

  var stored = GSS.readStoredSettings();
  Object.keys(stored).forEach(function (key) { config[key] = stored[key]; });

  config.trackName = config.trackName || "Translate-zh";
  config.translatedTrackName = config.translatedTrackName || "Translate-zh-only";
  return config;
};
