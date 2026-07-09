# Lily — 双流多智能体口语陪练 Agent 架构设计

## 设计原则

> **核心目标：用最先进的 Agent 架构做最小化的可展示系统。**
> 双流并发 + LangGraph 状态机 + MCP 工具挂载 + 豆包多模态大模型。

---

## 一、核心设计思路总结

Lily 是一个双流多智能体口语陪练 Agent，核心创新点：

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
│  ┌────────┐  ┌───────────┐  ┌────────────────────┐                 │
│  │ 录音按钮 │  │ 对话字幕   │  │ 纠错反馈面板(JSON) │                 │
│  │ 🎤     │  │ 实时流式   │  │ 评分+语法+建议     │                 │
│  └────────┘  └───────────┘  └────────────────────┘                 │
│       ↑ WS流                    ↑ SSE流                              │
├───────┼─────────────────────────┼───────────────────────────────────┤
│       └─────────────────────────┘                                   │
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
│     │ · Lily角色扮演 │            │ · 严厉考官       │              │
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

**角色定位**：Lily，温暖的口语陪练伙伴，负责角色扮演和极速响应。

```
用户语音 → 豆包ASR → 转写文本 → 豆包LLM(Lily角色扮演) → 豆包TTS → 流式音频
                                    ↑
                           场景Prompt + 历史上下文
                           + MCP工具注入术语
```

**特点**：
- **流式响应**：LLM 边生成边输出，TTS 边合成边播放，用户几乎无感等待
- **角色扮演**：Lily 根据场景切换身份（服务员/HR/导游等），保持人设一致
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

### 4.4 Lily 难度分级 Prompt 示例

```python
PROMPTS = {
    "easy": """你是 Lily，一位友善的口语陪练伙伴。请使用简单词汇和短句，
              语速放慢，多用基础词汇。如果对方不理解，主动解释。
              当前场景: {scenario}""",

    "medium": """你是 Lily，一位自然的口语陪练伙伴。使用日常交流词汇，
                保持正常语速。当前场景: {scenario}""",

    "hard": """你是 Lily，一位专业的口语陪练伙伴。使用高级词汇和复杂句型，
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
→ Lily 回复: "Great! What would you say are your main strengths?
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
TTS_VOICE=zh_female_qingxin    # 音色: 清新女声 (Lily 的声音)
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
│   ├── app.js                      # 主逻辑: 录音 + WS/SSE接收 + 播放
│   └── feedback.js                 # 纠错反馈面板渲染 (JSON→雷达图)
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
│   │   ├── scenarios/              # 场景Prompt (Lily人设)
│   │   │   ├── restaurant.txt      # 餐厅场景 (easy/medium/hard)
│   │   │   ├── travel.txt          # 旅行场景
│   │   │   └── interview.txt       # 面试场景
│   │   ├── evaluator.txt           # 考官评估Prompt
│   │   └── difficulty.py           # 难度分级Prompt管理
│   │
│   ├── api/                        # API 路由
│   │   ├── __init__.py
│   │   ├── chat.py                 # POST /chat (上传音频)
│   │   ├── stream.py               # WS /ws/chat (流式返回对话+音频)
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
         ║ 5a. 加载Lily场景Prompt     ║ 5b. 加载考官Prompt           ║
         ║     (按难度级别选择)        ║     (强制JSON输出)           ║
         ║                            ║                             ║
         ║ 6a. MCP工具调用(可选)       ║                             ║
         ║     → 检索餐厅术语          ║                             ║
         ║     → "main course, etc"   ║                             ║
         ║                            ║                             ║
         ║ 7a. 豆包LLM 流式生成        ║ 6b. 豆包LLM 评估分析         ║
         ║     → "Sure! How would..." ║     → {score:75, errors:[...]} ║
         ║     → WS推送字幕到前端      ║                             ║
         ║                            ║                             ║
         ║ 8a. 豆包TTS 流式合成        ║                             ║
         ║     → WS推送音频到前端      ║ 7b. SSE推送JSON到前端        ║
         ║     → 前端播放语音          ║     → 前端渲染反馈面板       ║
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
        appendSubtitle(data.text, 'lily');   // Lily 的回复字幕
    }
    if (data.type === 'audio') {
        playAudio(data.audio_base64);         // 播放 Lily 的语音
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

## 十、前端页面布局

```
┌─────────────────────────────────────────────────────┐
│            Lily — 口语陪练 Agent                     │
│            [场景: 餐厅 ▼]                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  对话记录:                                           │
│  🧑: I want order a steak                          │
│  🌸 Lily: Sure! How would you like it cooked?      │
│  🧑: Medium, please.                               │
│  🌸 Lily: Great choice! Anything to drink?         │
│                                                     │
├────────────────────┬────────────────────────────────┤
│  评分总览           │  详细反馈                       │
│  ⭐ 78分           │  语法: 85 (时态注意)            │
│  [████████░░]      │  词汇: 70 (多用good,可换)      │
│                    │  流利: 80 (停顿偏多)            │
│  📊 雷达图          │  得体: 75 (可更正式)            │
│     Grammar        │                                │
│      /|\           │  💡 建议: "I would like to     │
│     / | \          │     order..." 更礼貌           │
│    /  |  \         │                                │
│  雷达图区域         │  ✨ "整体清晰，时态再注意！"    │
├────────────────────┴────────────────────────────────┤
│  难度: Medium  连错: 1  轮次: 5                      │
├─────────────────────────────────────────────────────┤
│              🎤 按住说话                             │
└─────────────────────────────────────────────────────┘
```

---

## 十一、技术栈总览

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端** | 原生 HTML + JS | 单页面，CDN 引入依赖 |
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

### 前端依赖（CDN 引入，无需 npm）

```html
<!-- Chart.js (雷达图) -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

