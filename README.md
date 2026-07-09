# Lily — 双流多智能体口语陪练 Agent

> **"改变教育 —— AI 学习体验重塑赛道"** 参赛项目

## 一句话介绍

Lily 是一个双流多智能体口语陪练 Agent——主干对话轨极速响应 + 评估纠错轨异步反馈，LangGraph 状态机自适应难度，MCP 工具动态注入专业术语。

## 核心架构

```
                    LangGraph 状态机编排
                   /                      \
        ┌─────────▼──────────┐  ┌────────▼─────────┐
        │  主干对话轨 (Main)  │  │ 评估纠错轨 (Eval) │
        │  · 豆包ASR→LLM→TTS │  │ · 考官LLM→JSON   │
        │  · 流式语音响应     │  │ · SSE推送反馈     │
        └─────────┬──────────┘  └────────┬─────────┘
                   │      并发执行        │
                   └──────────┬──────────┘
                              │
                    MCP 工具层 (词典/术语/RAG)
                              │
                    豆包大模型 API (火山引擎Ark)
```

## 技术栈

| 环节 | 方案 |
|------|------|
| 前端 | 原生 HTML + JS + Chart.js (反馈雷达图) |
| 后端 | Python FastAPI + LangGraph 状态机 |
| 双流Agent | 主干对话轨 + 评估纠错轨 (异步并发) |
| MCP工具 | 词典API + 行业术语库 + RAG知识库 |
| LLM/ASR/TTS | 豆包大模型 (火山引擎 Ark, 兼容OpenAI SDK) |
| 通信 | WebSocket (对话流) + SSE (反馈流) |

## 快速开始

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env，填入火山引擎 ARK_API_KEY 和模型ID

# 2. 安装后端依赖
pip install -r requirements.txt

# 3. 启动后端
cd backend && uvicorn main:app --reload --port 8000

# 4. 打开前端
open frontend/index.html
```

## 文档

- [架构设计与开发步骤](./project_architecture.md) — 完整架构、LangGraph状态机、MCP工具、豆包API、开发步骤
- [比赛规划](./比赛规划.md) — 设计灵感与功能设计

## MVP 交付清单

- [x] 架构设计
- [ ] 豆包 ASR + LLM + TTS 调通
- [ ] 双流并发 (主干对话 + 评估纠错)
- [ ] LangGraph 状态机 + 自适应难度
- [ ] MCP 工具挂载 (词典 + 术语)
- [ ] 反馈面板 (雷达图 + 语法建议)
- [ ] 3个场景 Demo (餐厅/旅行/面试)
