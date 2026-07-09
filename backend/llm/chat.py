"""对话生成 (LLM) — 调用豆包 LLM，支持流式和非流式"""

from typing import AsyncIterator

from backend.config import settings
from backend.llm.client import client

# Lily 默认人设 Prompt (Phase 1 基础版，Phase 3 会按场景和难度动态加载)
DEFAULT_SYSTEM_PROMPT = """你是 Lily，一位温暖友善的英语口语陪练伙伴。

你的职责：
- 用英语和用户进行自然对话，扮演当前场景中的角色
- 保持对话流畅，鼓励用户多说
- 不要直接纠正用户的语法错误（纠错由评估轨负责）
- 回复保持简洁自然，像真实对话一样（1-3 句话）
- 如果用户用中文，温和地引导他们尝试用英语表达

当前场景：{scenario}
"""


async def chat(
    system_prompt: str,
    history: list[dict],
    user_text: str,
) -> str:
    """
    非流式对话：一次性返回完整回复。

    Args:
        system_prompt: 系统提示词 (Lily 人设 + 场景)
        history: 对话历史 [{"role": "user/assistant", "content": "..."}]
        user_text: 用户本轮输入文本

    Returns:
        Lily 的完整回复文本
    """
    response = await client.chat.completions.create(
        model=settings.llm_model_id,
        messages=[
            {"role": "system", "content": system_prompt},
            *history,
            {"role": "user", "content": user_text},
        ],
        temperature=0.7,
    )
    return response.choices[0].message.content.strip()


async def chat_stream(
    system_prompt: str,
    history: list[dict],
    user_text: str,
) -> AsyncIterator[str]:
    """
    流式对话：逐 token 返回，用于实时字幕。

    Yields:
        每次 yield 一个文本片段 (delta)
    """
    stream = await client.chat.completions.create(
        model=settings.llm_model_id,
        messages=[
            {"role": "system", "content": system_prompt},
            *history,
            {"role": "user", "content": user_text},
        ],
        temperature=0.7,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
