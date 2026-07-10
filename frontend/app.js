/* Lily 口语陪练 — 主逻辑 (多邻国风格版)
 * 后端接口完全兼容 fork 版本，不改后端
 */

const API_BASE = window.LILY_API_BASE || "http://localhost:8020";
const WS_BASE = API_BASE.replace(/^http/, "ws");

const SCENES = {
  restaurant: { title: "餐厅点餐", className: "scene-restaurant", intro: "Good evening! Do you have a reservation, or would you like a table for tonight?" },
  travel: { title: "旅行问路", className: "scene-travel", intro: "Hi there! Where would you like to go? I can help you find the way." },
  interview: { title: "面试求职", className: "scene-interview", intro: "Welcome! Please start by telling me a little about yourself." },
};

const sessionId = `session_${Date.now()}`;
let currentAvatar = "lily";

// DOM
const sceneStage = document.getElementById("scene-stage");
const sceneTitle = document.getElementById("scene-title");
const avatarWrap = document.getElementById("avatar-wrap");
const liveCaption = document.getElementById("live-caption");
const lilyCaption = document.getElementById("lily-caption");
const connectionStatus = document.getElementById("connection-status");
const statusText = document.getElementById("status-text");
const coachState = document.getElementById("coach-state");
const coachSummary = document.getElementById("coach-summary");
const latestScore = document.getElementById("latest-score");
const scenarioSelect = document.querySelector(".scene-picker");
const resetBtn = document.getElementById("reset-btn");
const voiceBtn = document.getElementById("voice-btn");
const voiceBtnLabel = document.getElementById("voice-btn-label");
const sendBtn = document.getElementById("send-btn");
const interruptBtn = document.getElementById("interrupt-btn");
const textInput = document.getElementById("text-input");
const transcriptPreview = document.getElementById("transcript-preview");
const messagesDiv = document.getElementById("messages");
const emotionBubble = document.getElementById("emotion-bubble");

let ws = null, reconnectTimer = null, recognition = null;
let recognitionSupported = false, voiceActive = false;
let isRecognizing = false, isProcessing = false, isSpeaking = false;
let finalTranscriptBuffer = "", silenceTimer = null, currentAudio = null;

init();

function init() {
  applyScene("restaurant", { resetDialogue: false });
  setupRecognition();
  bindEvents();
  connectRealtime();
  setAvatarState("idle");
  animatePageLoad();
}

function animatePageLoad() {
  if (typeof gsap !== "undefined") {
    gsap.from(".topbar", { y: -60, opacity: 0, duration: 0.5, ease: "power2.out" });
    gsap.from(".stage-panel", { x: -30, opacity: 0, duration: 0.5, delay: 0.1, ease: "power2.out" });
    gsap.from(".dialogue-panel", { y: 30, opacity: 0, duration: 0.5, delay: 0.2, ease: "power2.out" });
    gsap.from(".feedback-panel", { x: 30, opacity: 0, duration: 0.5, delay: 0.3, ease: "power2.out" });
    gsap.from(".avatar-character", { scale: 0.5, opacity: 0, duration: 0.6, delay: 0.4, ease: "back.out(1.7)" });
    gsap.from(".metric-chip", { y: 20, opacity: 0, duration: 0.4, delay: 0.5, stagger: 0.08, ease: "power2.out" });
  }
}

function bindEvents() {
  voiceBtn.addEventListener("click", () => voiceActive ? stopListening({ manual: true }) : startListening());
  sendBtn.addEventListener("click", sendTypedMessage);
  textInput.addEventListener("keydown", e => { if (e.key === "Enter") sendTypedMessage(); });
  interruptBtn.addEventListener("click", () => interruptPlayback());

  // 场景按钮
  document.querySelectorAll(".scene-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".scene-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const scene = btn.dataset.scene;
      await resetSession();
      applyScene(scene, { resetDialogue: true });
      animateSceneTransition();
    });
  });

  // 形象切换
  document.querySelectorAll(".avatar-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".avatar-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      switchAvatar(btn.dataset.avatar);
    });
  });

  resetBtn.addEventListener("click", resetSession);
}

