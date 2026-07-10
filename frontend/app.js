/* Lily realtime voice stage */

const API_BASE = window.LILY_API_BASE || "http://localhost:8020";
const WS_BASE = API_BASE.replace(/^http/, "ws");

const SCENES = {
  restaurant: {
    title: "餐厅点餐",
    className: "scene-restaurant",
    intro: "Good evening. Do you have a reservation, or would you like a table for tonight?",
  },
  travel: {
    title: "旅行问路",
    className: "scene-travel",
    intro: "Hi there. Where would you like to go? I can help you find the way.",
  },
  interview: {
    title: "面试求职",
    className: "scene-interview",
    intro: "Welcome. Please start by telling me a little about yourself.",
  },
};

const sessionId = `session_${Date.now()}`;

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
const scenarioSelect = document.getElementById("scenario");
const resetBtn = document.getElementById("reset-btn");
const voiceBtn = document.getElementById("voice-btn");
const voiceBtnLabel = document.getElementById("voice-btn-label");
const sendBtn = document.getElementById("send-btn");
const interruptBtn = document.getElementById("interrupt-btn");
const textInput = document.getElementById("text-input");
const transcriptPreview = document.getElementById("transcript-preview");
const messagesDiv = document.getElementById("messages");

let ws = null;
let reconnectTimer = null;
let recognition = null;
let recognitionSupported = false;
let voiceActive = false;
let isRecognizing = false;
let isProcessing = false;
let isSpeaking = false;
let finalTranscriptBuffer = "";
let silenceTimer = null;
let currentAudio = null;
let lastAvatarState = "idle";

init();

function init() {
  applyScene(scenarioSelect.value, { resetDialogue: false });
  setupRecognition();
  bindEvents();
  connectRealtime();
  setAvatarState("idle");
}

function bindEvents() {
  voiceBtn.addEventListener("click", () => {
    if (voiceActive) {
      stopListening({ manual: true });
    } else {
      startListening();
    }
  });

  sendBtn.addEventListener("click", sendTypedMessage);
  textInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      sendTypedMessage();
    }
  });

  interruptBtn.addEventListener("click", interruptPlayback);

  scenarioSelect.addEventListener("change", async () => {
    await resetSession();
    applyScene(scenarioSelect.value, { resetDialogue: true });
  });

  resetBtn.addEventListener("click", resetSession);
}

function connectRealtime() {
  clearTimeout(reconnectTimer);
  setConnection("connecting");

  ws = new WebSocket(`${WS_BASE}/ws/realtime/${sessionId}`);

  ws.addEventListener("open", () => {
    setConnection("online");
  });

  ws.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch (error) {
      setStatus("Invalid realtime event");
      return;
    }
    handleRealtimeEvent(payload);
  });

  ws.addEventListener("close", () => {
    setConnection("offline");
    reconnectTimer = setTimeout(connectRealtime, 1800);
  });

  ws.addEventListener("error", () => {
    setConnection("offline");
  });
}

function handleRealtimeEvent(payload) {
  switch (payload.type) {
    case "ready":
      setConnection("online");
      break;
    case "session_reset":
      updateStatusBar(payload);
      setStatus("就绪");
      break;
    case "turn_started":
      coachState.textContent = "reviewing";
      setStatus("Lily 思考中");
      break;
    case "lily_thinking":
      setAvatarState("thinking");
      setStatus("Lily 思考中");
      break;
    case "lily_response":
      handleLilyResponse(payload);
      break;
    case "evaluation":
      handleEvaluation(payload.evaluation, payload.emotion);
      break;
    case "turn_complete":
      handleTurnComplete(payload);
      break;
    case "error":
      handleRealtimeError(payload.message || "Realtime error");
      break;
    default:
      break;
  }
}

function setupRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognitionSupported = Boolean(SpeechRecognition);

  if (!recognitionSupported) {
    voiceBtn.disabled = true;
    voiceBtnLabel.textContent = "Voice off";
    setStatus("语音识别不可用");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isRecognizing = true;
    setAvatarState("listening");
    setStatus("Listening");
  };

  recognition.onresult = (event) => {
    let interim = "";
    let finalText = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript.trim();
      if (event.results[i].isFinal) {
        finalText += ` ${transcript}`;
      } else {
        interim += ` ${transcript}`;
      }
    }

    if (finalText.trim()) {
      finalTranscriptBuffer = `${finalTranscriptBuffer} ${finalText}`.trim();
      scheduleTranscriptCommit();
    }

    const preview = [finalTranscriptBuffer, interim.trim()].filter(Boolean).join(" ");
    transcriptPreview.textContent = preview;
    liveCaption.textContent = preview || "Listening";
  };

  recognition.onerror = (event) => {
    if (event.error !== "no-speech" && event.error !== "aborted") {
      setStatus(`语音识别错误: ${event.error}`);
    }
  };

  recognition.onend = () => {
    isRecognizing = false;
    if (voiceActive && !isProcessing && !isSpeaking) {
      setTimeout(() => startListening({ resume: true }), 260);
    }
  };
}

