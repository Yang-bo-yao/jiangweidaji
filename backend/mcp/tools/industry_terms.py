"""MCP 工具: 行业术语检索

根据当前场景检索相关专业术语，动态为对话注入词汇支持。
"""

import json
from pathlib import Path
from typing import Optional

_TERMS_FILE = Path(__file__).parent.parent.parent / "data" / "industry_terms.json"
_terms_cache: Optional[dict] = None


def _load_terms() -> dict:
    """加载术语库（带缓存）"""
    global _terms_cache
    if _terms_cache is None:
        _terms_cache = json.loads(_TERMS_FILE.read_text(encoding="utf-8"))
    return _terms_cache


def search_industry_terms(scenario: str, query: str = "") -> dict:
    """
    检索当前场景相关的专业术语。

    Args:
        scenario: 场景 key (restaurant/travel/interview)
        query: 可选搜索词，模糊匹配

    Returns:
        匹配的术语列表，格式: {scenario, count, terms: [{en, zh, example}]}
    """
    terms_db = _load_terms()

    if scenario not in terms_db:
        return {
            "scenario": scenario,
            "count": 0,
            "terms": [],
            "message": f"场景 '{scenario}' 未找到术语库",
        }

    all_terms = terms_db[scenario]["terms"]

    if query:
        query_lower = query.lower()
        matched = [
            t for t in all_terms
            if query_lower in t["en"].lower() or query_lower in t["zh"]
        ]
    else:
        # 无 query 时返回前 5 个高频术语
        matched = all_terms[:5]

    return {
        "scenario": scenario,
        "scenario_name": terms_db[scenario]["name"],
        "count": len(matched),
        "terms": matched,
    }


# 工具描述
TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "search_industry_terms",
        "description": "检索当前对话场景相关的专业英语术语。当需要为对话引入专业词汇或用户需要学习场景相关术语时调用。",
        "parameters": {
            "type": "object",
            "properties": {
                "scenario": {
                    "type": "string",
                    "description": "场景 key: restaurant(餐厅), travel(旅行), interview(面试)",
                    "enum": ["restaurant", "travel", "interview"],
                },
                "query": {
                    "type": "string",
                    "description": "可选：搜索关键词，模糊匹配英文或中文",
                },
            },
            "required": ["scenario"],
        },
    },
}