function switchAvatar(name) {
  currentAvatar = name;
  avatarWrap.dataset.avatar = name;

  const lilyChar = document.querySelector(".avatar-lily");
  const leoChar = document.querySelector(".avatar-leo");

  if (typeof gsap !== "undefined") {
    const showChar = name === "leo" ? leoChar : lilyChar;
    const hideChar = name === "leo" ? lilyChar : leoChar;

    gsap.to(hideChar, { opacity: 0, scale: 0.5, duration: 0.25, onComplete: () => {
      hideChar.style.display = "none";
      showChar.style.display = "";
      gsap.fromTo(showChar, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(1.7)" });
    }});
  } else {
    lilyChar.style.display = name === "lily" ? "" : "none";
    leoChar.style.display = name === "leo" ? "" : "none";
  }

  showEmotion(name === "leo" ? "👨" : "👩");
}

function animateSceneTransition() {
  if (typeof gsap !== "undefined") {
    gsap.fromTo(".scene-stage", { opacity: 0.4 }, { opacity: 1, duration: 0.5, ease: "power2.out" });
    gsap.fromTo(".bg-decor", { scale: 1.1 }, { scale: 1, duration: 0.6, ease: "power2.out" });
  }
}

function showEmotion(emoji) {
  emotionBubble.textContent = emoji;
  emotionBubble.classList.add("show");
  if (typeof gsap !== "undefined") {
    gsap.fromTo(emotionBubble, { scale: 0, rotation: -20 }, { scale: 1, rotation: 0, duration: 0.4, ease: "back.out(2)" });
  }
  setTimeout(() => emotionBubble.classList.remove("show"), 2000);
}

function connectRealtime() {
  clearTimeout(reconnectTimer);
  setConnection("connecting");
  ws = new WebSocket(`${WS_BASE}/ws/realtime/${sessionId}`);

  ws.addEventListener("open", () => setConnection("online"));
  ws.addEventListener("message", e => {
    try { handleRealtimeEvent(JSON.parse(e.data)); }
    catch { setStatus("Invalid realtime event"); }
  });
  ws.addEventListener("close", () => { setConnection("offline"); reconnectTimer = setTimeout(connectRealtime, 1800); });
  ws.addEventListener("error", () => setConnection("offline"));
}

function handleRealtimeEvent(payload) {
  switch (payload.type) {
    case "ready": setConnection("online"); break;
    case "session_reset": updateStatusBar(payload); setStatus("就绪"); break;
    case "turn_started": coachState.textContent = "reviewing"; setStatus("Lily 思考中"); break;
    case "lily_thinking": setAvatarState("thinking"); setStatus("Lily 思考中"); break;
    case "lily_response": handleLilyResponse(payload); break;
    case "evaluation": handleEvaluation(payload.evaluation, payload.emotion); break;
    case "turn_complete": handleTurnComplete(payload); break;
    case "error": handleRealtimeError(payload.message || "Error"); break;
  }
}

function setupRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognitionSupported = Boolean(SR);
  if (!recognitionSupported) { voiceBtn.disabled = true; voiceBtnLabel.textContent = "Voice off"; return; }

  recognition = new SR();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => { isRecognizing = true; setAvatarState("listening"); setStatus("Listening"); showEmotion("🎤"); };
  recognition.onresult = (e) => {
    let interim = "", finalText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript.trim();
      if (e.results[i].isFinal) finalText += ` ${t}`;
      else interim += ` ${t}`;
    }
    if (finalText.trim()) { finalTranscriptBuffer = `${finalTranscriptBuffer} ${finalText}`.trim(); scheduleTranscriptCommit(); }
    const preview = [finalTranscriptBuffer, interim.trim()].filter(Boolean).join(" ");
    transcriptPreview.textContent = preview;
    liveCaption.textContent = preview || "Listening";
  };
  recognition.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") setStatus(`语音识别错误: ${e.error}`); };
  recognition.onend = () => { isRecognizing = false; if (voiceActive && !isProcessing && !isSpeaking) setTimeout(() => startListening({ resume: true }), 260); };
}

