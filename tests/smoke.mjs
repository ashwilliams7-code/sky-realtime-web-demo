import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const publicFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "runtime-config.js",
  "manifest.webmanifest",
  "favicon.svg",
  ".nojekyll",
];
const privateRuntimeFiles = ["live-server.mjs", "tests/live-server.test.mjs"];

for (const relativePath of [...publicFiles, ...privateRuntimeFiles]) {
  const file = await stat(path.join(root, relativePath));
  assert(file.isFile(), `${relativePath} must be a file`);
}

const [html, css, js, manifestText] = await Promise.all([
  readFile(path.join(root, "index.html"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
  readFile(path.join(root, "app.js"), "utf8"),
  readFile(path.join(root, "manifest.webmanifest"), "utf8"),
]);

const requiredHTML = [
  'id="conversation-screen"',
  'id="living-orb"',
  'id="primary-control"',
  'id="settings-sheet"',
  'id="latency-lab"',
  'id="latency-close"',
  'id="mode-stamp"',
  "WEB DEMO",
  "No audio or data leaves this device.",
];
for (const landmark of requiredHTML) {
  assert(html.includes(landmark), `Missing HTML landmark: ${landmark}`);
}

for (const asset of ["styles.css", "runtime-config.js", "app.js", "manifest.webmanifest", "favicon.svg"]) {
  assert(html.includes(asset), `index.html must reference ${asset}`);
}

const manifest = JSON.parse(manifestText);
assert.equal(manifest.display, "standalone");
assert.equal(manifest.orientation, "portrait-primary");
assert.equal(manifest.start_url, "./");

assert(css.includes("env(safe-area-inset-top)"), "Top safe-area handling is required");
assert(css.includes("env(safe-area-inset-bottom)"), "Bottom safe-area handling is required");
assert(css.includes("prefers-reduced-motion"), "Reduced-motion fallback is required");
assert(js.includes("startDemo"), "Deterministic demo flow is required");
assert(js.includes("interruptDemo"), "Demo interrupt flow is required");
assert(js.includes("startLiveVoiceSession"), "Live voice flow is required");
assert(js.includes("speechRecognitionAPI"), "Safari speech recognition integration is required");
assert(js.includes('fetch("/api/chat"'), "Live reasoning must use the same-origin chat route");

const forbiddenRuntimeAPIs = [
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bgetUserMedia\b/,
  /\bmediaDevices\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,
  /serviceWorker\.register/,
];
for (const pattern of forbiddenRuntimeAPIs) {
  assert(!pattern.test(js), `Forbidden runtime API found: ${pattern}`);
}
assert(!/https?:\/\//.test(html.replace(/<meta property="og:url"[^>]*>/g, "")), "Public HTML assets must be relative");
assert(!/fetch\s*\(\s*["']https?:\/\//.test(js), "Browser runtime must not call a remote origin directly");

for (const script of ["app.js", "runtime-config.js", "live-server.mjs"]) {
  const check = spawnSync(process.execPath, ["--check", path.join(root, script)], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr || `${script} syntax check failed`);
}

const port = 41739;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
try {
  await Promise.race([
    once(server.stderr, "data"),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
  for (const relativePath of publicFiles.filter((file) => file !== ".nojekyll")) {
    const response = await fetch(`http://127.0.0.1:${port}/${relativePath}`);
    assert.equal(response.status, 200, `${relativePath} must be served successfully`);
    assert((await response.arrayBuffer()).byteLength > 0, `${relativePath} must not be empty`);
  }
} finally {
  server.kill("SIGTERM");
  await once(server, "exit").catch(() => {});
}

console.log("SKY_WEB_DEMO_SMOKE_OK");