function startListening({ resume = false } = {}) {
  if (!recognitionSupported || isRecognizing || isProcessing || isSpeaking) return;

  voiceActive = true;
  voiceBtn.classList.add("active");
  voiceBtn.setAttribute("aria-pressed", "true");
  voiceBtnLabel.textContent = "Stop";

  try {
    recognition.start();
    if (!resume) {
      liveCaption.textContent = "Listening";
      transcriptPreview.textContent = "";
    }
  } catch (error) {
    setStatus("语音识别启动失败");
  }
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

  if (isRecognizing && recognition) {
    recognition.stop();
  }
}

function scheduleTranscriptCommit() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    const text = finalTranscriptBuffer.trim();
    finalTranscriptBuffer = "";
    transcriptPreview.textContent = "";
    if (text) {
      sendTurn(text, "voice");
    }
  }, 850);
}

function sendTypedMessage() {
  const text = textInput.value.trim();
  if (!text) return;
  textInput.value = "";
  sendTurn(text, "text");
}

function sendTurn(text, source) {
  const cleanText = text.replace(/\s+/g, " ").trim();
  if (!cleanText || isProcessing) return;

  stopListening({ manual: false });
  isProcessing = true;
  coachState.textContent = "reviewing";
  setAvatarState("thinking");
  setStatus(source === "voice" ? "识别完成" : "Lily 思考中");
  liveCaption.textContent = cleanText;
  appendMessage("user", cleanText);

  const message = {
    type: "user_text",
    text: cleanText,
    scenario: scenarioSelect.value,
    voice: true,
  };

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    sendHttpTurn(cleanText);
  }
}

async function sendHttpTurn(text) {
  const formData = new FormData();
  formData.append("user_text", text);
  formData.append("scenario", scenarioSelect.value);
  formData.append("session_id", sessionId);
  formData.append("synthesize_voice", "true");

  try {
    const response = await fetch(`${API_BASE}/chat/text`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const data = await response.json();
    await handleLilyResponse({
      type: "lily_response",
      reply_text: data.reply_text,
      audio_base64: data.audio_base64,
      tool_calls: data.tool_calls,
    });
    if (data.evaluation) {
      handleEvaluation(data.evaluation, data.emotion);
    }
    handleTurnComplete(data);
  } catch (error) {
    handleRealtimeError(error.message || "Request failed");
  }
}

async function handleLilyResponse(payload) {
  const replyText = payload.reply_text || "";
  appendMessage("lily", replyText, payload.tool_calls || []);
  lilyCaption.textContent = replyText;
  setStatus("Lily speaking");
  setAvatarState("speaking");

  await playLilyReply(replyText, payload.audio_base64);

  if (isProcessing) {
    setAvatarState("reviewing");
    setStatus("Reviewing");
  }
}

function handleEvaluation(evaluation, emotion) {
  if (!evaluation) return;
  renderFeedback(evaluation);
  updateCoachSummary(evaluation);
  latestScore.textContent = evaluation.overall_score ?? "--";
  coachState.textContent = "ready";

  const score = Number(evaluation.overall_score || 0);
  if (emotion === "confident" || score >= 85) {
    setAvatarState("happy");
  } else if (emotion === "frustrated" || score < 70) {
    setAvatarState("concerned");
  } else {
    setAvatarState("reviewing");
  }
}

function handleTurnComplete(payload) {
  isProcessing = false;
  updateStatusBar(payload);
  setStatus("就绪");
  if (!isSpeaking && voiceActive) {
    startListening({ resume: true });
  }
}

function handleRealtimeError(message) {
  isProcessing = false;
  setAvatarState(voiceActive ? "listening" : "idle");
  setStatus(`出错了: ${message}`);
  if (voiceActive && !isSpeaking) {
    startListening({ resume: true });
  }
}

async function playLilyReply(text, audioBase64) {
  interruptPlayback({ keepState: true });
  isSpeaking = true;

  try {
    if (audioBase64) {
      await playAudioBase64(audioBase64);
    } else {
      await speakWithBrowser(text);
    }
  } finally {
    isSpeaking = false;
    if (!isProcessing && voiceActive) {
      startListening({ resume: true });
    }
  }
}

function playAudioBase64(base64Audio) {
  return new Promise((resolve) => {
    const audioBytes = atob(base64Audio);
    const arrayBuffer = new Uint8Array(audioBytes.length);
    for (let i = 0; i < audioBytes.length; i += 1) {
      arrayBuffer[i] = audioBytes.charCodeAt(i);
    }

    const blob = new Blob([arrayBuffer], { type: "audio/mp3" });
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      resolve();
    };
    currentAudio.onerror = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      resolve();
    };
    currentAudio.play().catch(() => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      resolve();
    });
  });
}