function startListening({ resume = false } = {}) {
  if (!recognitionSupported || isRecognizing || isProcessing || isSpeaking) return;
  voiceActive = true;
  voiceBtn.classList.add("active");
  voiceBtn.setAttribute("aria-pressed", "true");
  voiceBtnLabel.textContent = "Stop";
  try { recognition.start(); if (!resume) { liveCaption.textContent = "Listening"; transcriptPreview.textContent = ""; } }
  catch { setStatus("语音识别启动失败"); }
}

function stopListening({ manual = false } = {}) {
  clearTimeout(silenceTimer);
  if (manual) {
    voiceActive = false;
    voiceBtn.classList.remove("active");
    voiceBtn.setAttribute("aria-pressed", "false");
    voiceBtnLabel.textContent = "Start";
    setAvatarState("idle");
    setStatus("就绪");
  }
  if (isRecognizing && recognition) recognition.stop();
}

function scheduleTranscriptCommit() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    const text = finalTranscriptBuffer.trim();
    finalTranscriptBuffer = "";
    transcriptPreview.textContent = "";
    if (text) sendTurn(text, "voice");
  }, 850);
}

function sendTypedMessage() {
  const text = textInput.value.trim();
  if (!text) return;
  textInput.value = "";
  sendTurn(text, "text");
}

function sendTurn(text, source) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || isProcessing) return;
  stopListening({ manual: false });
  isProcessing = true;
  coachState.textContent = "reviewing";
  setAvatarState("thinking");
  setStatus(source === "voice" ? "识别完成" : "Lily 思考中");
  liveCaption.textContent = clean;
  appendMessage("user", clean);

  const msg = { type: "user_text", text: clean, scenario: getCurrentScene(), voice: true };
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  else sendHttpTurn(clean);
}

function getCurrentScene() {
  const active = document.querySelector(".scene-btn.active");
  return active ? active.dataset.scene : "restaurant";
}

async function sendHttpTurn(text) {
  const fd = new FormData();
  fd.append("user_text", text);
  fd.append("scenario", getCurrentScene());
  fd.append("session_id", sessionId);
  fd.append("synthesize_voice", "true");
  try {
    const r = await fetch(`${API_BASE}/chat/text`, { method: "POST", body: fd });
    if (!r.ok) throw new Error(await r.text());
    const d = await r.json();
    await handleLilyResponse({ type: "lily_response", reply_text: d.reply_text, audio_base64: d.audio_base64, tool_calls: d.tool_calls });
    if (d.evaluation) handleEvaluation(d.evaluation, d.emotion);
    handleTurnComplete(d);
  } catch (e) { handleRealtimeError(e.message || "Request failed"); }
}

async function handleLilyResponse(payload) {
  const reply = payload.reply_text || "";
  appendMessage("lily", reply, payload.tool_calls || []);
  lilyCaption.textContent = reply;
  setStatus("Lily speaking");
  setAvatarState("speaking");
  await playLilyReply(reply, payload.audio_base64);
  if (isProcessing) { setAvatarState("reviewing"); setStatus("Reviewing"); }
}

function handleEvaluation(evaluation, emotion) {
  if (!evaluation) return;
  renderFeedback(evaluation);
  updateCoachSummary(evaluation);
  latestScore.textContent = evaluation.overall_score ?? "--";
  coachState.textContent = "ready";

  const score = Number(evaluation.overall_score || 0);
  if (emotion === "confident" || score >= 85) { setAvatarState("happy"); showEmotion("🌟"); }
  else if (emotion === "frustrated" || score < 70) { setAvatarState("concerned"); showEmotion("💪"); }
  else { setAvatarState("reviewing"); showEmotion("📝"); }
}

function handleTurnComplete(payload) {
  isProcessing = false;
  updateStatusBar(payload);
  setStatus("就绪");
  if (!isSpeaking && voiceActive) startListening({ resume: true });
}

function handleRealtimeError(msg) {
  isProcessing = false;
  setAvatarState(voiceActive ? "listening" : "idle");
  setStatus(`出错了: ${msg}`);
  if (voiceActive && !isSpeaking) startListening({ resume: true });
}

async function playLilyReply(text, audioBase64) {
  interruptPlayback({ keepState: true });
  isSpeaking = true;
  try {
    if (audioBase64) await playAudioBase64(audioBase64);
    else await speakWithBrowser(text);
  } finally {
    isSpeaking = false;
    if (!isProcessing && voiceActive) startListening({ resume: true });
  }
}

