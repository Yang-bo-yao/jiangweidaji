"""Conversation orchestration shared by HTTP and realtime endpoints."""

from __future__ import annotations

import asyncio
import base64
from typing import Any

from backend.api.feedback import push_feedback
from backend.graph.nodes import _get_session_state
from backend.graph.state import EmotionState
from backend.llm import chat as chat_module, evaluate, tts as tts_module
from backend.mcp.server import get_tool_schemas
from backend.memory import get_memory_context, save_turn
from backend.prompts.difficulty import get_lily_prompt


def _update_session_state(
    session_id: str,
    user_text: str,
    reply_text: str,
    has_errors: bool,
) -> dict:
    """Update cross-turn state after one completed conversation turn."""
    ss = _get_session_state(session_id)

    ss["history"].append({"role": "user", "content": user_text})
    ss["history"].append({"role": "assistant", "content": reply_text})
    if len(ss["history"]) > 20:
        ss["history"] = ss["history"][-20:]

    if has_errors:
        ss["streak_errors"] = ss["streak_errors"] + 1 if ss["streak_errors"] >= 0 else 1
    else:
        ss["streak_errors"] = ss["streak_errors"] - 1 if ss["streak_errors"] <= 0 else -1

    ss["total_turns"] += 1

    if ss["streak_errors"] >= 3:
        emotion = EmotionState.FRUSTRATED.value
    elif ss["streak_errors"] <= -3:
        emotion = EmotionState.CONFIDENT.value
    else:
        emotion = EmotionState.NEUTRAL.value
    ss["emotion"] = emotion

    if emotion == EmotionState.FRUSTRATED.value:
        ss["difficulty_level"] = "easy"
        ss["streak_errors"] = 0
    elif emotion == EmotionState.CONFIDENT.value:
        ss["difficulty_level"] = "hard"
        ss["streak_errors"] = 0

    return ss


async def run_text_turn(
    user_text: str,
    scenario: str,
    session_id: str,
    *,
    synthesize_voice: bool = True,
    push_sse: bool = True,
) -> dict[str, Any]:
    """
    Run one Lily turn from already-transcribed text.

    The main reply and evaluation track run concurrently. TTS runs after the
    reply is available, and errors there are returned as metadata so the
    browser can fall back to Web Speech synthesis.
    """
    ss = _get_session_state(session_id)
    difficulty = ss["difficulty_level"]

    # 使用持久化记忆作为 LLM 上下文（跨会话也能记住之前聊过的内容）
    history = get_memory_context(session_id, max_turns=6)
    # 合并内存中的近期历史（当前会话内的）
    history.extend(ss["history"][-6:])

    system_prompt = get_lily_prompt(scenario, difficulty)
    tools = get_tool_schemas()

    chat_task = chat_module.chat_with_tools(system_prompt, history, user_text, tools)
    eval_task = evaluate.evaluate(user_text, scenario)
    result, evaluation = await asyncio.gather(chat_task, eval_task)

    reply_text = result.get("reply_text", "").strip()
    tool_calls = result.get("tool_calls", [])
    has_errors = evaluation.get("overall_score", 100) < 80

    audio_base64 = ""
    tts_error = ""
    if synthesize_voice and reply_text:
        try:
            audio_bytes = await tts_module.synthesize(reply_text)
            audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
        except Exception as exc:  # TTS is helpful, but the turn should survive.
            tts_error = str(exc)

    if push_sse:
        push_feedback(session_id, evaluation)

    ss = _update_session_state(session_id, user_text, reply_text, has_errors)

    # 保存到持久化历史文件（支持回看和跨会话记忆）
    save_turn(
        session_id,
        scenario=scenario,
        user_text=user_text,
        reply_text=reply_text,
        evaluation=evaluation,
        difficulty=ss["difficulty_level"],
        emotion=ss.get("emotion", EmotionState.NEUTRAL.value),
        tool_calls=tool_calls,
    )

    return {
        "user_text": user_text,
        "reply_text": reply_text,
        "audio_base64": audio_base64,
        "scenario": scenario,
        "session_id": session_id,
        "difficulty": ss["difficulty_level"],
        "streak_errors": ss["streak_errors"],
        "total_turns": ss["total_turns"],
        "emotion": ss.get("emotion", EmotionState.NEUTRAL.value),
        "tool_calls": tool_calls,
        "evaluation": evaluation,
        "tts_error": tts_error,
    }
