# 多国语口语虚拟形象 Agent — 双流多智能体架构（比赛版）

## 设计原则

> **核心目标：用最先进的 Agent 架构做最小化的可展示系统。**
> 双流并发 + LangGraph 状态机 + MCP 工具挂载 + 豆包多模态大模型 + VRM 3D 虚拟形象。

---

## 一、核心设计思路总结

本系统从线性流水线升级为 **双流多智能体架构**，核心创新点：

| 创新点 | 说明 |
|--------|------|
| **双流并发** | 后端拆分为「主干对话轨」+「评估纠错轨」两条异步流，对话不等纠错，体验更流畅 |
| **LangGraph 状态机** | 用图结构替代线性调用，全局状态包含场景/情绪/连错次数，支持自适应难度路由 |
| **自适应难度干预** | 状态机检测到用户连续卡顿 → 自动切换 System Prompt → LLM 降级词汇难度 |
| **MCP 工具挂载** | Agent 可实时调用外部词典 API、行业语料库、本地 RAG，动态注入专业术语 |
| **豆包多模态** | 用豆包大模型统一覆盖 ASR + LLM + TTS，支持语音端到端输出 |

---

## 二、系统总体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                          前端 (Web 单页面)                            │
│  ┌────────┐  ┌───────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │ 录音按钮 │  │ 3D 虚拟形象 │  │ 对话字幕  │  │ 纠错反馈面板(JSON) │  │
│  │ 🎤     │  │ (VRM)     │  │ 实时流式  │  │ 评分+语法+建议     │  │
│  └────────┘  └───────────┘  └──────────┘  └────────────────────┘  │
│         ↑ SSE流               ↑ SSE流          ↑ SSE流              │
├─────────┼─────────────────────┼────────────────┼───────────────────┤
│         └─────────────────────┼────────────────┘                   │
│                    WebSocket / SSE 双通道                            │
├─────────────────────────────────────────────────────────────────────┤
│                      后端 (FastAPI + LangGraph)                      │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              LangGraph 状态机编排器                          │   │
│  │  全局状态: { scenario, emotion, streak_errors, history, ... }│   │
│  │  路由逻辑: 连错≥3 → 降级Prompt / 情绪低 → 鼓励Prompt        │   │
│  └──────────┬──────────────────────────────┬───────────────────┘   │
│             │                              │                       │
│     ┌───────▼───────┐            ┌────────▼────────┐              │
│     │  主干对话轨    │            │  评估纠错轨      │              │
│     │  (Main Track)  │  并发执行   │  (Eval Track)   │              │
│     │                │◄──────────►│  异步旁路        │              │
│     │ · 角色扮演     │            │ · 严厉考官       │              │
│     │ · 豆包LLM对话  │            │ · 扫描语病       │              │
│     │ · 豆包TTS语音  │            │ · 强制JSON输出   │              │
│     │ · 流式返回     │            │ · SSE推送前端    │              │
│     └───────┬───────┘            └────────┬────────┘              │
│             │                             │                       │
│             ▼                             ▼                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   MCP 工具层                                │   │
│  │  · 词典 API (查词/翻译)                                     │   │
│  │  · 行业语料库 (商务/旅游/学术专业术语)                        │   │
│  │  · 本地 RAG 知识库 (文化常识/场景背景)                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   豆包大模型 API 层                          │   │
│  │  · Doubao ASR (语音识别)                                    │   │
│  │  · Doubao LLM (对话生成, 兼容OpenAI格式)                     │   │
│  │  · Doubao TTS (语音合成, 多音色)                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 三、双流多智能体设计详解

### 3.1 主干对话轨 (Main Track)

**角色定位**：温暖的对话伙伴，负责角色扮演和极速响应。

```
用户语音 → 豆包ASR → 转写文本 → 豆包LLM(角色扮演) → 豆包TTS → 流式音频
                                    ↑
                           场景Prompt + 历史上下文
                           + MCP工具注入术语
```

**特点**：
- **流式响应**：LLM 边生成边输出，TTS 边合成边播放，用户几乎无感等待
- **角色扮演**：根据场景设定角色性格（服务员/HR/导游等），保持人设一致
- **不负责纠错**：对话轨只管聊得开心，不批评用户
- **极速返回**：不等评估轨完成，先返回对话内容

### 3.2 评估纠错轨 (Eval Track) — 异步旁路

**角色定位**：严厉考官，专门挑错，强制输出结构化数据。

