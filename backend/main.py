"""Lily 口语陪练 Agent — FastAPI 入口

Phase 2: 双流并发 — 主干对话轨 + 评估纠错轨 asyncio.gather 并发执行
"""

import asyncio
import base64

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.config import settings
from backend.agents import main_track, eval_track
from backend.api.feedback import router as feedback_router, push_feedback
from backend.prompts import SCENARIOS

app = FastAPI(title="Lily 口语陪练 Agent", version="0.2.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册 SSE 路由
app.include_router(feedback_router, prefix="/api")


# ─── 会话状态管理 (Phase 3 会换 LangGraph) ──────────────────────
sessions: dict[str, dict] = {}


def get_history(session_id: str) -> list[dict]:
    if session_id not in sessions:
        sessions[session_id] = {"history": []}
    return sessions[session_id]["history"]


def update_history(session_id: str, role: str, content: str):
    history = get_history(session_id)
    history.append({"role": role, "content": content})
    if len(history) > 20:
        sessions[session_id]["history"] = history[-20:]


# ─── 响应模型 ────────────────────────────────────────────────────
class ChatResponse(BaseModel):
    user_text: str           # ASR 转写结果
    reply_text: str          # Lily 的回复文本
    audio_base64: str        # TTS 音频 (base64 MP3)
    scenario: str            # 当前场景
    session_id: str          # 会话 ID


# ─── 健康检查 ────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "Lily Agent", "version": "0.2.0"}


@app.get("/scenarios")
async def list_scenarios():
    return {
        "scenarios": [
            {"key": k, "name": v["name"]}
            for k, v in SCENARIOS.items()
        ]
    }


# ─── 核心端点: POST /chat (双流并发) ─────────────────────────────
@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    audio: UploadFile = File(...),
    scenario: str = Form(default="restaurant"),
    session_id: str = Form(default="default"),
):
    """
    接收用户录音，双流并发处理：
    - 主干对话轨：ASR → LLM(Lily对话) → TTS → 返回
    - 评估纠错轨：ASR结果 → LLM(考官) → JSON → SSE推送

    对话轨结果通过 HTTP 响应返回，评估轨结果通过 SSE 异步推送。
    """
    # 1. 读取音频
    audio_bytes = await audio.read()
    audio_filename = audio.filename or "audio.webm"

    # 2. 获取对话历史
    history = get_history(session_id)

    # 3. 先单独跑 ASR（两条轨共享转写结果，避免调用两次 ASR）
    from backend.llm import asr as asr_module
    user_text = await asr_module.transcribe(audio_bytes, filename=audio_filename)

    # 4. 双流并发执行
    #    主干轨：LLM对话 + TTS
    #    评估轨：LLM考官评估
    main_task = _run_main_track(user_text, scenario, history)
    eval_task = _run_eval_track(user_text, scenario, session_id)

    main_result, _ = await asyncio.gather(main_task, eval_task)

    # 5. 更新对话历史
    update_history(session_id, "user", user_text)
    update_history(session_id, "assistant", main_result.reply_text)

    # 6. 编码音频
    audio_b64 = base64.b64encode(main_result.audio_bytes).decode("utf-8")

    return ChatResponse(
        user_text=user_text,
        reply_text=main_result.reply_text,
        audio_base64=audio_b64,
        scenario=scenario,
        session_id=session_id,
    )


async def _run_main_track(user_text: str, scenario: str, history: list[dict]):
    """主干对话轨：LLM对话 + TTS（ASR已完成，直接用文本）"""
    from backend.llm import chat as chat_module, tts as tts_module
    from backend.prompts import get_scenario_prompt
    from backend.agents.main_track import MainTrackResult

    system_prompt = get_scenario_prompt(scenario)
    reply_text = await chat_module.chat(system_prompt, history, user_text)
    audio_bytes = await tts_module.synthesize(reply_text)

    return MainTrackResult(
        user_text=user_text,
        reply_text=reply_text,
        audio_bytes=audio_bytes,
    )


async def _run_eval_track(user_text: str, scenario: str, session_id: str):
    """评估纠错轨：LLM考官评估 → JSON → SSE推送"""
    result = await eval_track.run(user_text, scenario)

    # 推送评估结果到 SSE 队列，前端通过 /api/feedback/{session_id} 接收
    push_feedback(session_id, result.evaluation)

    return result


# ─── 启动入口 ────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
