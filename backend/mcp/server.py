"""MCP 工具服务器 — 统一注册和管理所有工具

供 LangGraph 节点调用，实现 LLM function calling。
"""

from backend.mcp.tools import dictionary, industry_terms, skill


# ─── 工具注册表 ──────────────────────────────────────────────────
# name → (执行函数, OpenAI function schema)
TOOL_REGISTRY: dict[str, tuple] = {
    "lookup_word": (dictionary.lookup_word, dictionary.TOOL_SCHEMA),
    "search_industry_terms": (industry_terms.search_industry_terms, industry_terms.TOOL_SCHEMA),
    "use_skill": (skill.use_skill, skill.TOOL_SCHEMA),
}


def get_tool_schemas() -> list[dict]:
    """获取所有工具的 OpenAI function schema 列表"""
    return [schema for _, schema in TOOL_REGISTRY.values()]


def execute_tool(name: str, arguments: dict) -> any:
    """
    执行指定工具。

    Args:
        name: 工具名称
        arguments: 工具参数

    Returns:
        工具执行结果
    """
    if name not in TOOL_REGISTRY:
        return {"error": f"未知工具: {name}"}

    func, _ = TOOL_REGISTRY[name]
    try:
        return func(**arguments)
    except Exception as e:
        return {"error": f"工具执行失败: {e}"}


def list_tools() -> list[dict]:
    """列出所有已注册工具"""
    return [
        {
            "name": name,
            "schema": schema["function"],
        }
        for name, (_, schema) in TOOL_REGISTRY.items()
    ]