```
转写文本 → 豆包LLM(考官角色) → 强制JSON输出 → SSE推送前端
                ↑
        "你是严格的英语口语考官，请检查以下句子的
         语法、词汇、发音、得体性，以JSON格式输出"
```

**强制 JSON 输出结构**：
```json
{
  "overall_score": 78,
  "dimensions": {
    "grammar": { "score": 85, "errors": ["时态错误: 'I goes' → 'I go'"], "suggestions": "注意第三人称单数" },
    "vocabulary": { "score": 70, "errors": ["词汇重复: 多次使用'good'"], "suggestions": "尝试用'excellent/fantastic'" },
    "fluency": { "score": 80, "errors": ["停顿过多"], "suggestions": "提前构思句型" },
    "appropriateness": { "score": 75, "errors": ["面试场景用词偏随意"], "suggestions": "使用更正式表达" }
  },
  "corrected_sentence": "I would like to order a steak, please.",
  "encouragement": "整体表达清晰，注意时态一致性会更好！"
}
```

**特点**：
- **完全异步**：和对话轨并发执行，不阻塞用户对话体验
- **结构化输出**：强制 JSON，前端直接渲染雷达图和具体建议
- **SSE 推送**：评估完成后通过 Server-Sent Events 推送到前端反馈面板
- **独立 LLM 调用**：用不同的 System Prompt，扮演"严厉考官"

### 3.3 两轨协同关系

```
时间轴 ──────────────────────────────────────────────►

T0: 用户说话结束，音频上传
    │
    ├──► 主干对话轨 (并发)
    │     T1: ASR 转写完成
    │     T2: LLM 开始生成 (流式)
    │     T3: TTS 开始合成 (流式)
    │     T4: 前端开始播放语音 ← 用户此时已听到回复
    │
    └──► 评估纠错轨 (并发)
          T1: ASR 转写完成 (共享转写结果)
          T2: LLM 考官分析 (独立调用)
          T5: 评估完成 (比对话晚 1-2 秒)
          T6: SSE 推送 JSON 反馈 → 前端面板更新

用户体验: 对话无延迟 + 1-2秒后看到纠错反馈
```

---

## 四、LangGraph 状态机编排

### 4.1 全局状态定义

```python
from typing import TypedDict, List, Optional
from enum import Enum

class EmotionState(Enum):
    HAPPY = "happy"
    NEUTRAL = "neutral"
    FRUSTRATED = "frustrated"
    CONFIDENT = "confident"

class AgentState(TypedDict):
    # 输入
    user_audio: bytes                    # 用户原始音频
    user_text: str                       # ASR 转写文本
    scenario: str                        # 当前场景 (restaurant/travel/interview)

    # 对话轨输出
    reply_text: str                      # LLM 回复文本
    reply_audio: bytes                   # TTS 合成音频

    # 评估轨输出
    evaluation: dict                     # JSON 结构化评估数据

    # 全局状态（跨轮次维护）
    history: List[dict]                  # 对话历史
    emotion: EmotionState                # 用户情绪状态
    streak_errors: int                   # 连续出错次数
    difficulty_level: str                # 当前难度: easy/medium/hard
    total_turns: int                     # 总对话轮次
    mcp_context: Optional[str]           # MCP 工具检索到的上下文
```

### 4.2 状态机图结构

```
                    ┌──────────────┐
                    │   START      │
                    │  接收用户输入  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  ASR Node    │
                    │  豆包语音识别  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ State Update │
                    │ 更新全局状态   │
                    │ (连错计数等)   │
                    └──┬───────┬───┘
                       │       │
         ┌─────────────┘       └─────────────┐
         │                                   │
  ┌──────▼──────┐                    ┌──────▼──────┐
  │ Main Track  │     并发执行        │ Eval Track  │
  │ 对话轨节点   │◄─────── ────────►  │ 评估轨节点   │
  │ · 加载Prompt │                    │ · 考官Prompt │
  │ · MCP工具    │                    │ · JSON输出   │
  │ · 豆包LLM    │                    │ · 豆包LLM    │
  │ · 豆包TTS    │                    └──────┬──────┘
  └──────┬──────┘                           │
         │                                   │
         └─────────────┬─────────────────────┘
                       │
                ┌──────▼───────┐
                │ Merge Node   │
                │ 合并双轨结果   │
                └──────┬───────┘
                       │
                ┌──────▼───────┐
                │ Router Node  │ ◄── 条件路由
                │ 自适应难度决策 │
                └──────┬───────┘
                       │
              ┌────────┼────────┐
              │        │        │
     ┌────────▼──┐ ┌──▼─────┐ ┌─▼──────────┐
     │ 降级路由   │ │ 正常    │ │ 鼓励路由    │
     │ 切换Easy  │ │ 继续    │ │ 切换鼓励    │
     │ Prompt    │ │        │ │ Prompt     │
     └────────┬──┘ └──┬─────┘ └─┬──────────┘
              │       │         │
              └───────┼─────────┘
                      │
               ┌──────▼───────┐
               │  END / LOOP  │
               │  返回前端     │
               └──────────────┘
```