function speakWithBrowser(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || !text) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.94;
    utterance.pitch = 1.08;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find((voice) =>
      /female|samantha|jenny|aria|natural|english/i.test(voice.name)
    ) || voices.find((voice) => voice.lang && voice.lang.startsWith("en"));
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

function interruptPlayback(options = {}) {
  const keepState = Boolean(options.keepState);
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
  if (!keepState) {
    setAvatarState(voiceActive ? "listening" : "idle");
    if (voiceActive) startListening({ resume: true });
  }
}

async function resetSession() {
  interruptPlayback();
  stopListening({ manual: false });
  finalTranscriptBuffer = "";
  transcriptPreview.textContent = "";
  liveCaption.textContent = "Ready";
  latestScore.textContent = "--";
  coachState.textContent = "waiting";
  updateStatusBar({ difficulty: "medium", streak_errors: 0, total_turns: 0 });
  resetFeedbackPanel();

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "reset" }));
  } else {
    try {
      await fetch(`${API_BASE}/session/${sessionId}/reset`, { method: "POST" });
    } catch (error) {
      setStatus("重置失败");
    }
  }

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
  avatar.className = "avatar-mini";
  avatar.textContent = role === "lily" ? "L" : "U";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  if (toolCalls && toolCalls.length > 0) {
    const toolDiv = document.createElement("div");
    toolDiv.className = "tool-calls";

    const toolLabel = document.createElement("div");
    toolLabel.className = "tool-label";
    toolLabel.textContent = `Tool calls (${toolCalls.length})`;
    toolDiv.appendChild(toolLabel);

    for (const toolCall of toolCalls) {
      const item = document.createElement("div");
      item.className = "tool-item";

      const name = document.createElement("span");
      name.className = "tool-name";
      name.textContent = toolCall.name;

      const args = document.createElement("span");
      args.className = "tool-args";
      args.textContent = JSON.stringify(toolCall.arguments || {});

      item.appendChild(name);
      item.appendChild(args);
      toolDiv.appendChild(item);
    }
    bubble.appendChild(toolDiv);
  }

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateStatusBar(data) {
  if (data.difficulty) {
    const label = document.getElementById("difficulty-label");
    label.textContent = data.difficulty;
    label.className = `badge badge-${data.difficulty}`;
  }
  if (data.streak_errors !== undefined) {
    document.getElementById("streak-label").textContent = data.streak_errors;
  }
  if (data.total_turns !== undefined) {
    document.getElementById("turns-label").textContent = data.total_turns;
  }
}

function updateCoachSummary(evaluation) {
  const score = evaluation.overall_score ?? "--";
  const corrected = evaluation.corrected_sentence || "Keep the conversation going.";
  const encouragement = evaluation.encouragement || "Nice effort.";
  coachSummary.innerHTML = `
    <div class="summary-score ${getScoreClass(Number(score) || 0)}">${score}</div>
    <div>
      <strong>${escapeHtml(encouragement)}</strong>
      <p>${escapeHtml(corrected)}</p>
    </div>
  `;
}

function resetFeedbackPanel() {
  coachSummary.innerHTML = `
    <div class="summary-score">--</div>
    <div>
      <strong>No review yet</strong>
      <p>Your next evaluated turn will appear here.</p>
    </div>
  `;
  document.getElementById("feedback-content").innerHTML =
    '<div class="feedback-placeholder">Awaiting first turn</div>';
}