---

## 十二、最小化可展示系统 (MVP) 交付清单

| # | 模块 | MVP 范围 | 亮点 |
|---|------|----------|------|
| 1 | **豆包ASR** | 语音→文本 | 火山引擎API调用 |
| 2 | **主干对话轨** | 流式LLM对话 + Lily角色扮演 | 豆包LLM流式输出 |
| 3 | **豆包TTS** | 文本→语音播放 | 多音色，流式合成 |
| 4 | **评估纠错轨** | 异步JSON纠错 + SSE推送 | 严厉考官，结构化输出 |
| 5 | **LangGraph状态机** | 连错检测 + 难度降级路由 | 自适应干预 |
| 6 | **MCP工具** | 词典查询 + 行业术语检索 | 动态术语注入 |
| 7 | **反馈面板** | 雷达图 + 语法建议展示 | JSON→可视化 |
| 8 | **场景切换** | 餐厅/旅行/面试 3个场景 | 下拉切换 |
| 9 | **前端页面** | 单页面整合所有功能 | CDN引入 |

### 可以砍掉的非核心项（赛后迭代）

- ❌ 3D 虚拟形象（已砍掉，纯语音+文字交互）
- ❌ 用户注册登录系统
- ❌ 数据库持久化（状态存内存即可）
- ❌ Docker 部署
- ❌ 游戏化系统（成就/排行榜）
- ❌ 多语言支持（先做英语口语）
- ❌ RAG 向量检索（先用关键词匹配）

---

## 十三、开发步骤

### 总览

```
Phase 1: 基础链路打通          Phase 2: 双流拆分              Phase 3: 状态机
┌─────────────────┐          ┌─────────────────┐           ┌─────────────────┐
│ 豆包API调通      │    →     │ 评估轨独立       │    →      │ LangGraph图搭建  │
│ FastAPI骨架      │          │ SSE推送反馈      │           │ 自适应难度路由   │
│ 前端录音+播放     │          │ 前端双通道接收   │           │ 难度分级Prompt   │
└─────────────────┘          └─────────────────┘           └─────────────────┘
       (Day 1-2)                   (Day 3-4)                    (Day 5-6)

Phase 4: MCP工具               Phase 5: 整合打磨
┌─────────────────┐          ┌─────────────────┐
│ MCP Server搭建   │    →     │ 反馈面板雷达图   │
│ 词典+术语工具    │          │ 3个场景测试      │
│ LLM工具调用调通  │          │ 端到端联调       │
└─────────────────┘          └─────────────────┘
       (Day 7-8)                   (Day 9-10)
```

### Phase 1 — 基础链路打通 (Day 1-2)

**目标**：跑通「录音 → 豆包ASR → 豆包LLM → 豆包TTS → 播放」单链路