### 4.3 自适应难度干预逻辑

```python
def difficulty_router(state: AgentState) -> str:
    """条件路由：根据连错次数决定下一步策略"""
    streak = state["streak_errors"]
    emotion = state["emotion"]

    # 连错≥3次 或 情绪frustrated → 降级难度
    if streak >= 3 or emotion == EmotionState.FRUSTRATED:
        state["difficulty_level"] = "easy"
        return "degrade"          # → 切换到 Easy Prompt

    # 连续答对≥3次 → 升级难度
    if streak <= -3:
        state["difficulty_level"] = "hard"
        return "upgrade"

    return "normal"               # → 继续正常对话
```

### 4.4 难度分级 Prompt 示例

```python
PROMPTS = {
    "easy": """你是一位友善的对话伙伴。请使用简单词汇和短句，
              语速放慢，多用基础词汇。如果对方不理解，主动解释。
              当前场景: {scenario}""",

    "medium": """你是一位自然的对话伙伴。使用日常交流词汇，
                保持正常语速。当前场景: {scenario}""",

    "hard": """你是一位专业的对话伙伴。使用高级词汇和复杂句型，
              可以使用行业专业术语。当前场景: {scenario}"""
}
```

---

## 五、MCP 工具挂载设计

### 5.1 MCP 架构

```
┌──────────────┐     MCP Protocol      ┌──────────────────┐
│  LLM Agent   │◄────────────────────► │  MCP Server       │
│  (豆包LLM)   │     tool_call          │                   │
│              │◄────────────────────► │  ┌──────────────┐ │
│              │     tool_result        │  │ 词典工具     │ │
│              │                        │  │ 查词/翻译    │ │
│              │                        │  ├──────────────┤ │
│              │                        │  │ 语料库工具   │ │
│              │                        │  │ 行业术语     │ │
│              │                        │  ├──────────────┤ │
│              │                        │  │ RAG工具      │ │
│              │                        │  │ 文化知识检索  │ │
│              │                        │  └──────────────┘ │
└──────────────┘                        └──────────────────┘
```

### 5.2 工具定义

```python
from mcp import Server, Tool

# 工具1: 词典查询
@Tool
async def lookup_word(word: str, target_lang: str) -> dict:
    """查询单词释义、音标、例句"""
    # 调用有道词典API 或 本地词典
    return {
        "word": word,
        "phonetic": "/wɜːrd/",
        "definition": "a single distinct meaningful element",
        "examples": ["Can you repeat that word?"],
        "translation": "单词"
    }

# 工具2: 行业术语检索
@Tool
async def search_industry_terms(scenario: str, query: str) -> list:
    """检索当前场景相关的专业术语"""
    terms_db = {
        "interview": ["strengths", "weaknesses", "experience",
                      "qualification", "salary expectation"],
        "restaurant": ["rare", "medium", "well-done",
                      "appetizer", "main course", "beverage"],
        "travel": ["boarding pass", "layover", "itinerary",
                   "check-in", "departure", "customs"]
    }
    return terms_db.get(scenario, [])

# 工具3: 本地 RAG 文化知识
@Tool
async def rag_culture_knowledge(query: str) -> str:
    """检索文化背景知识"""
    # 简单实现: 加载本地 markdown 文件做关键词匹配
    # 进阶实现: 向量检索 (FAISS/Chroma)
    return "在西方餐厅，小费通常为账单的15-20%..."
```

### 5.3 工具调用时机

```
对话轨 LLM 调用时:
1. LLM 判断是否需要查词 → 调用 lookup_word
2. LLM 判断是否需要术语 → 调用 search_industry_terms
3. 工具结果注入到 LLM 上下文 → 生成更专业的回复

示例:
用户: "我想在面试中说我的优点"
→ LLM 调用 search_industry_terms("interview", "strengths")
→ 获取: ["strengths", "leadership", "teamwork", "problem-solving"]
→ LLM 回复: "Great! What would you say are your main strengths?
   For example, are you good at leadership or teamwork?"
```