function playAudioBase64(b64) {
  return new Promise(resolve => {
    const bytes = atob(b64);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    const blob = new Blob([buf], { type: "audio/mp3" });
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; resolve(); };
    currentAudio.onerror = () => { URL.revokeObjectURL(url); currentAudio = null; resolve(); };
    currentAudio.play().catch(() => { URL.revokeObjectURL(url); currentAudio = null; resolve(); });
  });
}

function speakWithBrowser(text) {
  return new Promise(resolve => {
    if (!("speechSynthesis" in window) || !text) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = 0.94; u.pitch = 1.08;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => /female|samantha|jenny|aria|natural|english/i.test(v.name)) || voices.find(v => v.lang?.startsWith("en"));
    if (v) u.voice = v;
    u.onend = resolve; u.onerror = resolve;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

function interruptPlayback(options = {}) {
  const keepState = Boolean(options.keepState);
  if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; currentAudio = null; }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  isSpeaking = false;
  if (!keepState) { setAvatarState(voiceActive ? "listening" : "idle"); if (voiceActive) startListening({ resume: true }); }
}

async function resetSession() {
  interruptPlayback();
  stopListening({ manual: false });
  finalTranscriptBuffer = "";
  transcriptPreview.textContent = "";
  liveCaption.textContent = "Ready";
  lilyCaption.textContent = "Let's begin!";
  latestScore.textContent = "--";
  coachState.textContent = "waiting";
  updateStatusBar({ difficulty: "medium", streak_errors: 0, total_turns: 0 });
  resetFeedbackPanel();
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "reset" }));
  else { try { await fetch(`${API_BASE}/session/${sessionId}/reset`, { method: "POST" }); } catch { setStatus("重置失败"); } }
  isProcessing = false;
  setAvatarState("idle");
  setStatus("就绪");
}

function applyScene(scenario, { resetDialogue = true } = {}) {
  const scene = SCENES[scenario] || SCENES.restaurant;
  sceneTitle.textContent = scene.title;
  lilyCaption.textContent = scene.intro;
  sceneStage.className = `scene-stage ${scene.className}`;
  if (resetDialogue) {
    messagesDiv.innerHTML = "";
    appendMessage("lily", scene.intro);
  }
}

function appendMessage(role, text, toolCalls) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.textContent = role === "lily" ? (currentAvatar === "leo" ? "L" : "L") : "U";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  if (toolCalls && toolCalls.length > 0) {
    const toolDiv = document.createElement("div");
    toolDiv.className = "tool-calls";
    const label = document.createElement("div");
    label.className = "tool-label";
    label.textContent = `🔧 Tool calls (${toolCalls.length})`;
    toolDiv.appendChild(label);
    for (const tc of toolCalls) {
      const item = document.createElement("div");
      item.className = "tool-item";
      const name = document.createElement("span");
      name.className = "tool-name";
      name.textContent = tc.name;
      const args = document.createElement("span");
      args.className = "tool-args";
      args.textContent = JSON.stringify(tc.arguments || {});
      item.append(name, args);
      toolDiv.appendChild(item);
    }
    bubble.appendChild(toolDiv);
  }

  msgDiv.append(avatar, bubble);
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  if (typeof gsap !== "undefined") {
    gsap.from(msgDiv, { y: 15, opacity: 0, duration: 0.3, ease: "power2.out" });
  }
}

function updateStatusBar(data) {
  if (data.difficulty) {
    const dl = document.getElementById("difficulty-label");
    dl.textContent = data.difficulty;
    dl.className = `badge badge-${data.difficulty}`;
  }
  if (data.streak_errors !== undefined) document.getElementById("streak-label").textContent = data.streak_errors;
  if (data.total_turns !== undefined) document.getElementById("turns-label").textContent = data.total_turns;
}

function setConnection(state) {
  connectionStatus.className = `conn-pill ${state}`;
  connectionStatus.querySelector(".conn-text").textContent = state;
}

function setAvatarState(state) {
  avatarWrap.dataset.state = state;
}

function setStatus(text) { statusText.textContent = text; }
