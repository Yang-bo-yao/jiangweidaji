"""Lily 口语陪练 Agent — FastAPI 入口

Phase 3: LangGraph 状态机编排 — 图结构管理全局状态，自适应难度路由
"""

from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.config import settings
from backend.conversation import run_text_turn
from backend.graph.builder import compiled_graph
from backend.graph.nodes import _get_session_state, _session_store
from backend.api.feedback import router as feedback_router
from backend.memory import load_history, list_all_sessions, delete_history
from backend.prompts.difficulty import SCENARIO_NAMES

app = FastAPI(title="Lily 口语陪练 Agent", version="0.3.0")

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


# ─── 响应模型 ────────────────────────────────────────────────────
class ChatResponse(BaseModel):
    user_text: str           # ASR 转写结果
    reply_text: str          # Lily 的回复文本
    audio_base64: str        # TTS 音频 (base64 MP3)
    scenario: str            # 当前场景
    session_id: str          # 会话 ID
    difficulty: str          # 当前难度级别
    streak_errors: int       # 连续出错次数
    total_turns: int         # 总对话轮次
    tool_calls: list         # 本轮工具调用记录
    evaluation: Optional[dict] = None
    emotion: str = "neutral"
    tts_error: str = ""


class SessionStatus(BaseModel):
    session_id: str
    difficulty: str
    streak_errors: int
    total_turns: int
    emotion: str


# ─── 健康检查 ────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "Lily Agent", "version": "0.3.0"}


@app.get("/scenarios")
async def list_scenarios():
    return {
        "scenarios": [
            {"key": k, "name": v}
            for k, v in SCENARIO_NAMES.items()
        ]
    }


@app.get("/tools")
async def list_tools():
    """列出所有已注册的 MCP 工具"""
    from backend.mcp.server import list_tools
    return {"tools": list_tools()}


# ─── 核心端点: POST /chat/text (文本模式，绕过 ASR/TTS) ───────────
@app.post("/chat/text", response_model=ChatResponse)
async def chat_text_endpoint(
    user_text: str = Form(...),
    scenario: str = Form(default="restaurant"),
    session_id: str = Form(default="default"),
    synthesize_voice: bool = Form(default=True),
):
    """
    文本模式：直接接收用户输入文本，适合浏览器实时语音识别后的对话。
    """
    result = await run_text_turn(
        user_text=user_text,
        scenario=scenario,
        session_id=session_id,
        synthesize_voice=synthesize_voice,
        push_sse=True,
    )
    return ChatResponse(
        user_text=result["user_text"],
        reply_text=result["reply_text"],
        audio_base64=result["audio_base64"],
        scenario=scenario,
        session_id=session_id,
        difficulty=result["difficulty"],
        streak_errors=result["streak_errors"],
        total_turns=result["total_turns"],
        tool_calls=result["tool_calls"],
        evaluation=result["evaluation"],
        emotion=result["emotion"],
        tts_error=result["tts_error"],
    )