---

## 六、豆包大模型 API 集成

### 6.1 API 概览

豆包大模型通过火山引擎方舟平台 (Ark) 调用，**兼容 OpenAI API 格式**。

| 能力 | 模型 | 调用方式 |
|------|------|----------|
| 语音识别 (ASR) | Doubao ASR | base64 音频 → 文本 |
| 对话生成 (LLM) | Doubao-pro-32k / Doubao-pro-128k | OpenAI 兼容格式 |
| 语音合成 (TTS) | Doubao TTS | 文本 → 音频 (多音色) |

### 6.2 配置

```python
# .env
ARK_API_KEY=your_volcano_engine_api_key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ASR_MODEL_ID=doubao_asr_model_id
LLM_MODEL_ID=doubao-pro-32k-model-id
TTS_MODEL_ID=doubao_tts_model_id
TTS_VOICE=zh_female_qingxin    # 音色: 清新女声
```

### 6.3 核心调用代码

```python
from openai import AsyncOpenAI  # 豆包兼容 OpenAI SDK

client = AsyncOpenAI(
    api_key=settings.ARK_API_KEY,
    base_url=settings.ARK_BASE_URL
)

# 1. ASR: 语音识别
async def doubao_asr(audio_bytes: bytes) -> str:
    audio_b64 = base64.b64encode(audio_bytes).decode()
    response = await client.audio.transcriptions.create(
        model=settings.ASR_MODEL_ID,
        file=("audio.wav", audio_bytes, "audio/wav"),
    )
    return response.text

# 2. LLM: 对话生成 (流式)
async def doubao_chat_stream(system_prompt: str, history: list, user_text: str):
    stream = await client.chat.completions.create(
        model=settings.LLM_MODEL_ID,
        messages=[
            {"role": "system", "content": system_prompt},
            *history,
            {"role": "user", "content": user_text}
        ],
        stream=True,          # 流式输出
        temperature=0.7,
    )
    async for chunk in stream:
        if chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content

# 3. TTS: 语音合成
async def doubao_tts(text: str) -> bytes:
    response = await client.audio.speech.create(
        model=settings.TTS_MODEL_ID,
        voice=settings.TTS_VOICE,
        input=text,
        response_format="mp3",
    )
    return response.content

# 4. 评估轨: 强制 JSON 输出
async def doubao_evaluate(user_text: str, scenario: str) -> dict:
    response = await client.chat.completions.create(
        model=settings.LLM_MODEL_ID,
        messages=[
            {"role": "system", "content": EVAL_PROMPT.format(scenario=scenario)},
            {"role": "user", "content": user_text}
        ],
        response_format={"type": "json_object"},  # 强制JSON
        temperature=0.3,  # 低温度保证稳定
    )
    return json.loads(response.choices[0].message.content)
```

---

## 七、项目目录结构

