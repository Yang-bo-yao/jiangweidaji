"""LangGraph 图构建器

组装 StateGraph：定义节点和边，编译为可执行的图。

图结构：
    START → asr → state_update → [main_track ‖ eval_track] → merge → router → END

关键设计：
- main_track 和 eval_track 并发执行（通过 asyncio.gather 在 merge 前完成）
- router 是条件路由节点，根据难度决策决定后续
"""

import asyncio

from langgraph.graph import StateGraph, END

from backend.graph.state import AgentState
from backend.graph import nodes
from backend.graph.edges import difficulty_router


async def _parallel_tracks(state: AgentState) -> dict:
    """
    并发执行主干对话轨和评估纠错轨。

    LangGraph 不原生支持同层并行节点，这里用 asyncio.gather
    在一个节点内实现双流并发。
    """
    main_result, eval_result = await asyncio.gather(
        nodes.main_track_node(state),
        nodes.eval_track_node(state),
    )

    # 合并两个节点的返回
    return {**main_result, **eval_result}


def build_graph():
    """
    构建 LangGraph 状态机图。

    Returns:
        编译后的可执行图 (CompiledGraph)
    """
    graph = StateGraph(AgentState)

    # ─── 添加节点 ───
    graph.add_node("asr", nodes.asr_node)
    graph.add_node("state_update", nodes.state_update_node)
    graph.add_node("parallel_tracks", _parallel_tracks)
    graph.add_node("merge", nodes.merge_node)
    graph.add_node("router", nodes.router_node)

    # ─── 添加边（定义执行顺序）───
    graph.set_entry_point("asr")
    graph.add_edge("asr", "state_update")
    graph.add_edge("state_update", "parallel_tracks")
    graph.add_edge("parallel_tracks", "merge")
    graph.add_edge("merge", "router")

    # 条件路由：router → END（难度调整在 edge 中已执行）
    graph.add_conditional_edges(
        "router",
        difficulty_router,
        {
            "end": END,
        },
    )

    # 编译
    return graph.compile()


# 全局编译后的图实例
compiled_graph = build_graph()
