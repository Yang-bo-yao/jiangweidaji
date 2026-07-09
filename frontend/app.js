/* Lily 口语陪练 Agent — 前端主逻辑
 * Phase 2: 双通道接收
 *   通道1: HTTP POST /chat → 对话流 (字幕+音频)
 *   通道2: SSE /api/feedback/{session_id} → 评估反馈 (JSON)
 */

const API_BASE = "http://localhost:8000";

// ─── DOM 元素 ───────────────────────────────────────────────────
const recordBtn = document.getElementById("record-btn");
const messagesDiv = document.getElementById("messages");
const statusText = document.getElementById("status-text");
const scenarioSelect = document.getElementById("scenario");

// ─── 会话状态 ───────────────────────────────────────────────────
const sessionId = "session_" + Date.now();
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// ─── SSE: 评估反馈通道 ──────────────────────────────────────────
let feedbackEventSource = null;

function connectFeedbackSSE() {
  if (feedbackEventSource) {
    feedbackEventSource.close();
  }

  feedbackEventSource = new EventSource(`${API_BASE}/api/feedback/${sessionId}`);

  feedbackEventSource.addEventListener("evaluation", (event) => {
    const evaluation = JSON.parse(event.data);
    renderFeedback(evaluation);
    statusText.textContent = "评估完成 ✓";
  });

  feedbackEventSource.addEventListener("timeout", () => {
    // 超时静默处理，等待下一次
  });

  feedbackEventSource.onerror = () => {
    // SSE 断开后自动重连，不提示
  };
}

// 连接 SSE
connectFeedbackSSE();

// ─── 录音逻辑 ───────────────────────────────────────────────────

async function initRecorder() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MediaRecorder.isTypeSupported("audio/webm")
    ? "audio/webm"
    : "audio/mp4";

  mediaRecorder = new MediaRecorder(stream, { mimeType });
  audioChunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(audioChunks, { type: mimeType });
    await sendAudio(audioBlob);
    audioChunks = [];
  };
}

function startRecording() {
  if (!mediaRecorder || isRecording) return;
  mediaRecorder.start();
  isRecording = true;
  recordBtn.classList.add("recording");
  recordBtn.querySelector(".btn-text").textContent = "松开发送";
  statusText.textContent = "录音中...";
  statusText.parentElement.classList.add("recording");
}

function stopRecording() {
  if (!mediaRecorder || !isRecording) return;
  mediaRecorder.stop();
  isRecording = false;
  recordBtn.classList.remove("recording");
  recordBtn.querySelector(".btn-text").textContent = "按住说话";
  statusText.textContent = "Lily 思考中...";
  statusText.parentElement.classList.remove("recording");
  statusText.parentElement.classList.add("loading");
}

// 鼠标事件
recordBtn.addEventListener("mousedown", startRecording);
recordBtn.addEventListener("mouseup", stopRecording);
recordBtn.addEventListener("mouseleave", () => {
  if (isRecording) stopRecording();
});

// 触摸事件
recordBtn.addEventListener("touchstart", (e) => {
  e.preventDefault();
  startRecording();
});
recordBtn.addEventListener("touchend", (e) => {
  e.preventDefault();
  stopRecording();
});

// ─── 发送音频 (通道1: HTTP POST) ────────────────────────────────

async function sendAudio(audioBlob) {
  const formData = new FormData();
  const ext = audioBlob.type.includes("webm") ? "webm" : "mp4";
  formData.append("audio", audioBlob, `audio.${ext}`);
  formData.append("scenario", scenarioSelect.value);
  formData.append("session_id", sessionId);

  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API ${response.status}: ${err}`);
    }

    const data = await response.json();

    // 显示用户说的内容
    appendMessage("user", data.user_text);

    // 显示 Lily 的回复（含工具调用信息）
    appendMessage("lily", data.reply_text, data.tool_calls);

    // 播放 TTS 音频
    playAudio(data.audio_base64);

    // 更新状态栏
    if (data.difficulty) {
      document.getElementById("difficulty-label").textContent = data.difficulty;
    }
    if (data.streak_errors !== undefined) {
      document.getElementById("streak-label").textContent = data.streak_errors;
    }
    if (data.total_turns !== undefined) {
      document.getElementById("turns-label").textContent = data.total_turns;
    }

    // 对话已返回，等待 SSE 推送评估反馈
    statusText.textContent = "等待评估反馈...";

    // 重新连接 SSE（每次对话后需要重新订阅）
    setTimeout(() => connectFeedbackSSE(), 500);

  } catch (err) {
    console.error("请求失败:", err);
    statusText.textContent = "出错了: " + err.message;
    statusText.parentElement.classList.remove("loading");
    statusText.parentElement.classList.add("recording");
  }
}

// ─── UI 辅助 ────────────────────────────────────────────────────

function appendMessage(role, text, toolCalls) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "lily" ? "🌸" : "🧑";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  // 如果有工具调用，在气泡下方展示工具信息
  if (toolCalls && toolCalls.length > 0) {
    const toolDiv = document.createElement("div");
    toolDiv.className = "tool-calls";

    const toolLabel = document.createElement("div");
    toolLabel.className = "tool-label";
    toolLabel.textContent = `🔧 工具调用 (${toolCalls.length})`;
    toolDiv.appendChild(toolLabel);

    for (const tc of toolCalls) {
      const item = document.createElement("div");
      item.className = "tool-item";

      const name = document.createElement("span");
      name.className = "tool-name";
      name.textContent = tc.name;

      const args = document.createElement("span");
      args.className = "tool-args";
      args.textContent = JSON.stringify(tc.arguments);

      item.appendChild(name);
      item.appendChild(args);
      toolDiv.appendChild(item);
    }

    bubble.appendChild(toolDiv);
  }

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);
  messagesDiv.appendChild(msgDiv);

  messagesDiv.parentElement.scrollTop = messagesDiv.parentElement.scrollHeight;
}

function playAudio(base64Audio) {
  const audioBytes = atob(base64Audio);
  const arrayBuffer = new Uint8Array(audioBytes.length);
  for (let i = 0; i < audioBytes.length; i++) {
    arrayBuffer[i] = audioBytes.charCodeAt(i);
  }

  const blob = new Blob([arrayBuffer], { type: "audio/mp3" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play();
  audio.onended = () => URL.revokeObjectURL(url);
}

// ─── 初始化 ─────────────────────────────────────────────────────
initRecorder().catch((err) => {
  console.error("麦克风初始化失败:", err);
  statusText.textContent = "麦克风访问失败，请检查权限";
  recordBtn.disabled = true;
});
