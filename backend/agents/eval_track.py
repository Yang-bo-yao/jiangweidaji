"""评估纠错轨 (Eval Track) — 严厉考官 + 强制 JSON 输出

异步旁路：和主干对话轨并发执行，不阻塞对话体验。
评估完成后通过 SSE 推送 JSON 到前端。
"""

from dataclasses import dataclass

from backend.llm import evaluate


@dataclass
class EvalTrackResult:
    """评估纠错轨的输出"""
    evaluation: dict       # 结构化评估 JSON
    has_errors: bool       # 是否检测到错误 (用于状态机连错计数)


async def run(user_text: str, scenario: str) -> EvalTrackResult:
    """
    执行评估纠错轨。

    Args:
        user_text: 用户说的文本 (来自 ASR 转写，与主干轨共享)
        scenario: 场景 key

    Returns:
        EvalTrackResult: 评估 JSON + 是否有错误
    """
    # 调用豆包 LLM 考官评估
    evaluation = await evaluate.evaluate(user_text, scenario)

    # 判断是否有错误 (overall_score < 80 视为有错)
    has_errors = evaluation.get("overall_score", 100) < 80

    return EvalTrackResult(
        evaluation=evaluation,
        has_errors=has_errors,
    )