@app.websocket("/ws/realtime/{session_id}")
async def realtime_session(websocket: WebSocket, session_id: str):
    """Realtime conversation channel for the browser voice stage."""
    await websocket.accept()
    await websocket.send_json({
        "type": "ready",
        "session_id": session_id,
        "message": "Realtime session connected",
    })

    try:
        while True:
            payload = await websocket.receive_json()
            event_type = payload.get("type")

            if event_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if event_type == "reset":
                _session_store.pop(session_id, None)
                await websocket.send_json({
                    "type": "session_reset",
                    "difficulty": "medium",
                    "streak_errors": 0,
                    "total_turns": 0,
                })
                continue

            if event_type != "user_text":
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unsupported event type: {event_type}",
                })
                continue

            user_text = str(payload.get("text", "")).strip()
            if not user_text:
                await websocket.send_json({
                    "type": "error",
                    "message": "Empty user text",
                })
                continue

            scenario = payload.get("scenario", "restaurant")
            synthesize_voice = bool(payload.get("voice", True))

            await websocket.send_json({
                "type": "turn_started",
                "user_text": user_text,
                "scenario": scenario,
            })
            await websocket.send_json({"type": "lily_thinking"})

            try:
                result = await run_text_turn(
                    user_text=user_text,
                    scenario=scenario,
                    session_id=session_id,
                    synthesize_voice=synthesize_voice,
                    push_sse=False,
                )
            except Exception as exc:
                await websocket.send_json({
                    "type": "error",
                    "message": str(exc),
                })
                continue

            await websocket.send_json({
                "type": "lily_response",
                "reply_text": result["reply_text"],
                "audio_base64": result["audio_base64"],
                "tool_calls": result["tool_calls"],
                "tts_error": result["tts_error"],
            })
            await websocket.send_json({
                "type": "evaluation",
                "evaluation": result["evaluation"],
                "emotion": result["emotion"],
            })
            await websocket.send_json({
                "type": "turn_complete",
                "difficulty": result["difficulty"],
                "streak_errors": result["streak_errors"],
                "total_turns": result["total_turns"],
                "emotion": result["emotion"],
            })
    except WebSocketDisconnect:
        return


# ─── 核心端点: POST /chat (LangGraph 状态机) ─────────────────────
@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    audio: UploadFile = File(...),
    scenario: str = Form(default="restaurant"),
    session_id: str = Form(default="default"),
):
    """
    接收用户录音，通过 LangGraph 状态机处理：

    图流程: asr → state_update → [main_track ‖ eval_track] → merge → router → END

    - 主干对话轨：Lily 对话 + TTS → HTTP 响应返回
    - 评估纠错轨：考官评估 → JSON → SSE 推送
    - 路由器：自适应难度决策（连错降级 / 连对升级）
    """
    # 1. 读取音频
    audio_bytes = await audio.read()
    audio_filename = audio.filename or "audio.webm"

    # 2. 构建初始状态
    initial_state = {
        "session_id": session_id,
        "audio_bytes": audio_bytes,
        "audio_filename": audio_filename,
        "scenario": scenario,
    }

    # 3. 执行 LangGraph 图
    final_state = await compiled_graph.ainvoke(initial_state)

    # 4. 获取会话状态（用于返回给前端）
    ss = _get_session_state(session_id)

    return ChatResponse(
        user_text=final_state.get("user_text", ""),
        reply_text=final_state.get("reply_text", ""),
        audio_base64=final_state.get("audio_out_base64", ""),
        scenario=scenario,
        session_id=session_id,
        difficulty=ss["difficulty_level"],
        streak_errors=ss["streak_errors"],
        total_turns=ss["total_turns"],
        tool_calls=final_state.get("tool_calls", []),
    )


# ─── 会话状态查询 ────────────────────────────────────────────────
@app.get("/session/{session_id}", response_model=SessionStatus)
async def get_session_status(session_id: str):
    """查询会话当前状态（难度、连错、轮次、情绪）"""
    ss = _get_session_state(session_id)
    return SessionStatus(
        session_id=session_id,
        difficulty=ss["difficulty_level"],
        streak_errors=ss["streak_errors"],
        total_turns=ss["total_turns"],
        emotion=ss.get("emotion", "neutral"),
    )


# ─── 重置会话 ────────────────────────────────────────────────────
@app.post("/session/{session_id}/reset")
async def reset_session(session_id: str):
    """重置会话状态"""
    _session_store.pop(session_id, None)
    return {"status": "ok", "message": "session reset"}


# ─── 对话历史 (记忆) ─────────────────────────────────────────────

@app.get("/history/{session_id}")
async def get_history(session_id: str):
    """获取指定会话的完整对话历史"""
    return load_history(session_id)


@app.get("/history")
async def list_history():
    """列出所有历史会话"""
    return {"sessions": list_all_sessions()}


@app.delete("/history/{session_id}")
async def remove_history(session_id: str):
    """删除指定会话的历史记录"""
    deleted = delete_history(session_id)
    return {"status": "deleted" if deleted else "not_found", "session_id": session_id}


# ─── 启动入口 ────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
