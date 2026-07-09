"""对话生成 (LLM) — 调用豆包 LLM，支持流式、非流式、工具调用"""

import json
from typing import AsyncIterator

from backend.config import settings
from backend.llm.client import client

# Lily 默认人设 Prompt
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
        system_prompt: 系统提示词
        history: 对话历史
        user_text: 用户本轮输入

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
    """流式对话：逐 token 返回"""
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


async def chat_with_tools(
    system_prompt: str,
    history: list[dict],
    user_text: str,
    tools: list[dict],
) -> dict:
    """
    带工具调用的对话：LLM 可以决定是否调用工具。

    流程:
    1. 发送 user_text + tools 给 LLM
    2. 如果 LLM 返回 tool_calls → 执行工具 → 结果回传 LLM → 最终回复
    3. 如果 LLM 直接回复 → 返回

    Args:
        system_prompt: 系统提示词
        history: 对话历史
        user_text: 用户输入
        tools: OpenAI function 格式的工具 schema 列表

    Returns:
        {"reply_text": str, "tool_calls": list}
        tool_calls: 本次对话中调用的工具记录
    """
    messages = [
        {"role": "system", "content": system_prompt},
        *history,
        {"role": "user", "content": user_text},
    ]

    tool_call_log = []

    # 第一轮：LLM 决定是否调用工具
    response = await client.chat.completions.create(
        model=settings.llm_model_id,
        messages=messages,
        tools=tools,
        tool_choice="auto",
        temperature=0.7,
    )

    message = response.choices[0].message

    # 如果没有工具调用，直接返回
    if not message.tool_calls:
        return {
            "reply_text": message.content.strip(),
            "tool_calls": [],
        }

    # 有工具调用：执行工具循环（最多 3 轮防止死循环）
    messages.append(message)  # 加入 LLM 的工具调用消息

    for _ in range(3):
        # 执行所有工具调用
        for tool_call in message.tool_calls:
            func_name = tool_call.function.name
            try:
                func_args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                func_args = {}

            # 执行工具
            from backend.mcp.server import execute_tool
            result = execute_tool(func_name, func_args)

            tool_call_log.append({
                "name": func_name,
                "arguments": func_args,
                "result": result,
            })

            # 工具结果加入消息
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(result, ensure_ascii=False),
            })

        # 第二轮：LLM 根据工具结果生成最终回复
        response = await client.chat.completions.create(
            model=settings.llm_model_id,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            temperature=0.7,
        )

        message = response.choices[0].message

        if not message.tool_calls:
            # 没有更多工具调用，返回最终回复
            return {
                "reply_text": message.content.strip(),
                "tool_calls": tool_call_log,
            }

        # 还有工具调用，继续循环
        messages.append(message)

    # 超过 3 轮，强制返回
    return {
        "reply_text": message.content.strip() if message.content else "Let me think about that...",
        "tool_calls": tool_call_log,
    }
