"""评估纠错 (Evaluation) — 调用豆包 LLM，强制 JSON 输出

评估轨核心模块：扮演"严厉考官"，对用户口语进行多维度评分。
"""

import json
from pathlib import Path

from backend.config import settings
from backend.llm.client import client

# 加载考官 Prompt 模板
_EVAL_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "evaluator.txt"
_EVAL_PROMPT_TEMPLATE = _EVAL_PROMPT_PATH.read_text(encoding="utf-8")


def get_eval_prompt(scenario: str) -> str:
    """获取评估 Prompt，填入场景"""
    return _EVAL_PROMPT_TEMPLATE.replace("{scenario}", scenario)


async def evaluate(user_text: str, scenario: str) -> dict:
    """
    评估用户口语表达，返回结构化 JSON。

    Args:
        user_text: 用户说的文本 (ASR 转写结果)
        scenario: 当前场景 key

    Returns:
        结构化评估数据，格式:
        {
            "overall_score": int,
            "dimensions": { "grammar": {...}, "vocabulary": {...}, ... },
            "corrected_sentence": str,
            "encouragement": str
        }
    """
    system_prompt = get_eval_prompt(scenario)

    response = await client.chat.completions.create(
        model=settings.llm_model_id,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text},
        ],
        response_format={"type": "json_object"},  # 强制 JSON 输出
        temperature=0.3,  # 低温度保证评分稳定
    )

    raw = response.choices[0].message.content
    return json.loads(raw)
