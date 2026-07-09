"""LangGraph 条件边

根据状态决定路由方向，实现自适应难度干预。
"""

from backend.graph.state import AgentState, EmotionState
from backend.graph.nodes import _get_session_state


def difficulty_router(state: AgentState) -> str:
    """
    条件路由：根据 route_decision 决定下一步。

    返回值对应 builder.py 中 add_conditional_edges 的目标节点。
    """
    decision = state.get("route_decision", "normal")

    if decision == "degrade":
        # 降级难度：切换到 easy prompt
        _apply_difficulty(state, "easy")
        return "end"
    elif decision == "upgrade":
        # 升级难度：切换到 hard prompt
        _apply_difficulty(state, "hard")
        return "end"
    else:
        # 正常：保持当前难度
        return "end"


def _apply_difficulty(state: AgentState, new_difficulty: str):
    """将新难度写入会话持久状态"""
    session_id = state.get("session_id", "default")
    ss = _get_session_state(session_id)
    old = ss.get("difficulty_level", "medium")

    if old != new_difficulty:
        ss["difficulty_level"] = new_difficulty
        # 同时重置连错计数，给用户在新难度下重新开始的机会
        ss["streak_errors"] = 0
