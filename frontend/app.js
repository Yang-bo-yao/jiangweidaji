/* Lily 口语陪练 Agent — 前端主逻辑
 * Phase 1: 录音 → 上传 → 接收回复 → 播放音频 + 显示字幕
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

// ─── 录音逻辑 ───────────────────────────────────────────────────

/**
 * 初始化录音
 */
async function initRecorder() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // 优先使用 webm，兼容性最好
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

/**
 * 开始录音
 */
function startRecording() {
  if (!mediaRecorder || isRecording) return;
  mediaRecorder.start();
  isRecording = true;
  recordBtn.classList.add("recording");
  recordBtn.querySelector(".btn-text").textContent = "松开发送";
  statusText.textContent = "录音中...";
  statusText.parentElement.classList.add("recording");
}

/**
 * 停止录音
 */
function stopRecording() {
  if (!mediaRecorder || !isRecording) return;
  mediaRecorder.stop();
  isRecording = false;
  recordBtn.classList.remove("recording");
  recordBtn.querySelector(".btn-text").textContent = "按住说话";
  statusText.textContent = "处理中...";
  statusText.parentElement.classList.remove("recording");
  statusText.parentElement.classList.add("loading");
}

// 按住说话 — 鼠标事件
recordBtn.addEventListener("mousedown", startRecording);
recordBtn.addEventListener("mouseup", stopRecording);
recordBtn.addEventListener("mouseleave", () => {
  if (isRecording) stopRecording();
});

// 按住说话 — 触摸事件 (移动端)
recordBtn.addEventListener("touchstart", (e) => {
  e.preventDefault();
  startRecording();
});
recordBtn.addEventListener("touchend", (e) => {
  e.preventDefault();
  stopRecording();
});

// ─── 发送音频到后端 ─────────────────────────────────────────────

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

    // 显示 Lily 的回复
    appendMessage("lily", data.reply_text);

    // 播放 TTS 音频
    playAudio(data.audio_base64);

    statusText.textContent = "就绪";
    statusText.parentElement.classList.remove("loading");
  } catch (err) {
    console.error("请求失败:", err);
    statusText.textContent = "出错了: " + err.message;
    statusText.parentElement.classList.remove("loading");
    statusText.parentElement.classList.add("recording");
  }
}

// ─── UI 辅助 ────────────────────────────────────────────────────

/**
 * 添加一条消息到对话区
 */
function appendMessage(role, text) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "lily" ? "🌸" : "🧑";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);
  messagesDiv.appendChild(msgDiv);

  // 自动滚动到底部
  messagesDiv.parentElement.scrollTop = messagesDiv.parentElement.scrollHeight;
}

/**
 * 播放 base64 音频
 */
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
