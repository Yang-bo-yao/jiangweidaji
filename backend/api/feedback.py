"""SSE 反馈推送 — 评估轨完成后推送 JSON 到前端

使用 Server-Sent Events (SSE) 单向推送评估结果。
前端通过 EventSource 接收。
"""

import asyncio
import json
from collections import defaultdict

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

router = APIRouter()

# 评估结果队列: session_id → [待推送的评估JSON]
# main.py 在评估完成后 put 到这里，SSE 端点 get 并推送
_feedback_queues: dict[str, asyncio.Queue] = defaultdict(asyncio.Queue)


def push_feedback(session_id: str, evaluation: dict):
    """将评估结果放入队列，等待 SSE 推送"""
    _feedback_queues[session_id].put_nowait(evaluation)


@router.get("/feedback/{session_id}")
async def feedback_stream(session_id: str):
    """
    SSE 端点：前端订阅后，评估完成后自动推送 JSON。
    """
    async def event_generator():
        queue = _feedback_queues[session_id]
        try:
            # 等待评估结果（超时 30 秒自动关闭）
            evaluation = await asyncio.wait_for(queue.get(), timeout=30.0)
            yield {
                "event": "evaluation",
                "data": json.dumps(evaluation, ensure_ascii=False),
            }
        except asyncio.TimeoutError:
            yield {
                "event": "timeout",
                "data": json.dumps({"message": "评估超时"}),
            }

    return EventSourceResponse(event_generator())
