"""难度分级 Prompt 管理器

根据 scenario + difficulty_level 加载对应的 Lily 系统 Prompt。
3 个场景 × 3 个难度 = 9 个 Prompt 组合。
"""

from pathlib import Path

# 场景中文名
SCENARIO_NAMES = {
    "restaurant": "餐厅点餐",
    "travel": "旅行问路",
    "interview": "面试求职",
}

# 难度级别
DIFFICULTY_LEVELS = ["easy", "medium", "hard"]

# Prompt 目录
_PROMPTS_DIR = Path(__file__).parent / "scenarios"

# 默认难度
DEFAULT_DIFFICULTY = "medium"


def get_lily_prompt(scenario: str, difficulty: str = DEFAULT_DIFFICULTY) -> str:
    """
    获取 Lily 的系统 Prompt。

    Args:
        scenario: 场景 key (restaurant/travel/interview)
        difficulty: 难度级别 (easy/medium/hard)

    Returns:
        完整的系统 Prompt 字符串
    """
    if difficulty not in DIFFICULTY_LEVELS:
        difficulty = DEFAULT_DIFFICULTY
    if scenario not in SCENARIO_NAMES:
        scenario = "restaurant"

    prompt_file = _PROMPTS_DIR / f"{scenario}_{difficulty}.txt"

    if prompt_file.exists():
        return prompt_file.read_text(encoding="utf-8")
    # 回退到 medium
    fallback = _PROMPTS_DIR / f"{scenario}_medium.txt"
    if fallback.exists():
        return fallback.read_text(encoding="utf-8")

    # 最终回退
    return f"你是 Lily，一位友善的英语口语陪练伙伴。当前场景：{scenario}，难度：{difficulty}"


def get_scenario_prompt(scenario: str) -> str:
    """兼容旧接口：只传场景，使用当前难度（Phase 1/2 调用兼容）"""
    return get_lily_prompt(scenario, DEFAULT_DIFFICULTY)
