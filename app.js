(() => {
  "use strict";

  const models = {
    realtime21: { display: "Realtime 2.1", short: "2.1" },
    realtimeGA: { display: "Realtime GA", short: "GA" },
    gpt4oRealtimePreview: { display: "GPT-4o Preview", short: "4O" }
  };

  const phaseMeta = {
    idle: {
      status: "Ready",
      visual: "idle",
      orbLabel: "Sky is ready",
      actionLabel: "Start demo session",
      actionHint: "START DEMO",
      icon: "start"
    },
    connecting: {
      status: "Connecting",
      visual: "thinking",
      orbLabel: "Sky is connecting",
      actionLabel: "Cancel demo session",
      actionHint: "CANCEL",
      icon: "cancel"
    },
    listening: {
      status: "Listening",
      visual: "listening",
      orbLabel: "Sky is listening",
      actionLabel: "End demo session",
      actionHint: "END SESSION",
      icon: "stop"
    },
    thinking: {
      status: "Thinking",
      visual: "thinking",
      orbLabel: "Sky is thinking",
      actionLabel: "Cancel demo response",
      actionHint: "CANCEL",
      icon: "cancel"
    },
    speaking: {
      status: "Speaking",
      visual: "speaking",
      orbLabel: "Sky is speaking",
      actionLabel: "Interrupt Sky",
      actionHint: "INTERRUPT",
      icon: "interrupt"
    },
    error: {
      status: "Connection issue",
      visual: "error",
      orbLabel: "Sky has a connection issue",
      actionLabel: "Retry demo connection",
      actionHint: "RETRY",
      icon: "retry"
    }
  };

  const state = {
    phase: "idle",
    caption: "Tap Start when you’re ready.",
    model: "realtime21",
    voice: "openAIRealtime",
    muted: false,
    protectedTools: false,
    archivedCaptions: [],
    timers: new Set(),
    interruptedUntil: 0,
    runCount: 5,
    lastFocus: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const elements = {
    app: $("#app"),
    conversation: $("#conversation-screen"),
    headerStatus: $("#header-status"),
    phaseLabel: $("#phase-label"),
    caption: $("#caption"),
    captionOldest: $("#caption-oldest"),
    captionRecent: $("#caption-recent"),
    orbContainer: $("#orb-container"),
    orb: $("#living-orb"),
    mic: $("#mic-control"),
    micIcon: $("#mic-icon"),
    settingsControl: $("#settings-control"),
    modelShort: $("#model-short"),
    primary: $("#primary-control"),
    primaryIcon: $("#primary-icon"),
    primaryHint: $("#primary-hint"),
    latencyHandle: $("#latency-handle"),
    settingsBackdrop: $("#settings-backdrop"),
    settings: $("#settings-sheet"),
    settingsClose: $("#settings-close"),
    latency: $("#latency-lab"),
    latencyClose: $("#latency-close"),
    announcer: $("#announcer"),
    runCount: $("#run-count"),
    runTest: $("#run-test")
  };

  const excludedCaptions = new Set([
    "",
    "Thinking…",
    "I’m listening.",
    "Opening a private demo session…"
  ]);

  function icon(name) {
    const attrs = 'viewBox="0 0 24 24" focusable="false"';
    const icons = {
      start: `<svg ${attrs} fill="none"><path d="M4 14v-4M8 17V7M12 20V4M16 17V7M20 14v-4"/></svg>`,
      cancel: `<svg ${attrs} fill="none"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
      stop: `<svg ${attrs} fill="none"><rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none"/></svg>`,
      interrupt: `<svg ${attrs} fill="none"><path d="M7.3 11V6.5a1.3 1.3 0 0 1 2.6 0V10m0-4.8a1.3 1.3 0 0 1 2.6 0V10m0-4a1.3 1.3 0 0 1 2.6 0v4.7m0-3.3a1.3 1.3 0 0 1 2.6 0v5.2c0 4.2-2.5 6.4-6 6.4-2.6 0-4.2-1.2-5.4-3l-2-3a1.4 1.4 0 0 1 2.1-1.8l.9.8Z"/></svg>`,
      retry: `<svg ${attrs} fill="none"><path d="M20 11a8 8 0 1 0-2.35 5.66M20 5v6h-6"/></svg>`,
      mic: `<svg ${attrs} fill="none"><rect x="8.3" y="3" width="7.4" height="12" rx="3.7"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/></svg>`,
      micMuted: `<svg ${attrs} fill="none"><path d="M9 5.5V5a3 3 0 0 1 5.8-1M15 10.8V12a3 3 0 0 1-4.8 2.4M5 5l14 14M5.5 11.5a6.5 6.5 0 0 0 10.7 5M12 18v3M9 21h6M18.5 11.5c0 .7-.1 1.4-.3 2"/></svg>`
    };
    return icons[name];
  }

  function schedule(callback, delay) {
    const timer = window.setTimeout(() => {
      state.timers.delete(timer);
      callback();
    }, delay);
    state.timers.add(timer);
    return timer;
  }

  function clearDemoTimers() {
    state.timers.forEach((timer) => window.clearTimeout(timer));
    state.timers.clear();
  }

  function archiveCaption(caption) {
    const clean = caption.trim();
    if (excludedCaptions.has(clean) || state.archivedCaptions.at(-1) === clean) return;
    state.archivedCaptions.push(clean);
    state.archivedCaptions = state.archivedCaptions.slice(-3);
  }

  function setCaption(caption) {
    state.caption = caption;
    elements.caption.textContent = caption;
  }

  function updateArchivedCaptions() {
    const visible = state.archivedCaptions.slice(-2);
    elements.captionOldest.textContent = visible.length > 1 ? visible[0] : "";
    elements.captionRecent.textContent = visible.at(-1) || "";
  }

  function setPhase(phase, caption, options = {}) {
    if (!phaseMeta[phase]) throw new Error(`Unknown demo phase: ${phase}`);
    if (phase !== state.phase && options.archive !== false) archiveCaption(state.caption);
    state.phase = phase;
    if (typeof caption === "string") setCaption(caption);
    updateArchivedCaptions();
    renderState();
  }

  function renderState() {
    const meta = phaseMeta[state.phase];
    const status = state.phase === "listening" && state.muted ? "Muted" : meta.status;
    const visual = performance.now() < state.interruptedUntil ? "interrupted" : meta.visual;
    const orbLabel = visual === "interrupted" ? "Sky was interrupted" : meta.orbLabel;
    const model = models[state.model];

    elements.app.dataset.phase = state.phase;
    elements.orbContainer.dataset.visualState = visual;
    elements.headerStatus.textContent = `${model.display} · ${status}`.toUpperCase();
    elements.phaseLabel.textContent = status.toUpperCase();
    elements.orb.setAttribute("aria-label", orbLabel);
    elements.modelShort.textContent = model.short;
    elements.settingsControl.setAttribute("aria-label", `Model and voice settings, current model ${model.display}`);
    elements.primary.setAttribute("aria-label", meta.actionLabel);
    elements.primaryIcon.innerHTML = icon(meta.icon);
    elements.primaryHint.textContent = meta.actionHint;

    const micEnabled = ["listening", "thinking", "speaking"].includes(state.phase);
    elements.mic.disabled = !micEnabled;
    elements.mic.classList.toggle("muted", state.muted);
    elements.mic.setAttribute("aria-pressed", String(state.muted));
    elements.mic.setAttribute("aria-label", state.muted ? "Unmute microphone" : "Mute microphone");
    elements.micIcon.innerHTML = icon(state.muted ? "micMuted" : "mic");

    requestOrbDraw();
  }

  function resetDemo(announce = false) {
    clearDemoTimers();
    state.muted = false;
    state.interruptedUntil = 0;
    state.archivedCaptions = [];
    setPhase("idle", "Tap Start when you’re ready.", { archive: false });
    if (announce) elements.announcer.textContent = "Demo reset. Sky is ready.";
  }

  function startDemo() {
    clearDemoTimers();
    state.muted = false;
    state.interruptedUntil = 0;
    setPhase("connecting", "Opening a private demo session…");

    schedule(() => {
      setPhase("listening", "I’m listening.");
      schedule(() => {
        setCaption("Can you hear me, Sky?");
        renderState();
        schedule(() => {
          setPhase("thinking", "Thinking…");
          schedule(() => {
            setCaption("Preparing a response…");
            schedule(() => {
              setPhase("speaking", "Loud and clear. This is the private on-device web demo.");
              schedule(() => setPhase("listening", "I’m listening."), 3000);
            }, 420);
          }, 700);
        }, 1100);
      }, 900);
    }, 650);
  }

  function interruptDemo() {
    clearDemoTimers();
    state.interruptedUntil = performance.now() + 600;
    setPhase("listening", "Interrupted. I’m listening.");
    elements.announcer.textContent = "Sky interrupted. Listening again.";
    schedule(() => renderState(), 610);
  }

  function handlePrimaryAction() {
    switch (state.phase) {
      case "idle":
      case "error":
        startDemo();
        break;
      case "speaking":
        interruptDemo();
        break;
      case "connecting":
      case "listening":
      case "thinking":
        resetDemo(true);
        break;
      default:
        break;
    }
  }

  function setModel(modelID) {
    if (!models[modelID] || modelID === state.model) return;
    const wasActive = state.phase !== "idle";
    state.model = modelID;
    $$("input[name='model']").forEach((input) => { input.checked = input.value === modelID; });
    $$(".model-pills button").forEach((button) => button.classList.toggle("selected", button.dataset.model === modelID));
    if (wasActive) resetDemo();
    else renderState();
  }

  function toggleMicrophone() {
    if (elements.mic.disabled) return;
    state.muted = !state.muted;
    if (state.phase === "listening") {
      setCaption(state.muted ? "Microphone muted — visual demo only." : "I’m listening.");
    }
    renderState();
  }

  function focusableElements(container) {
    return $$("button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])", container)
      .filter((element) => !element.hidden && element.getClientRects().length > 0);
  }

  function trapFocus(event, container) {
    if (event.key !== "Tab") return;
    const items = focusableElements(container);
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openSettings() {
    state.lastFocus = document.activeElement;
    elements.settingsBackdrop.hidden = false;
    elements.settings.hidden = false;
    elements.conversation.inert = true;
    document.body.classList.add("modal-open");
    window.requestAnimationFrame(() => elements.settingsClose.focus());
  }

  function closeSettings(restoreFocus = true) {
    elements.settings.hidden = true;
    elements.settingsBackdrop.hidden = true;
    elements.conversation.inert = false;
    document.body.classList.remove("modal-open");
    if (restoreFocus && state.lastFocus instanceof HTMLElement) state.lastFocus.focus();
  }

  function openLatencyLab() {
    if (!elements.settings.hidden) closeSettings(false);
    state.lastFocus = document.activeElement;
    elements.latency.hidden = false;
    elements.conversation.inert = true;
    document.body.classList.add("modal-open");
    window.requestAnimationFrame(() => elements.latencyClose.focus());
  }

  function closeLatencyLab(restoreFocus = true) {
    elements.latency.hidden = true;
    elements.conversation.inert = false;
    document.body.classList.remove("modal-open");
    if (restoreFocus && state.lastFocus instanceof HTMLElement) state.lastFocus.focus();
  }

  function previewError() {
    closeSettings(false);
    clearDemoTimers();
    state.interruptedUntil = 0;
    setPhase("error", "I couldn’t restore the private demo session.");
    elements.primary.focus();
  }

  function setupHistorySparklines() {
    $$(".history-row").forEach((row) => {
      const values = row.dataset.values.split(",").map(Number);
      const minimum = Math.min(...values);
      const maximum = Math.max(...values);
      const range = Math.max(1, maximum - minimum);
      const points = values.map((value, index) => {
        const x = (180 * index) / Math.max(1, values.length - 1);
        const y = 26 - ((value - minimum) / range) * 24;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
      $("polyline", row).setAttribute("points", points);
      row.addEventListener("click", () => {
        const expanded = row.getAttribute("aria-expanded") === "true";
        row.setAttribute("aria-expanded", String(!expanded));
        $(".history-values", row).hidden = expanded;
      });
    });
  }

  function updateRunCount(delta) {
    state.runCount = Math.min(9, Math.max(1, state.runCount + delta));
    elements.runCount.textContent = String(state.runCount);
    elements.runTest.textContent = state.phase === "idle" || state.phase === "error"
      ? `START ${state.runCount}-RUN TEST`
      : "RETURN TO VOICE";
  }

  function startFixtureRun() {
    closeLatencyLab(false);
    if (state.phase === "idle" || state.phase === "error") startDemo();
    elements.primary.focus();
  }

  function bindEvents() {
    elements.primary.addEventListener("click", handlePrimaryAction);
    elements.mic.addEventListener("click", toggleMicrophone);
    elements.settingsControl.addEventListener("click", openSettings);
    elements.settingsClose.addEventListener("click", () => closeSettings());
    elements.settingsBackdrop.addEventListener("click", () => closeSettings());
    elements.latencyHandle.addEventListener("click", openLatencyLab);
    elements.latencyClose.addEventListener("click", () => closeLatencyLab());
    $("#preview-error").addEventListener("click", previewError);
    $("#reset-demo").addEventListener("click", () => { closeSettings(false); resetDemo(true); elements.primary.focus(); });
    $("#tools-toggle").addEventListener("change", (event) => { state.protectedTools = event.target.checked; });
    $$("input[name='model']").forEach((input) => input.addEventListener("change", () => setModel(input.value)));
    $$("input[name='voice']").forEach((input) => input.addEventListener("change", () => { state.voice = input.value; }));
    $$(".model-pills button").forEach((button) => button.addEventListener("click", () => setModel(button.dataset.model)));
    $("#runs-minus").addEventListener("click", () => updateRunCount(-1));
    $("#runs-plus").addEventListener("click", () => updateRunCount(1));
    elements.runTest.addEventListener("click", startFixtureRun);

    document.addEventListener("keydown", (event) => {
      if (!elements.latency.hidden) {
        if (event.key === "Escape") closeLatencyLab();
        else trapFocus(event, elements.latency);
      } else if (!elements.settings.hidden) {
        if (event.key === "Escape") closeSettings();
        else trapFocus(event, elements.settings);
      }
    });

    let touchStart = null;
    elements.conversation.addEventListener("touchstart", (event) => {
      const touch = event.changedTouches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });
    elements.conversation.addEventListener("touchend", (event) => {
      if (!touchStart) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      touchStart = null;
      if (dy < -64 && Math.abs(dx) < 90) openLatencyLab();
    }, { passive: true });
  }

  // Canvas orb renderer: a deterministic browser translation of LivingOrbView.
  const orbContext = elements.orb.getContext("2d", { alpha: true });
  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduceTransparencyQuery = window.matchMedia("(prefers-reduced-transparency: reduce)");
  let orbWidth = 0;
  let orbHeight = 0;
  let orbNeedsDraw = true;

  function color(hex, opacity = 1) {
    const value = hex.replace("#", "");
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${red},${green},${blue},${opacity})`;
  }

  function deterministicUnit(index, salt) {
    const value = Math.sin(index * 97 + salt * 31) * 43758.5453;
    return value - Math.floor(value);
  }

  function resizeOrb() {
    const bounds = elements.orb.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    if (elements.orb.width !== Math.round(width * dpr) || elements.orb.height !== Math.round(height * dpr)) {
      elements.orb.width = Math.round(width * dpr);
      elements.orb.height = Math.round(height * dpr);
      elements.orb.style.width = `${width}px`;
      elements.orb.style.height = `${height}px`;
    }
    orbContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    orbWidth = width;
    orbHeight = height;
    requestOrbDraw();
  }

  function requestOrbDraw() { orbNeedsDraw = true; }

  function drawArc(context, cx, cy, radius, start, end, stroke, width) {
    context.beginPath();
    context.arc(cx, cy, radius, start, end);
    context.strokeStyle = stroke;
    context.lineWidth = width;
    context.stroke();
  }

  function drawOrb(time) {
    const context = orbContext;
    if (!orbWidth || !orbHeight) return;
    const reducedMotion = reduceMotionQuery.matches;
    const reducedTransparency = reduceTransparencyQuery.matches;
    const now = performance.now();
    const visual = now < state.interruptedUntil ? "interrupted" : phaseMeta[state.phase].visual;
    const seconds = time / 1000;
    const cx = orbWidth / 2;
    const cy = orbHeight / 2;
    const baseRadius = Math.min(orbWidth, orbHeight) * 0.31;
    const meter = reducedMotion ? 0.42 : visual === "speaking"
      ? 0.5 + Math.sin(seconds * 8.4) * 0.18
      : visual === "listening" ? 0.4 + Math.sin(seconds * 4.2) * 0.18 : 0.08;

    let scale = 1;
    if (visual === "interrupted" && !reducedMotion) {
      const elapsed = Math.max(0, 600 - (state.interruptedUntil - now));
      if (elapsed < 120) scale = 1 - (elapsed / 120) * 0.08;
      else if (elapsed < 200) scale = 0.92;
      else scale = 0.92 + (1 - Math.pow(1 - ((elapsed - 200) / 400), 3)) * 0.08;
    }
    const breath = visual === "idle" && !reducedMotion ? 1 + Math.sin(seconds * Math.PI * 0.2) * 0.01 : 1;
    const radius = baseRadius * scale * breath;
    const limbColor = visual === "error" ? "#b3543e" : "#f4f6fa";

    context.clearRect(0, 0, orbWidth, orbHeight);

    // Instrument star field.
    for (let index = 0; index < 42; index += 1) {
      const x = deterministicUnit(index, 17) * orbWidth;
      const y = deterministicUnit(index, 53) * orbHeight;
      if (Math.hypot(x - cx, y - cy) <= radius * 1.22) continue;
      const depth = deterministicUnit(index, 89);
      const diameter = 0.7 + depth;
      context.beginPath();
      context.arc(x, y, diameter / 2, 0, Math.PI * 2);
      context.fillStyle = color("#f4f6fa", Math.min(0.045 + depth * 0.07, 0.12));
      context.fill();
    }

    // Corona.
    const coronaRadius = radius * 1.48;
    let coronaOpacity = 0.055;
    if (visual === "listening") coronaOpacity = 0.07 + meter * 0.085;
    if (visual === "thinking") coronaOpacity = 0.075;
    if (visual === "speaking") coronaOpacity = 0.105 + meter * 0.055;
    if (visual === "interrupted") coronaOpacity = reducedMotion ? 0.035 : 0.045;
    if (reducedTransparency) coronaOpacity = Math.min(coronaOpacity, 0.07);
    const corona = context.createRadialGradient(cx, cy, radius * 0.86, cx, cy, coronaRadius);
    corona.addColorStop(0, color(limbColor, coronaOpacity * 0.22));
    corona.addColorStop(0.42, color(limbColor, coronaOpacity));
    corona.addColorStop(0.72, color(limbColor, coronaOpacity * 0.28));
    corona.addColorStop(1, color(limbColor, 0));
    context.beginPath();
    context.arc(cx, cy, coronaRadius, 0, Math.PI * 2);
    context.fillStyle = corona;
    context.fill();

    // Speaking wave sits behind the core.
    if (visual === "speaking") {
      const progress = reducedMotion ? 0.18 : (seconds * (0.18 + meter * 0.1)) % 1;
      const waveRadius = radius * (1.06 + progress * 0.34);
      const start = -2.32 + progress * 0.44;
      drawArc(context, cx, cy, waveRadius, start, start + 1.34 + meter * 0.42, color("#f4f6fa", reducedMotion ? 0.11 : (1 - progress) * (0.035 + meter * 0.15)), 0.7 + meter * 0.7);
    }

    const satelliteAngle = reducedMotion ? -0.72 : seconds * 0.24;
    const satelliteX = cx + Math.cos(satelliteAngle) * radius * 1.24;
    const satelliteY = cy + Math.sin(satelliteAngle) * radius * 0.48;
    function drawSatellite(foreground) {
      if (visual !== "thinking" || (satelliteY >= cy) !== foreground) return;
      context.beginPath();
      context.arc(satelliteX, satelliteY, foreground ? 2.1 : 1.4, 0, Math.PI * 2);
      context.fillStyle = color("#f4f6fa", foreground ? 0.88 : 0.24);
      context.fill();
    }
    drawSatellite(false);

    // Eclipse core with off-axis cold silver reflection.
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fillStyle = "#0a0d14";
    context.fill();
    const core = context.createRadialGradient(cx - radius * 0.34, cy - radius * 0.42, 0, cx, cy, radius * 1.55);
    core.addColorStop(0, "rgba(138,147,166,0.085)");
    core.addColorStop(0.44, "rgba(10,13,20,0.52)");
    core.addColorStop(1, "rgba(0,0,0,0.78)");
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fillStyle = core;
    context.fill();

    const opacities = { idle: 0.44, listening: 0.68, thinking: 0.62, speaking: 0.94, interrupted: 0.48, error: 0.72 };
    const baseOpacity = opacities[visual] ?? 0.44;
    const limbGradient = context.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    limbGradient.addColorStop(0, color(limbColor, baseOpacity * 0.1));
    limbGradient.addColorStop(0.34, color(limbColor, baseOpacity));
    limbGradient.addColorStop(0.72, color(limbColor, baseOpacity * 0.28));
    limbGradient.addColorStop(1, color(limbColor, baseOpacity * 0.06));
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.strokeStyle = limbGradient;
    context.lineWidth = 2 + ({ idle: .18, listening: .62, thinking: .5, speaking: 1, interrupted: .28, error: .12 }[visual] || .18) * .8;
    context.stroke();

    if (visual === "listening") {
      const arcGradient = context.createLinearGradient(cx + radius, cy, cx - radius, cy);
      arcGradient.addColorStop(0, color("#f4f6fa", 0));
      arcGradient.addColorStop(0.5, color("#f4f6fa", 0.45 + meter * 0.4));
      arcGradient.addColorStop(1, color("#f4f6fa", 0));
      drawArc(context, cx, cy, radius, 0.08, Math.PI - 0.08, arcGradient, 2.8 + meter * 2.1);
    }

    // Signature hot spot on the upper-right limb.
    const hotStart = -62 * Math.PI / 180;
    const hotEnd = -39 * Math.PI / 180;
    const hotGradient = context.createLinearGradient(
      cx + Math.cos(hotStart) * radius,
      cy + Math.sin(hotStart) * radius,
      cx + Math.cos(hotEnd) * radius,
      cy + Math.sin(hotEnd) * radius
    );
    hotGradient.addColorStop(0, color(limbColor, 0));
    hotGradient.addColorStop(0.5, color(limbColor, visual === "error" ? 0.72 : 0.96));
    hotGradient.addColorStop(1, color(limbColor, 0));
    drawArc(context, cx, cy, radius, hotStart, hotEnd, hotGradient, 3);

    if (visual === "error") {
      context.beginPath();
      context.moveTo(cx - radius * 0.24, cy - radius * 0.06);
      context.lineTo(cx - radius * 0.06, cy + radius * 0.08);
      context.lineTo(cx + radius * 0.13, cy - radius * 0.12);
      context.lineTo(cx + radius * 0.28, cy + radius * 0.04);
      context.strokeStyle = color("#b3543e", 0.26);
      context.lineWidth = 1;
      context.stroke();
    }

    drawSatellite(true);
    elements.orbContainer.dataset.visualState = visual;
  }

  function animateOrb(time) {
    const interruptedActive = performance.now() < state.interruptedUntil;
    if (!reduceMotionQuery.matches || orbNeedsDraw || interruptedActive) {
      drawOrb(time);
      orbNeedsDraw = false;
    }
    window.requestAnimationFrame(animateOrb);
  }

  if ("ResizeObserver" in window) new ResizeObserver(resizeOrb).observe(elements.orb);
  else window.addEventListener("resize", resizeOrb);
  reduceMotionQuery.addEventListener?.("change", requestOrbDraw);
  reduceTransparencyQuery.addEventListener?.("change", requestOrbDraw);

  setupHistorySparklines();
  bindEvents();
  renderState();
  updateRunCount(0);
  resizeOrb();
  window.requestAnimationFrame(animateOrb);
})();
