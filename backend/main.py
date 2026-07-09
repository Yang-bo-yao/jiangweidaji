"""Lily 口语陪练 Agent — FastAPI 入口

Phase 3: LangGraph 状态机编排 — 图结构管理全局状态，自适应难度路由
"""

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.config import settings
from backend.graph.builder import compiled_graph
from backend.graph.nodes import _get_session_state
from backend.api.feedback import router as feedback_router
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
    if session_id in _get_session_state.__wrapped__.__globals__["_session_store"]:
        del _get_session_state.__wrapped__.__globals__["_session_store"][session_id]
    from backend.graph.nodes import _session_store
    if session_id in _session_store:
        del _session_store[session_id]
    return {"status": "ok", "message": "session reset"}


# ─── 启动入口 ────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
