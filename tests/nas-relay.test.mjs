import assert from "node:assert/strict";
import test from "node:test";
import { createRelayServer } from "../nas-companion/relay/server.mjs";

const TOKEN = "test-token-with-at-least-thirty-two-characters";

async function withServer(options, run) {
  const server = createRelayServer({ token: TOKEN, ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("relay requires authentication and returns translated text", async () => {
  const upstream = async () => ({ ok: true, json: async () => [[['你好']]] });
  await withServer({ fetchImpl: upstream }, async (base) => {
    const unauthorized = await fetch(`${base}/v1/translate`, { method: "POST", body: "{}" });
    assert.equal(unauthorized.status, 401);
    const response = await fetch(`${base}/v1/translate`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ text: "hello", source: "en", target: "zh-CN" })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { translation: "你好" });
  });
});

test("relay rate limits authenticated clients", async () => {
  const upstream = async () => ({ ok: true, json: async () => [[['你好']]] });
  await withServer({ fetchImpl: upstream, maxRequestsPerMinute: 1 }, async (base) => {
    const options = { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ text: "hello" }) };
    assert.equal((await fetch(`${base}/v1/translate`, options)).status, 200);
    assert.equal((await fetch(`${base}/v1/translate`, options)).status, 429);
  });
});