```
jiangweidaji/
├── README.md
├── .env.example                    # 环境变量模板
├── requirements.txt                # Python 依赖
│
├── frontend/                       # 前端
│   ├── index.html                  # 单页面入口
│   ├── style.css                   # 样式
│   ├── app.js                      # 主逻辑: 录音 + SSE接收 + 播放
│   ├── avatar.js                   # VRM 3D 虚拟形象模块
│   ├── feedback.js                 # 纠错反馈面板渲染 (JSON→雷达图)
│   └── models/
│       └── avatar.vrm              # VRM 模型文件
│
├── backend/                        # 后端
│   ├── main.py                     # FastAPI 入口 + 路由
│   ├── config.py                   # 配置管理 (Pydantic Settings)
│   │
│   ├── graph/                      # LangGraph 状态机
│   │   ├── __init__.py
│   │   ├── state.py                # 全局状态定义 (AgentState)
│   │   ├── nodes.py                # 图节点: ASR / Main / Eval / Merge / Router
│   │   ├── edges.py                # 条件边: 难度路由逻辑
│   │   └── builder.py              # 图构建器: 组装 StateGraph
│   │
│   ├── agents/                     # 双流 Agent
│   │   ├── __init__.py
│   │   ├── main_track.py           # 主干对话轨: ASR→LLM→TTS (流式)
│   │   └── eval_track.py           # 评估纠错轨: LLM考官→JSON→SSE推送
│   │
│   ├── mcp/                        # MCP 工具服务器
│   │   ├── __init__.py
│   │   ├── server.py               # MCP Server 启动
│   │   └── tools/
│   │       ├── dictionary.py       # 词典查询工具
│   │       ├── industry_terms.py   # 行业术语检索
│   │       └── rag_knowledge.py    # 本地RAG文化知识
│   │
│   ├── llm/                        # 豆包大模型封装
│   │   ├── __init__.py
│   │   ├── client.py               # 豆包API客户端 (兼容OpenAI SDK)
│   │   ├── asr.py                  # 语音识别封装
│   │   ├── chat.py                 # 对话生成 (流式)
│   │   ├── tts.py                  # 语音合成
│   │   └── evaluate.py             # 评估JSON输出
│   │
│   ├── prompts/                    # Prompt 模板
│   │   ├── scenarios/              # 场景Prompt
│   │   │   ├── restaurant.txt      # 餐厅场景 (easy/medium/hard)
│   │   │   ├── travel.txt          # 旅行场景
│   │   │   └── interview.txt       # 面试场景
│   │   ├── evaluator.txt           # 考官评估Prompt
│   │   └── difficulty.py           # 难度分级Prompt管理
│   │
│   ├── api/                        # API 路由
│   │   ├── __init__.py
│   │   ├── chat.py                 # POST /chat (上传音频)
│   │   ├── stream.py               # SSE /stream (流式返回对话+音频)
│   │   └── feedback.py             # SSE /feedback (推送评估JSON)
│   │
│   └── data/                       # 本地数据
│       ├── industry_terms.json     # 行业术语库
│       └── culture_knowledge/      # 文化知识RAG语料
│           ├── restaurant.md
│           ├── travel.md
│           └── interview.md
│
└── docs/
    ├── architecture.md             # 本文档
    └── scenario-design.md          # 场景设计
```

---

## 八、数据流详解（一次完整对话）

```
1. 用户按住录音 → 松开发送
   POST /chat  { audio: base64, scenario: "restaurant", session_id: "xxx" }
         │
         ▼
2. FastAPI 接收 → 交给 LangGraph 状态机
         │
         ▼
3. State Update Node: 加载历史状态 (emotion, streak_errors, difficulty)
         │
         ■═════════════════════════════════════════════════════════╗
         ║                    并发双流开始                            ║
         ╠════════════════════════════╦═════════════════════════════╣
         ║     主干对话轨 (Main)       ║      评估纠错轨 (Eval)        ║
         ╠════════════════════════════╬═════════════════════════════╣
         ║ 4a. 豆包ASR 转写            ║ 4b. 共享ASR转写结果          ║
         ║     → "I want order steak" ║     → "I want order steak"  ║
         ║                            ║                             ║
         ║ 5a. 加载场景Prompt          ║ 5b. 加载考官Prompt           ║
         ║     (按难度级别选择)        ║     (强制JSON输出)           ║
         ║                            ║                             ║
         ║ 6a. MCP工具调用(可选)       ║                             ║
         ║     → 检索餐厅术语          ║                             ║
         ║     → "main course, etc"   ║                             ║
         ║                            ║                             ║
         ║ 7a. 豆包LLM 流式生成        ║ 6b. 豆包LLM 评估分析         ║
         ║     → "Sure! How would..." ║     → {score:75, errors:[...]} ║
         ║     → SSE推送字幕到前端     ║                             ║
         ║                            ║                             ║
         ║ 8a. 豆包TTS 流式合成        ║                             ║
         ║     → SSE推送音频到前端     ║ 7b. SSE推送JSON到前端        ║
         ║     → 前端播放+VRM张嘴      ║     → 前端渲染反馈面板       ║
         ╠════════════════════════════╩═════════════════════════════╣
         ║                    并发双流结束                            ║
         ╠═════════════════════════════════════════════════════════╝
         │
         ▼
9. Merge Node: 合并结果, 更新全局状态
         │
         ▼
10. Router Node: 自适应难度决策
    │  if streak_errors >= 3: difficulty → "easy", 切换Prompt
    │  if streak_errors <= -3: difficulty → "hard"
    │  else: 保持当前难度
         │
         ▼
11. 保存状态 → 等待下一轮对话
```

---

## 九、前端双通道接收

