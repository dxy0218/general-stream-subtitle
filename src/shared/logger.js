GSS.Logger = function Logger(config, scope) {
  var prefix = "[GSS " + GSS.VERSION + "][" + GSS.Runtime.name + "][" + scope + "]";
  function print(level, message, data) {
    if (level === "DEBUG" && !config.debug) return;
    var suffix = "";
    if (data !== undefined) {
      try { suffix = " " + JSON.stringify(data); } catch (_) { suffix = " " + String(data); }
    }
    console.log(prefix + "[" + level + "] " + message + suffix);
  }
  return {
    debug: function (message, data) { print("DEBUG", message, data); },
    info: function (message, data) { print("INFO", message, data); },
    warn: function (message, data) { print("WARN", message, data); },
    error: function (message, data) { print("ERROR", message, data); }
  };
};
