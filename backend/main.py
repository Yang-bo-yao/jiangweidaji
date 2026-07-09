"""Lily 口语陪练 Agent — FastAPI 入口

Phase 1: 基础链路 — 录音 → ASR → LLM → TTS → 播放
"""

import base64
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.config import settings
from backend.llm import asr, chat, tts
from backend.prompts import SCENARIOS, get_scenario_prompt

app = FastAPI(title="Lily 口语陪练 Agent", version="0.1.0")

# CORS — 允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── 会话状态管理 (Phase 1 用内存字典，Phase 3 换 LangGraph) ───────
# session_id → {"history": [{"role": "...", "content": "..."}]}
sessions: dict[str, dict] = {}


def get_history(session_id: str) -> list[dict]:
    """获取会话历史，不存在则初始化"""
    if session_id not in sessions:
        sessions[session_id] = {"history": []}
    return sessions[session_id]["history"]


def update_history(session_id: str, role: str, content: str):
    """追加一条对话记录"""
    history = get_history(session_id)
    history.append({"role": role, "content": content})
    # 保留最近 20 条，防止 token 溢出
    if len(history) > 20:
        sessions[session_id]["history"] = history[-20:]


# ─── 响应模型 ────────────────────────────────────────────────────
class ChatResponse(BaseModel):
    user_text: str           # ASR 转写结果
    reply_text: str          # Lily 的回复文本
    audio_base64: str        # TTS 音频 (base64 编码 MP3)
    scenario: str            # 当前场景
    session_id: str          # 会话 ID


# ─── 健康检查 ────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "Lily Agent"}


@app.get("/scenarios")
async def list_scenarios():
    """列出可用场景"""
    return {
        "scenarios": [
            {"key": k, "name": v["name"]}
            for k, v in SCENARIOS.items()
        ]
    }


# ─── 核心端点: POST /chat ────────────────────────────────────────
@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    audio: UploadFile = File(...),
    scenario: str = Form(default="restaurant"),
    session_id: str = Form(default="default"),
):
    """
    接收用户录音，返回 Lily 的语音回复。

    流程: 音频 → ASR转写 → LLM对话 → TTS合成 → 返回
    """
    # 1. 读取音频
    audio_bytes = await audio.read()

    # 2. ASR: 语音 → 文本
    user_text = await asr.transcribe(audio_bytes, filename=audio.filename or "audio.webm")

    # 3. 加载场景 Prompt
    system_prompt = get_scenario_prompt(scenario)

    # 4. 获取对话历史
    history = get_history(session_id)

    # 5. LLM: 生成 Lily 的回复
    reply_text = await chat.chat(system_prompt, history, user_text)

    # 6. 更新历史
    update_history(session_id, "user", user_text)
    update_history(session_id, "assistant", reply_text)

    # 7. TTS: 文本 → 音频
    audio_out = await tts.synthesize(reply_text)
    audio_b64 = base64.b64encode(audio_out).decode("utf-8")

    return ChatResponse(
        user_text=user_text,
        reply_text=reply_text,
        audio_base64=audio_b64,
        scenario=scenario,
        session_id=session_id,
    )


# ─── 启动入口 ────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