| 步骤 | 任务 | 产出 |
|------|------|------|
| 1.1 | 注册火山引擎，创建 ASR/LLM/TTS 推理接入点，获取 API Key 和模型 ID | `.env` 配置可用 |
| 1.2 | 后端 `config.py`：Pydantic Settings 读取环境变量，启动校验 | `config.py` |
| 1.3 | 后端 `llm/client.py`：封装豆包 API 客户端（兼容 OpenAI SDK） | `client.py` |
| 1.4 | 后端 `llm/asr.py`：调用豆包 ASR，音频 bytes → 文本 | `asr.py` |
| 1.5 | 后端 `llm/chat.py`：调用豆包 LLM，文本 → 流式回复 | `chat.py` |
| 1.6 | 后端 `llm/tts.py`：调用豆包 TTS，文本 → 音频 bytes | `tts.py` |
| 1.7 | 后端 `main.py`：FastAPI 入口 + `POST /chat` 端点，串行调通 ASR→LLM→TTS | `main.py` |
| 1.8 | 前端 `index.html` + `app.js`：浏览器录音（MediaRecorder），base64 发送，接收后播放 | 前端页面 |
| 1.9 | 前端：显示 Lily 的回复文字 | 字幕展示 |

**验收标准**：对着麦克风说英语 → 后端转写 → Lily 回复文字 → TTS 语音播放

---

### Phase 2 — 双流拆分 (Day 3-4)

**目标**：主干对话轨和评估纠错轨并发执行，前端双通道接收

| 步骤 | 任务 | 产出 |
|------|------|------|
| 2.1 | 后端 `prompts/evaluator.txt`：编写考官评估 System Prompt，要求 JSON 输出 | `evaluator.txt` |
| 2.2 | 后端 `llm/evaluate.py`：调用豆包 LLM，`response_format: json_object`，输出结构化评估 | `evaluate.py` |
| 2.3 | 后端 `agents/main_track.py`：封装主干对话轨（ASR→LLM流式→TTS） | `main_track.py` |
| 2.4 | 后端 `agents/eval_track.py`：封装评估纠错轨（ASR结果→LLM考官→JSON） | `eval_track.py` |
| 2.5 | 后端 `api/stream.py`：WebSocket `/ws/chat`，流式推送字幕和音频 | `stream.py` |
| 2.6 | 后端 `api/feedback.py`：SSE `/api/feedback`，推送评估 JSON | `feedback.py` |
| 2.7 | 后端 `main.py`：`POST /chat` 改为 `asyncio.gather` 并发执行双轨 | `main.py` 更新 |
| 2.8 | 前端 `app.js`：WebSocket 接收对话流（字幕+音频），SSE 接收评估 JSON | 双通道接收 |
| 2.9 | 前端 `feedback.js`：渲染评估 JSON（先文字展示，雷达图后续做） | `feedback.js` |

**验收标准**：说话后 Lily 语音秒回，1-2 秒后反馈面板出现纠错 JSON

---

### Phase 3 — LangGraph 状态机 (Day 5-6)

**目标**：用 LangGraph 编排双流，实现自适应难度干预

| 步骤 | 任务 | 产出 |
|------|------|------|
| 3.1 | 后端 `graph/state.py`：定义 `AgentState`（scenario/emotion/streak_errors/difficulty_level...） | `state.py` |
| 3.2 | 后端 `graph/nodes.py`：实现各节点函数（asr_node / main_node / eval_node / merge_node / router_node） | `nodes.py` |
| 3.3 | 后端 `graph/edges.py`：实现条件路由 `difficulty_router`（连错≥3 降级，连对≥3 升级） | `edges.py` |
| 3.4 | 后端 `graph/builder.py`：组装 `StateGraph`，定义节点和边，编译为可执行图 | `builder.py` |
| 3.5 | 后端 `prompts/scenarios/`：为 3 个场景各写 easy/medium/hard 三档 Lily Prompt | 9 个 Prompt 文件 |
| 3.6 | 后端 `prompts/difficulty.py`：Prompt 管理器，根据 difficulty_level + scenario 加载对应 Prompt | `difficulty.py` |
| 3.7 | 后端 `main.py`：`POST /chat` 改为调用 LangGraph 编译后的图 | `main.py` 更新 |
| 3.8 | 后端：会话状态管理（session_id → AgentState，存内存字典） | 内存状态管理 |
| 3.9 | 前端：显示当前难度级别和连错次数 | 状态指示器 |

