"""MCP 工具: Lily 技能系统

让 Lily 主动执行特殊教学动作：
- demonstrate: 示范完整对话句型
- translate: 中英互译
- explain: 解释文化背景或用法
- encourage: 给用户鼓励
"""

SKILLS = {
    "demonstrate": {
        "name": "示范句型",
        "description": "给出一个该场景下地道的英语表达示范",
    },
    "translate": {
        "name": "翻译",
        "description": "将中文翻译成英语，或将英语翻译成中文",
    },
    "explain": {
        "name": "解释",
        "description": "解释某个表达的文化背景或使用场景",
    },
    "encourage": {
        "name": "鼓励",
        "description": "给用户积极的鼓励，降低焦虑",
    },
}


def use_skill(skill_name: str, content: str = "", scenario: str = "") -> dict:
    """
    Lily 使用教学技能。

    Args:
        skill_name: 技能名称 (demonstrate/translate/explain/encourage)
        content: 技能相关内容（如要翻译的文本）
        scenario: 当前场景

    Returns:
        技能执行结果，前端可据此渲染特殊样式
    """
    if skill_name not in SKILLS:
        return {
            "skill": skill_name,
            "valid": False,
            "message": f"未知技能 '{skill_name}'，可用技能: {list(SKILLS.keys())}",
        }

    skill_info = SKILLS[skill_name]

    # 构建技能提示（LLM 会根据这个生成具体内容）
    skill_prompts = {
        "demonstrate": f"请示范一个在{scenario}场景下地道的英语表达，给出完整句子和中文意思",
        "translate": f"请翻译以下内容: {content}",
        "explain": f"请解释以下表达的文化背景或使用场景: {content}",
        "encourage": "请给用户一句温暖的鼓励，用英语说",
    }

    return {
        "skill": skill_name,
        "skill_name": skill_info["name"],
        "description": skill_info["description"],
        "prompt": skill_prompts.get(skill_name, ""),
        "content": content,
        "scenario": scenario,
        "valid": True,
    }


def list_skills() -> list[dict]:
    """列出所有可用技能"""
    return [
        {"skill": k, "name": v["name"], "description": v["description"]}
        for k, v in SKILLS.items()
    ]


# 工具描述
TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "use_skill",
        "description": "使用教学技能：demonstrate(示范句型), translate(翻译), explain(解释文化/用法), encourage(鼓励用户)。当你想给用户特殊教学辅助时调用。",
        "parameters": {
            "type": "object",
            "properties": {
                "skill_name": {
                    "type": "string",
                    "description": "技能名称",
                    "enum": ["demonstrate", "translate", "explain", "encourage"],
                },
                "content": {
                    "type": "string",
                    "description": "技能内容（如要翻译的文本、要解释的表达）",
                },
                "scenario": {
                    "type": "string",
                    "description": "当前场景 key",
                },
            },
            "required": ["skill_name"],
        },
    },
}
