GSS.Logger = function Logger(config, scope) {
  var prefix = "[GSS " + GSS.VERSION + "][" + GSS.Runtime.name + "][" + scope + "]";
  function persist(level, message, data) {
    if (!config.logEnabled || !GSS.Diagnostics) return;
    if (!config.debug && (level === "DEBUG" || level === "INFO")) return;
    GSS.Diagnostics.record({
      scope: scope,
      type: "runtime-log",
      level: level.toLowerCase(),
      status: level === "ERROR" ? "failed" : level === "WARN" ? "warning" : "observed",
      message: message,
      details: data
    });
  }
  function print(level, message, data) {
    persist(level, message, data);
    if (!config.debug && (level === "DEBUG" || level === "INFO")) return;
    var safeMessage = GSS.Diagnostics && GSS.Diagnostics.sanitize ? GSS.Diagnostics.sanitize(message) : message;
    var safeData = GSS.Diagnostics && GSS.Diagnostics.sanitize ? GSS.Diagnostics.sanitize(data) : data;
    var suffix = "";
    if (safeData !== undefined) {
      try { suffix = " " + JSON.stringify(safeData); } catch (_) { suffix = " " + String(safeData); }
    }
    console.log(prefix + "[" + level + "] " + safeMessage + suffix);
  }
  return {
    debug: function (message, data) { print("DEBUG", message, data); },
    info: function (message, data) { print("INFO", message, data); },
    warn: function (message, data) { print("WARN", message, data); },
    error: function (message, data) { print("ERROR", message, data); }
  };
};