**验收标准**：连续说错 3 次 → Lily 自动切换简单词汇；连续答对 3 次 → Lily 升级用词难度

---

### Phase 4 — MCP 工具挂载 (Day 7-8)

**目标**：Lily 能调用 MCP 工具动态查词和检索术语

| 步骤 | 任务 | 产出 |
|------|------|------|
| 4.1 | 后端 `mcp/server.py`：搭建 MCP Server | `server.py` |
| 4.2 | 后端 `mcp/tools/dictionary.py`：词典查询工具（查词/音标/例句） | `dictionary.py` |
| 4.3 | 后端 `mcp/tools/industry_terms.py`：行业术语检索（3 个场景术语库） | `industry_terms.py` |
| 4.4 | 后端 `data/industry_terms.json`：编写餐厅/旅行/面试 3 个场景术语数据 | `industry_terms.json` |
| 4.5 | 后端 `mcp/tools/rag_knowledge.py`：本地文化知识检索（关键词匹配，加载 markdown） | `rag_knowledge.py` |
| 4.6 | 后端 `data/culture_knowledge/`：编写 3 个场景文化知识 markdown | 3 个 `.md` 文件 |
| 4.7 | 后端 `agents/main_track.py`：LLM 调用时绑定 MCP 工具，支持 tool_call | `main_track.py` 更新 |
| 4.8 | 后端：LLM 工具调用循环（LLM 输出 tool_call → 执行工具 → 结果回传 LLM → 最终回复） | 工具调用逻辑 |

**验收标准**：用户说"面试中怎么说优点" → Lily 调用术语工具 → 回复中包含 strengths/leadership 等专业词汇

---

### Phase 5 — 整合打磨 (Day 9-10)

**目标**：前端反馈面板完善 + 3 个场景端到端测试

| 步骤 | 任务 | 产出 |
|------|------|------|
| 5.1 | 前端 `feedback.js`：用 Chart.js 渲染雷达图（语法/词汇/流利/得体 4 维） | 雷达图 |
| 5.2 | 前端：反馈面板展示具体错误和修改建议 | 反馈面板 |
| 5.3 | 前端：Lily 回复和用户输入的对话气泡样式 | 对话 UI |
| 5.4 | 前端：录音按钮交互优化（按住说话/松开发送/录音波形动画） | 录音交互 |
| 5.5 | 前端：场景下拉切换 + 难度/连错/轮次状态栏 | 状态栏 |
| 5.6 | 测试场景1：餐厅点餐（完整流程跑通） | 餐厅 Demo |
| 5.7 | 测试场景2：旅行问路（完整流程跑通） | 旅行 Demo |
| 5.8 | 测试场景3：面试求职（完整流程跑通） | 面试 Demo |
| 5.9 | 端到端联调：录音→双流→反馈→难度自适应→工具调用 全链路 | 联调通过 |
| 5.10 | 演示准备：准备 3 个场景的演示话术脚本 | 演示脚本 |

**验收标准**：3 个场景全部跑通，双流并发正常，自适应难度生效，MCP 工具可用，前端反馈面板完整

---

## 十四、关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 前端框架 | 原生 HTML + JS | 比赛不需要 React，单页面够用 |
| 虚拟形象 | 不做 | 纯语音+文字交互更聚焦核心 Agent 能力 |
| Agent 编排 | LangGraph | 图结构支持复杂路由，状态管理清晰 |
| 双流通信 | WS + SSE | 对话流需双向用 WS，反馈单向推送用 SSE |
| LLM 提供商 | 豆包（火山引擎 Ark） | 兼容 OpenAI SDK，一个 Key 覆盖 ASR+LLM+TTS |
| 评估输出 | JSON (response_format) | 结构化数据前端直接渲染 |
| MCP 实现 | mcp Python SDK | 标准协议，可扩展 |
| 状态持久化 | 内存字典 | 比赛 Demo 不需要数据库 |
| 难度路由 | 连错≥3 降级 / 连对≥3 升级 | 简单有效的自适应策略 |
