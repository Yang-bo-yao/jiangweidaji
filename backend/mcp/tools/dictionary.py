"""MCP 工具: 词典查询

查询单词的释义、音标、例句、中文翻译。
使用内置词汇表，无需外部 API。
"""

# 简易内置词典（高频口语词汇）
_DICTIONARY: dict[str, dict] = {
    "order": {
        "phonetic": "/ˈɔːrdər/",
        "definition": "to request something to be made or served",
        "translation": "点餐；订购",
        "examples": ["I'd like to order a steak.", "Can I take your order now?"],
    },
    "menu": {
        "phonetic": "/ˈmenjuː/",
        "definition": "a list of dishes available in a restaurant",
        "translation": "菜单",
        "examples": ["Could I see the menu, please?", "What's on the menu today?"],
    },
    "reservation": {
        "phonetic": "/ˌrezərˈveɪʃən/",
        "definition": "an arrangement to hold a table or room",
        "translation": "预订；预约",
        "examples": ["I have a reservation for 7 PM.", "Do you need a reservation?"],
    },
    "experience": {
        "phonetic": "/ɪkˈspɪriəns/",
        "definition": "knowledge or skill gained over time",
        "translation": "经验；经历",
        "examples": ["I have 5 years of experience.", "Tell me about your experience."],
    },
    "interview": {
        "phonetic": "/ˈɪntərvjuː/",
        "definition": "a formal meeting to assess qualifications",
        "translation": "面试；采访",
        "examples": ["Thank you for coming to the interview.", "The interview went well."],
    },
    "direction": {
        "phonetic": "/dəˈrekʃən/",
        "definition": "the way to go to reach a place",
        "translation": "方向；指引",
        "examples": ["Can you give me directions?", "Go in that direction."],
    },
    "itinerary": {
        "phonetic": "/aɪˈtɪnəreri/",
        "definition": "a planned route or schedule for a trip",
        "translation": "行程；旅行计划",
        "examples": ["Here is your travel itinerary.", "Let me check the itinerary."],
    },
    "strength": {
        "phonetic": "/strɛŋθ/",
        "definition": "a good quality or ability",
        "translation": "优势；强项",
        "examples": ["What are your strengths?", "Communication is my key strength."],
    },
    "salary": {
        "phonetic": "/ˈsæləri/",
        "definition": "money received regularly for work",
        "translation": "薪水",
        "examples": ["What are your salary expectations?", "The salary is negotiable."],
    },
    "teamwork": {
        "phonetic": "/ˈtimˌwɜːrk/",
        "definition": "working together as a group",
        "translation": "团队合作",
        "examples": ["Teamwork is important in this role.", "I value teamwork."],
    },
}


def lookup_word(word: str) -> dict:
    """
    查询单词释义。

    Args:
        word: 要查询的英文单词

    Returns:
        词典数据，格式: {word, phonetic, definition, translation, examples}
        如果未找到，返回提示信息
    """
    word_lower = word.lower().strip()

    if word_lower in _DICTIONARY:
        entry = _DICTIONARY[word_lower]
        return {
            "word": word_lower,
            "phonetic": entry["phonetic"],
            "definition": entry["definition"],
            "translation": entry["translation"],
            "examples": entry["examples"],
            "found": True,
        }

    # 未找到
    return {
        "word": word_lower,
        "phonetic": "",
        "definition": "",
        "translation": "",
        "examples": [],
        "found": False,
        "message": f"词典中暂未收录 '{word_lower}'，建议用更简单的词替代",
    }


# 工具描述（供 LLM function calling 使用）
TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "lookup_word",
        "description": "查询单词的音标、释义、中文翻译和例句。当用户使用了你不确定含义的词，或你想确认某词的用法时调用。",
        "parameters": {
            "type": "object",
            "properties": {
                "word": {
                    "type": "string",
                    "description": "要查询的英文单词",
                },
            },
            "required": ["word"],
        },
    },
}
