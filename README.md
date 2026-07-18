# Sky Realtime · First Light Web Demo

A static, mobile-first browser translation of the native Sky Realtime **FIRST LIGHT** observatory UI. It is designed for remote interaction testing on iPhone Safari and for deployment from a GitHub Pages branch.

## Safety and privacy

This is an interface simulation, not a live voice client.

- **No network or API calls** are made by the application.
- **No microphone permission** is requested.
- **No user data or settings** are stored.
- **No API credits** are used.
- The Latency Lab displays deterministic fixture data only.

The browser still loads the static page files from whichever host serves them. All runtime behavior after loading is local and deterministic.

## Run locally

From this directory:

```bash
python3 -m http.server 4173
```

Then open <http://127.0.0.1:4173/>. For iPhone testing on the same LAN, bind to all interfaces and open the Mac's LAN address from Safari:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

## Smoke test

No dependencies or package install are required. Node.js 18+ is recommended.

```bash
node tests/smoke.mjs
```

The smoke test checks JavaScript syntax, required static/PWA assets and UI landmarks, privacy invariants, forbidden browser APIs, relative asset references, and HTTP serving of all public files.

## Interaction map

1. Tap the amber primary control to start.
2. The deterministic sequence runs: connecting → listening → thinking → speaking → listening.
3. During speaking, the primary control interrupts Sky. During listening it ends the session.
4. Tap the model plate for model, voice, tool-simulation, privacy, reset, and error-preview controls.
5. Tap **Latency Lab** or swipe upward on the conversation screen for the full-screen fixture dashboard.

## GitHub Pages

The repository is plain static HTML/CSS/JavaScript with relative paths and needs no build step. Publish the repository root from a Pages branch or copy these files into a Pages artifact:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `favicon.svg`

No remote is configured by this project setup.