function setConnection(state) {
  connectionStatus.className = `connection-pill ${state}`;
  connectionStatus.textContent = state;
}

function setAvatarState(state) {
  lastAvatarState = state;
  avatarWrap.dataset.state = state;
}

function setStatus(text) {
  statusText.textContent = text;
}

/* ═══ 对话历史功能 ═══ */

const historyBtn = document.getElementById("history-btn");
const historyModal = document.getElementById("history-modal");
const historyClose = document.getElementById("history-close");
const historyRefresh = document.getElementById("history-refresh");
const historyBack = document.getElementById("history-back");
const historySessions = document.getElementById("history-sessions");
const historyDetail = document.getElementById("history-detail");
const historyMessages = document.getElementById("history-messages");

const SCENE_ICONS = { restaurant: "🍽️", travel: "✈️", interview: "💼" };
const SCENE_LABELS = { restaurant: "餐厅点餐", travel: "旅行问路", interview: "面试求职" };

historyBtn.addEventListener("click", () => {
  historyModal.style.display = "grid";
  loadSessionList();
});

historyClose.addEventListener("click", () => {
  historyModal.style.display = "none";
});

historyModal.addEventListener("click", (e) => {
  if (e.target === historyModal) historyModal.style.display = "none";
});

historyRefresh.addEventListener("click", loadSessionList);

historyBack.addEventListener("click", () => {
  historyDetail.style.display = "none";
  historySessions.style.display = "";
  loadSessionList();
});

async function loadSessionList() {
  historySessions.style.display = "";
  historyDetail.style.display = "none";
  historySessions.innerHTML = '<p class="history-loading">加载中...</p>';

  try {
    const res = await fetch(`${API_BASE}/history`);
    const data = await res.json();
    const sessions = data.sessions || [];

    if (sessions.length === 0) {
      historySessions.innerHTML = '<p class="history-loading">暂无对话历史<br>开始对话后这里会自动保存 📝</p>';
      return;
    }

    historySessions.innerHTML = sessions.map(s => {
      const icon = SCENE_ICONS[s.scenario] || "💬";
      const label = SCENE_LABELS[s.scenario] || s.scenario || "未知场景";
      const time = s.updated_at ? new Date(s.updated_at).toLocaleString("zh-CN") : "";
      return `
        <div class="session-card" data-sid="${s.session_id}">
          <span class="session-icon">${icon}</span>
          <div class="session-info">
            <strong>${label}</strong>
            <p>${time}</p>
          </div>
          <span class="session-turns">${s.turn_count} 轮</span>
        </div>`;
    }).join("");

    // 绑定点击
    historySessions.querySelectorAll(".session-card").forEach(card => {
      card.addEventListener("click", () => loadSessionDetail(card.dataset.sid));
    });
  } catch (e) {
    historySessions.innerHTML = '<p class="history-loading">加载失败: ' + e.message + "</p>";
  }
}

async function loadSessionDetail(sid) {
  historySessions.style.display = "none";
  historyDetail.style.display = "";
  historyMessages.innerHTML = '<p class="history-loading">加载中...</p>';

  try {
    const res = await fetch(`${API_BASE}/history/${sid}`);
    const data = await res.json();
    const turns = data.turns || [];

    if (turns.length === 0) {
      historyMessages.innerHTML = '<p class="history-loading">该会话暂无记录</p>';
      return;
    }

    historyMessages.innerHTML = turns.map(t => {
      const time = new Date(t.timestamp).toLocaleString("zh-CN");
      const score = t.evaluation?.overall_score;
      const scoreTag = score !== undefined
        ? `<span class="history-score-tag ${getScoreClass(score)}">${score}分</span>` : "";
      return `
        <div class="history-msg user">
          <div class="history-msg-avatar">U</div>
          <div>
            <div class="history-msg-bubble">${escapeHtml(t.user_text)}</div>
          </div>
        </div>
        <div class="history-msg lily">
          <div class="history-msg-avatar">L</div>
          <div>
            <div class="history-msg-bubble">${escapeHtml(t.reply_text)}</div>
            <div class="history-turn-meta">🕐 ${time} · 难度: ${t.difficulty} · 情绪: ${t.emotion} ${scoreTag}</div>
          </div>
        </div>`;
    }).join("");

    // 滚动到底部
    historyDetail.scrollTop = historyDetail.scrollHeight;
  } catch (e) {
    historyMessages.innerHTML = '<p class="history-loading">加载失败: ' + e.message + "</p>";
  }
}
