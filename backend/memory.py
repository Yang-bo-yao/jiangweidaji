"""对话记忆模块 — 持久化对话历史到本地 JSON 文件

功能：
1. 每轮对话结束后保存完整记录（用户文本 + Lily回复 + 评估 + 时间戳 + 场景）
2. 支持按 session_id 查询全部历史
3. 支持列出所有历史会话
4. 记忆摘要：Lily 启动时加载最近几轮对话作为上下文，实现"记忆"效果
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

# 历史记录存储目录
_HISTORY_DIR = Path(__file__).parent.parent / "data" / "history"
_HISTORY_DIR.mkdir(parents=True, exist_ok=True)


def _session_file(session_id: str) -> Path:
    """获取会话历史文件路径"""
    return _HISTORY_DIR / f"{session_id}.json"


def load_history(session_id: str) -> dict:
    """
    加载会话的完整历史记录。

    Returns:
        {
            "session_id": str,
            "created_at": str,
            "scenario": str,
            "turns": [
                {
                    "turn": int,
                    "timestamp": str,
                    "scenario": str,
                    "user_text": str,
                    "reply_text": str,
                    "evaluation": dict,
                    "difficulty": str,
                    "emotion": str,
                    "tool_calls": list
                }
            ]
        }
    """
    f = _session_file(session_id)
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    return {
        "session_id": session_id,
        "created_at": datetime.now().isoformat(),
        "scenario": "",
        "turns": [],
    }


def save_turn(
    session_id: str,
    *,
    scenario: str,
    user_text: str,
    reply_text: str,
    evaluation: Optional[dict] = None,
    difficulty: str = "medium",
    emotion: str = "neutral",
    tool_calls: Optional[list] = None,
) -> None:
    """
    保存一轮对话到历史记录文件。

    在每轮对话结束后调用，追加到 JSON 文件。
    """
    data = load_history(session_id)

    # 更新场景（以最近一次为准）
    data["scenario"] = scenario

    turn_record = {
        "turn": len(data["turns"]) + 1,
        "timestamp": datetime.now().isoformat(),
        "scenario": scenario,
        "user_text": user_text,
        "reply_text": reply_text,
        "evaluation": evaluation or {},
        "difficulty": difficulty,
        "emotion": emotion,
        "tool_calls": tool_calls or [],
    }

    data["turns"].append(turn_record)
    data["updated_at"] = datetime.now().isoformat()

    _session_file(session_id).write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def get_memory_context(session_id: str, max_turns: int = 6) -> list[dict]:
    """
    获取最近几轮对话作为 LLM 上下文（记忆功能）。

    返回 OpenAI messages 格式的历史：
    [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]

    Args:
        session_id: 会话 ID
        max_turns: 最多取最近几轮（默认6轮=12条消息）
    """
    data = load_history(session_id)
    recent = data["turns"][-max_turns:]

    messages = []
    for t in recent:
        messages.append({"role": "user", "content": t["user_text"]})
        messages.append({"role": "assistant", "content": t["reply_text"]})

    return messages


def list_all_sessions() -> list[dict]:
    """
    列出所有历史会话（按更新时间倒序）。

    Returns:
        [{"session_id": str, "created_at": str, "updated_at": str, "scenario": str, "turn_count": int}]
    """
    sessions = []
    for f in _HISTORY_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            sessions.append({
                "session_id": data.get("session_id", f.stem),
                "created_at": data.get("created_at", ""),
                "updated_at": data.get("updated_at", ""),
                "scenario": data.get("scenario", ""),
                "turn_count": len(data.get("turns", [])),
            })
        except (json.JSONDecodeError, KeyError):
            continue

    # 按更新时间倒序
    sessions.sort(key=lambda s: s.get("updated_at", ""), reverse=True)
    return sessions


def delete_history(session_id: str) -> bool:
    """删除会话历史记录"""
    f = _session_file(session_id)
    if f.exists():
        f.unlink()
        return True
    return False
