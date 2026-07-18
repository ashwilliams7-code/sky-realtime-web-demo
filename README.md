# Sky Realtime · First Light Web

A mobile-first browser translation of the native Sky Realtime **FIRST LIGHT** observatory UI. It has two explicit modes:

1. **Static visual demo** — deterministic state animation, no microphone, network reasoning, or credits.
2. **Live voice test** — Safari speech recognition, private local Sky reasoning through Ollama, and Safari speech synthesis.

## Privacy and capability boundary

### Static visual demo

- Requests no microphone permission.
- Stores no user data or settings.
- Uses deterministic fixture data in the Latency Lab.
- Makes no chat or model request.

### Live voice test

- Microphone access starts only after the user taps **Start Voice** and accepts Safari’s permission prompt.
- Safari’s speech service may process audio to produce text.
- Sky sends only the recognized text to the same-origin local reasoning route.
- Sky stores no audio, transcript, setting, identifier, or conversation history; browser state is memory-only and disappears on refresh.
- The local model has no tools, file access, or action permissions through this server.
- The endpoint is rate-limited, limited to two concurrent generations, and exposes only the static app, health/status, and bounded chat routes.
- No paid AI API or API key is used.

## Run the static demo

```bash
npm run serve
```

Open <http://127.0.0.1:4173/>.

## Run live voice

Ollama must be running with the configured model available. The default model is `qwen3.5:9b`.

```bash
npm run serve:live
```

Open <http://127.0.0.1:4180/> in Safari, tap **Start Voice**, and allow microphone access. Optional environment names:

- `SKY_LOCAL_MODEL` — local Ollama model, defaults to `qwen3.5:9b`
- `OLLAMA_URL` — local Ollama chat endpoint
- `HOST` — defaults to `127.0.0.1`
- `PORT` — defaults to `4180`

For a temporary remote test, expose only port 4180 through an HTTPS tunnel. The link works only while the Mac, Ollama, the live server, and the tunnel remain online.

## Verification

```bash
npm test
```

The suite checks:

- JavaScript syntax and required static/PWA assets
- mobile safe-area and reduced-motion contracts
- same-origin-only browser reasoning requests
- live runtime configuration and security headers
- bounded chat proxy behavior
- method, content-type, empty-body, oversized-body, and arbitrary-file rejection
- HTTP serving of all public static assets

## Interaction map

1. Tap the primary control.
2. In static mode, the deterministic sequence runs: connecting → listening → thinking → speaking → listening.
3. In live mode, allow Safari microphone access and speak naturally.
4. Sky displays the recognized words, asks the local model for a brief reply, speaks it, and listens again.
5. Tap the primary control during speech to interrupt. Tap it while listening or thinking to end the session.
6. Tap the model plate for voice/privacy information, or open **Latency Lab** for the fixture dashboard.

## GitHub Pages

The public GitHub Pages URL serves the static visual demo because it has no private backend. Real voice mode is served only by `live-server.mjs` through a temporary or authenticated HTTPS route.
