"""LangGraph 全局状态定义

定义 AgentState，包含对话输入输出和跨轮次维护的全局状态。
"""

from enum import Enum
from typing import TypedDict, Optional


class EmotionState(str, Enum):
    """用户情绪状态"""
    HAPPY = "happy"
    NEUTRAL = "neutral"
    FRUSTRATED = "frustrated"
    CONFIDENT = "confident"


class AgentState(TypedDict, total=False):
    """
    LangGraph 全局状态。

    total=False 表示所有字段都是可选的，图节点按需读写。
    """
    # ─── 输入 ───
    session_id: str                        # 会话 ID
    audio_bytes: bytes                     # 用户原始音频
    audio_filename: str                    # 音频文件名
    scenario: str                          # 当前场景 (restaurant/travel/interview)

    # ─── ASR 输出 ───
    user_text: str                         # ASR 转写文本

    # ─── 主干对话轨输出 ───
    reply_text: str                        # Lily 的回复文本
    audio_out_base64: str                  # TTS 音频 (base64)
    tool_calls: list                       # 本轮工具调用记录

    # ─── 评估纠错轨输出 ───
    evaluation: dict                       # JSON 结构化评估数据
    has_errors: bool                       # 本轮是否有错误

    # ─── 全局状态（跨轮次维护）───
    history: list[dict]                    # 对话历史
    emotion: str                           # 用户情绪 (EmotionState value)
    streak_errors: int                     # 连续出错次数 (正=连错, 负=连对)
    difficulty_level: str                  # 当前难度: easy/medium/hard
    total_turns: int                       # 总对话轮次
    mcp_context: Optional[str]             # MCP 工具检索到的上下文

    # ─── 路由决策 ───
    route_decision: str                    # 路由结果: degrade/normal/upgrade
