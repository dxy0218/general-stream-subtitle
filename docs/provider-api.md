# Translation Provider API

Providers register themselves through:

```javascript
GSS.Providers.register(id, metadata, function factory(config, logger, secrets) {
  return {
    ready: function () { return true; },
    translateMany: function (texts, source, target, callback) {
      callback(null, translatedTexts);
    }
  };
});
```

- `texts` and the returned array must have the same length and order.
- Providers must call the callback exactly once.
- Providers must not log API keys.
- `ready()` should return false when required endpoint, model, or credentials are missing.
- Secrets are read with `GSS.getProviderSecret(providerId, "apiKey")` and must not enter module arguments or public health endpoints.
