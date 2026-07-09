"""LangGraph 图节点实现

每个节点是一个 async 函数，接收 AgentState，返回更新的字段。
节点间通过状态传递数据。
"""

import asyncio
import base64

from backend.graph.state import AgentState, EmotionState
from backend.llm import asr as asr_module, chat as chat_module, tts as tts_module, evaluate
from backend.prompts.difficulty import get_lily_prompt
from backend.api.feedback import push_feedback


# ─── 会话状态存储（跨轮次）──────────────────────────────────────
# session_id → 持久状态 (history, streak_errors, difficulty_level, total_turns)
_session_store: dict[str, dict] = {}


def _get_session_state(session_id: str) -> dict:
    """获取会话持久状态"""
    if session_id not in _session_store:
        _session_store[session_id] = {
            "history": [],
            "streak_errors": 0,
            "difficulty_level": "medium",
            "total_turns": 0,
        }
    return _session_store[session_id]


# ─── 节点 1: ASR 节点 ───────────────────────────────────────────
async def asr_node(state: AgentState) -> dict:
    """语音识别：音频 → 文本"""
    audio_bytes = state.get("audio_bytes", b"")
    filename = state.get("audio_filename", "audio.webm")

    user_text = await asr_module.transcribe(audio_bytes, filename=filename)

    return {"user_text": user_text}


# ─── 节点 2: 状态更新节点 ──────────────────────────────────────
async def state_update_node(state: AgentState) -> dict:
    """加载会话持久状态到当前 State"""
    session_id = state.get("session_id", "default")
    ss = _get_session_state(session_id)

    return {
        "history": ss["history"],
        "streak_errors": ss["streak_errors"],
        "difficulty_level": ss["difficulty_level"],
        "total_turns": ss["total_turns"],
    }


# ─── 节点 3: 主干对话轨 ────────────────────────────────────────
async def main_track_node(state: AgentState) -> dict:
    """Lily 角色扮演对话 + TTS"""
    user_text = state.get("user_text", "")
    scenario = state.get("scenario", "restaurant")
    difficulty = state.get("difficulty_level", "medium")
    history = state.get("history", [])

    # 按当前难度加载 Prompt
    system_prompt = get_lily_prompt(scenario, difficulty)

    # LLM 对话
    reply_text = await chat_module.chat(system_prompt, history, user_text)

    # TTS 合成
    audio_bytes = await tts_module.synthesize(reply_text)
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

    return {
        "reply_text": reply_text,
        "audio_out_base64": audio_b64,
    }


# ─── 节点 4: 评估纠错轨 ────────────────────────────────────────
async def eval_track_node(state: AgentState) -> dict:
    """严厉考官评估 + SSE 推送"""
    user_text = state.get("user_text", "")
    scenario = state.get("scenario", "restaurant")
    session_id = state.get("session_id", "default")

    # LLM 考官评估
    evaluation = await evaluate.evaluate(user_text, scenario)

    # 判断是否有错误 (overall_score < 80)
    has_errors = evaluation.get("overall_score", 100) < 80

    # SSE 推送评估结果到前端
    push_feedback(session_id, evaluation)

    return {
        "evaluation": evaluation,
        "has_errors": has_errors,
    }


# ─── 节点 5: 合并节点 ──────────────────────────────────────────
async def merge_node(state: AgentState) -> dict:
    """合并双轨结果，更新对话历史和状态"""
    session_id = state.get("session_id", "default")
    ss = _get_session_state(session_id)

    user_text = state.get("user_text", "")
    reply_text = state.get("reply_text", "")
    has_errors = state.get("has_errors", False)

    # 更新对话历史
    ss["history"].append({"role": "user", "content": user_text})
    ss["history"].append({"role": "assistant", "content": reply_text})
    # 保留最近 20 条
    if len(ss["history"]) > 20:
        ss["history"] = ss["history"][-20:]

    # 更新连错计数
    if has_errors:
        ss["streak_errors"] = ss["streak_errors"] + 1 if ss["streak_errors"] >= 0 else 1
    else:
        ss["streak_errors"] = ss["streak_errors"] - 1 if ss["streak_errors"] <= 0 else -1

    # 更新轮次
    ss["total_turns"] += 1

    # 更新情绪 (简单规则：连错多 → frustrated)
    if ss["streak_errors"] >= 3:
        emotion = EmotionState.FRUSTRATED.value
    elif ss["streak_errors"] <= -3:
        emotion = EmotionState.CONFIDENT.value
    else:
        emotion = EmotionState.NEUTRAL.value

    ss["emotion"] = emotion

    return {
        "history": ss["history"],
        "streak_errors": ss["streak_errors"],
        "total_turns": ss["total_turns"],
        "emotion": emotion,
    }


# ─── 节点 6: 路由节点 (只做决策，不执行) ────────────────────────
async def router_node(state: AgentState) -> dict:
    """自适应难度决策节点 — 只标记路由决策，实际难度切换在 edges.py"""
    streak = state.get("streak_errors", 0)
    emotion = state.get("emotion", EmotionState.NEUTRAL.value)

    # 决策逻辑
    if streak >= 3 or emotion == EmotionState.FRUSTRATED.value:
        decision = "degrade"
    elif streak <= -3:
        decision = "upgrade"
    else:
        decision = "normal"

    return {"route_decision": decision}
