GSS.MPD = (function createMpdTools() {
  function attr(tag, name) {
    var match = String(tag || "").match(new RegExp("\\b" + name + "\\s*=\\s*([\\\"'])(.*?)\\1", "i"));
    return match ? match[2] : "";
  }

  function setAttr(tag, name, value) {
    var regex = new RegExp("(\\b" + name + "\\s*=\\s*)([\\\"']).*?\\2", "i");
    if (regex.test(tag)) return tag.replace(regex, "$1\"" + String(value).replace(/\"/g, "") + "\"");
    return tag.replace(/>$/, " " + name + "=\"" + String(value).replace(/\"/g, "") + "\">");
  }

  function textLike(startTag, block) {
    var mime = (attr(startTag, "mimeType") || attr(block, "mimeType") || "").toLowerCase();
    var contentType = (attr(startTag, "contentType") || "").toLowerCase();
    var codecs = (attr(startTag, "codecs") || attr(block, "codecs") || "").toLowerCase();
    return contentType === "text" || /text\/(vtt|plain)|application\/(ttml\+xml|xml)/.test(mime) || /(wvtt|stpp|ttml)/.test(codecs);
  }

  function score(startTag, block, config) {
    var language = attr(startTag, "lang") || attr(block, "lang");
    var labelMatch = block.match(/<Label\b[^>]*>([\s\S]*?)<\/Label>/i);
    var label = labelMatch ? GSS.Formats.stripTags(labelMatch[1]) : "";
    if (!GSS.Language.matches(language, label, config.source)) return -10000;
    var value = GSS.Language.priority(language, label, config.sourcePriority);
    if (/forced/i.test(block)) value -= 100;
    if (/caption|sdh|description/i.test(label)) value -= 8;
    if (/selectionPriority\s*=\s*["']1["']/i.test(startTag)) value += 20;
    return value;
  }

  function duplicate(block, requestUrl, config, platform) {
    var startMatch = block.match(/^<AdaptationSet\b[^>]*>/i);
    if (!startMatch) return null;
    var baseMatch = block.match(/<BaseURL\b[^>]*>([\s\S]*?)<\/BaseURL>/i);
    if (!baseMatch) return null;
    if (/<SegmentTemplate\b|<SegmentList\b|<SegmentBase\b/i.test(block)) return null;
    var language = attr(startMatch[0], "lang") || "auto";
    var origin = GSS.Url.resolve(requestUrl, GSS.Formats.stripTags(baseMatch[1]));
    var virtual = GSS.Url.virtual(config.virtualOrigin, "/subtitle", {
      origin: origin,
      mode: "bilingual",
      source: GSS.Language.googleSource(language, config.source),
      target: config.target,
      platform: platform ? platform.id : "unknown",
      version: GSS.VERSION
    });
    var startTag = setAttr(startMatch[0], "id", "gss-" + GSS.Hash(origin).slice(0, 8));
    startTag = setAttr(startTag, "lang", config.target);
    var output = block.replace(startMatch[0], startTag).replace(baseMatch[0], "<BaseURL>" + GSS.Formats.escapeXml(virtual) + "</BaseURL>");
    if (/<Label\b/i.test(output)) output = output.replace(/<Label\b[^>]*>[\s\S]*?<\/Label>/i, "<Label>" + GSS.Formats.escapeXml(config.trackName) + "</Label>");
    else output = output.replace(startTag, startTag + "<Label>" + GSS.Formats.escapeXml(config.trackName) + "</Label>");
    return output;
  }

  function injectTrack(body, requestUrl, config, logger, platform) {
    if (!config.enabled || !/<MPD\b/i.test(String(body || "")) || String(body).indexOf("gss.local/subtitle") >= 0) return body;
    var regex = /<AdaptationSet\b[^>]*>[\s\S]*?<\/AdaptationSet>/gi, match, best = null;
    while ((match = regex.exec(body))) {
      var startTag = (match[0].match(/^<AdaptationSet\b[^>]*>/i) || [""])[0];
      if (!textLike(startTag, match[0])) continue;
      var currentScore = score(startTag, match[0], config);
      if (currentScore < -1000) continue;
      if (!best || currentScore > best.score) best = { block: match[0], end: regex.lastIndex, score: currentScore };
    }
    if (!best) {
      logger.info("DASH manifest inspected", { platform: platform ? platform.id : "unknown", injected: 0, reason: "no matching text adaptation" });
      return body;
    }
    var clone = duplicate(best.block, requestUrl, config, platform);
    if (!clone) {
      logger.info("DASH manifest inspected", { platform: platform ? platform.id : "unknown", injected: 0, reason: "segmented or unsupported text adaptation" });
      return body;
    }
    logger.info("DASH manifest inspected", { platform: platform ? platform.id : "unknown", injected: 1, trackName: config.trackName });
    return body.slice(0, best.end) + clone + body.slice(best.end);
  }

  return { injectTrack: injectTrack };
})();