```javascript
// app.js 伪代码

// 通道1: WebSocket 接收对话流 (字幕+音频)
const ws = new WebSocket('ws://localhost:8000/ws/chat');
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'subtitle') {
        appendSubtitle(data.text);        // 实时字幕
    }
    if (data.type === 'audio') {
        playAudio(data.audio_base64);     // 播放音频 + VRM张嘴
    }
};

// 通道2: SSE 接收评估反馈
const sse = new EventSource('/api/feedback?session_id=xxx');
sse.onmessage = (event) => {
    const feedback = JSON.parse(event.data);
    // feedback = { overall_score, dimensions, corrected_sentence, ... }
    renderFeedbackPanel(feedback);        // 渲染雷达图+建议
    updateEmotionIndicator(feedback);     // 更新情绪指示器
};
```

---

## 十、技术栈总览

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端** | 原生 HTML + JS | 单页面，CDN 引入依赖 |
| **3D 虚拟形象** | Three.js + `@pixiv/three-vrm` | VRM 模型，BlendShape 口型同步 |
| **反馈可视化** | Chart.js | 雷达图展示多维度评分 |
| **后端框架** | FastAPI (Python 3.11+) | 异步高性能 |
| **Agent 编排** | LangGraph | 状态机图结构，条件路由 |
| **MCP 工具** | `mcp` Python SDK | 工具挂载协议 |
| **LLM/ASR/TTS** | 豆包大模型 (火山引擎 Ark) | 兼容 OpenAI SDK，一个 Key 全覆盖 |
| **流式通信** | WebSocket + SSE | 对话流走 WS，反馈走 SSE |
| **配置管理** | pydantic-settings | 环境变量，启动校验 |

### Python 依赖

```txt
# requirements.txt
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
langgraph>=0.2.0
langchain-core>=0.3.0
openai>=1.30.0          # 豆包兼容OpenAI SDK
mcp>=0.9.0
pydantic>=2.0
pydantic-settings>=2.0
python-dotenv>=1.0
aiofiles>=23.0
websockets>=12.0
```

---

## 十一、最小化可展示系统 (MVP) 交付清单

| # | 模块 | MVP 范围 | 亮点 |
|---|------|----------|------|
| 1 | **豆包ASR** | 语音→文本 | 火山引擎API调用 |
| 2 | **主干对话轨** | 流式LLM对话 + 场景角色扮演 | 豆包LLM流式输出 |
| 3 | **豆包TTS** | 文本→语音播放 | 多音色，流式合成 |
| 4 | **评估纠错轨** | 异步JSON纠错 + SSE推送 | 严厉考官，结构化输出 |
| 5 | **LangGraph状态机** | 连错检测 + 难度降级路由 | 自适应干预 |
| 6 | **MCP工具** | 词典查询 + 行业术语检索 | 动态术语注入 |
| 7 | **3D虚拟形象** | VRM模型 + 口型同步 | Three.js渲染 |
| 8 | **反馈面板** | 雷达图 + 语法建议展示 | JSON→可视化 |
| 9 | **场景切换** | 餐厅/旅行/面试 3个场景 | 下拉切换 |
| 10 | **前端页面** | 单页面整合所有功能 | CDN引入 |

### 可以砍掉的非核心项（赛后迭代）

- ❌ 用户注册登录系统
- ❌ 数据库持久化（状态存内存即可）
- ❌ Docker 部署
- ❌ 游戏化系统（成就/排行榜）
- ❌ 多语言支持（先做英语口语）
- ❌ RAG 向量检索（先用关键词匹配）

---

## 十二、开发步骤建议

```
Phase 1 - 基础链路 (Day 1-2)
├── [1] 豆包API调通 (ASR + LLM + TTS)
├── [2] FastAPI 搭建, POST /chat 跑通
└── [3] 前端录音 + 播放 + 字幕展示

Phase 2 - 双流拆分 (Day 3-4)
├── [4] 评估轨独立, 强制JSON输出
├── [5] SSE 推送评估结果到前端
└── [6] 前端双通道接收 (WS + SSE)

Phase 3 - 状态机 (Day 5-6)
├── [7] LangGraph 图搭建, 全局状态定义
├── [8] 自适应难度路由 (连错降级)
└── [9] 难度分级Prompt编写

Phase 4 - MCP工具 (Day 7-8)
├── [10] MCP Server 搭建
├── [11] 词典工具 + 行业术语工具
└── [12] LLM 工具调用调通

Phase 5 - 虚拟形象 + 整合 (Day 9-10)
├── [13] VRM 模型加载 + 口型同步
├── [14] 反馈面板雷达图
└── [15] 端到端联调 + 3个场景测试
```
