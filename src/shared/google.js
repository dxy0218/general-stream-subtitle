GSS.GoogleTranslate = function GoogleTranslate(config, logger) {
  var endpoints = [
    "https://translate.googleapis.com/translate_a/single",
    "https://translate.google.com/translate_a/single"
  ];

  function parseResponse(body) {
    var data = JSON.parse(body);
    var output = "";
    if (!data || !Array.isArray(data[0])) throw new Error("Unexpected Google response");
    data[0].forEach(function (part) { if (part && typeof part[0] === "string") output += part[0]; });
    return output;
  }

  function requestText(text, source, target, callback, endpointIndex) {
    endpointIndex = endpointIndex || 0;
    if (endpointIndex >= endpoints.length) { callback(new Error("All Google Translate compatibility endpoints failed")); return; }
    var url = endpoints[endpointIndex]
      + "?client=gtx&dt=t"
      + "&sl=" + encodeURIComponent(source || "auto")
      + "&tl=" + encodeURIComponent(target)
      + "&q=" + encodeURIComponent(text);
    GSS.Runtime.httpGet(url, function (error, body) {
      if (error) {
        logger.warn("translation endpoint failed", { endpoint: endpoints[endpointIndex], error: String(error) });
        requestText(text, source, target, callback, endpointIndex + 1);
        return;
      }
      try { callback(null, parseResponse(body)); }
      catch (parseError) {
        logger.warn("translation response parse failed", { endpoint: endpoints[endpointIndex], error: String(parseError) });
        requestText(text, source, target, callback, endpointIndex + 1);
      }
    });
  }

  function translateSingles(texts, source, target, callback) {
    var result = new Array(texts.length);
    var index = 0;
    function next() {
      if (index >= texts.length) { callback(null, result); return; }
      var current = index;
      requestText(texts[current], source, target, function (error, translated) {
        if (error) { callback(error); return; }
        result[current] = translated;
        index += 1;
        next();
      });
    }
    next();
  }

  function parseMarkedTranslation(translated, count) {
    var output = new Array(count);
    var regex = /\[\[GSS_(\d{4})\]\]\s*([\s\S]*?)(?=\[\[GSS_\d{4}\]\]|$)/g;
    var match;
    while ((match = regex.exec(translated))) {
      var index = Number(match[1]);
      if (index >= 0 && index < count) output[index] = match[2].trim();
    }
    for (var i = 0; i < count; i += 1) if (typeof output[i] !== "string") return null;
    return output;
  }

  function translateBatch(batch, source, target, callback) {
    if (batch.length === 1) {
      requestText(batch[0], source, target, function (error, text) { callback(error, error ? null : [text]); });
      return;
    }
    var marked = batch.map(function (text, index) {
      var padded = ("0000" + String(index)).slice(-4);
      return "[[GSS_" + padded + "]]\n" + text;
    }).join("\n");
    requestText(marked, source, target, function (error, translated) {
      if (error) { callback(error); return; }
      var parsed = parseMarkedTranslation(translated, batch.length);
      if (parsed) { callback(null, parsed); return; }
      logger.warn("batch markers changed; falling back to individual requests", { items: batch.length });
      translateSingles(batch, source, target, callback);
    });
  }

  function makeBatches(texts) {
    var batches = [], current = [], currentChars = 0;
    texts.forEach(function (text) {
      var size = String(text).length + 24;
      if (current.length && (current.length >= config.batchItems || currentChars + size > config.batchChars)) {
        batches.push(current); current = []; currentChars = 0;
      }
      current.push(text); currentChars += size;
    });
    if (current.length) batches.push(current);
    return batches;
  }

  function translateMany(texts, source, target, callback) {
    if (!texts.length) { callback(null, []); return; }
    var batches = makeBatches(texts), output = [], index = 0;
    logger.info("translation started", { cues: texts.length, batches: batches.length, source: source, target: target });
    function next() {
      if (index >= batches.length) { callback(null, output); return; }
      translateBatch(batches[index], source, target, function (error, translated) {
        if (error) { callback(error); return; }
        output = output.concat(translated); index += 1; next();
      });
    }
    next();
  }

  return { translateMany: translateMany };
};
