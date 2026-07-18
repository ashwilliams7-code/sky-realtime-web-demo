import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createLiveVoiceServer } from "../live-server.mjs";

async function withServer(run, fetchImpl = async (_url, options) => {
  const request = JSON.parse(options.body);
  assert.equal(request.model, "test-sky");
  assert.equal(request.stream, false);
  assert.equal(request.think, false);
  assert.equal(request.messages.at(-1).content, "Can you hear me?");
  return new Response(JSON.stringify({ message: { content: "Loud and clear, Ash. I can hear the browser voice turn." } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}) {
  const server = createLiveVoiceServer({ model: "test-sky", fetchImpl });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("serves a live runtime config and hardened page", async () => {
  await withServer(async (baseURL) => {
    const config = await fetch(`${baseURL}/runtime-config.js`);
    assert.equal(config.status, 200);
    assert.match(await config.text(), /liveVoice: true/);
    assert.match(config.headers.get("content-security-policy"), /connect-src 'self'/);
    assert.match(config.headers.get("permissions-policy"), /microphone=\(self\)/);

    const page = await fetch(`${baseURL}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /id="living-orb"/);
    assert.equal(page.headers.get("x-frame-options"), "DENY");
  });
});

test("proxies a bounded chat turn without persisting it", async () => {
  await withServer(async (baseURL) => {
    const response = await fetch(`${baseURL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Can you hear me?", history: [] }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.model, "test-sky");
    assert.equal(body.reply, "Loud and clear, Ash. I can hear the browser voice turn.");
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});

test("rejects wrong methods, media types, empty messages, and oversized bodies", async () => {
  await withServer(async (baseURL) => {
    assert.equal((await fetch(`${baseURL}/api/chat`)).status, 405);
    assert.equal((await fetch(`${baseURL}/api/chat`, { method: "POST", body: "{}" })).status, 415);
    assert.equal((await fetch(`${baseURL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })).status, 400);
    assert.equal((await fetch(`${baseURL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(13_000) }),
    })).status, 413);
  });
});

test("does not expose arbitrary local files", async () => {
  await withServer(async (baseURL) => {
    assert.equal((await fetch(`${baseURL}/live-server.mjs`)).status, 404);
    assert.equal((await fetch(`${baseURL}/../package.json`)).status, 404);
    assert.equal((await fetch(`${baseURL}/api/status`)).status, 200);
  });
});
