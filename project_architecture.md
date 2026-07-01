# 多国语口语虚拟形象 Agent — 极简架构（比赛版）

## 设计原则

> **比赛 Phase 1 只需要一个能跑的 Demo，不是生产系统。**
> 砍掉数据库、消息队列、微服务、用户系统——用最简单的方式把核心体验串起来。

---

## 一、架构总览

```
┌──────────────────────────────────────────────────────┐
│                   前端 (单页面)                        │
│  ┌────────┐  ┌──────────┐  ┌────────────────────┐   │
│  │ 录音按钮 │  │ 虚拟形象   │  │ 对话字幕 + 反馈    │   │
│  │ 🎤     │  │ (Live2D) │  │ "你说得不错！"     │   │
│  └────────┘  └──────────┘  └────────────────────┘   │
├──────────────────────────────────────────────────────┤
│              后端 (一个 FastAPI 进程)                   │
│                                                      │
│   POST /chat  ← 一次请求搞定全部:                      │
│   ┌─────────────────────────────────────────────┐    │
│   │  音频 → ASR(Whisper) → LLM(GPT-4o) → TTS    │    │
│   │                              ↘ 评测文本      │    │
│   └─────────────────────────────────────────────┘    │
│                                                      │
│   场景和 Prompt 直接写在代码/配置文件里                    │
│   对话历史存在前端内存中（每次请求带上）                    │
└──────────────────────────────────────────────────────┘
```

**核心思路**: 一个 API 端点搞定一切。前端录音 → 发音频给后端 → 后端串行处理 → 返回音频+字幕+反馈 → 前端播放+展示。

---

## 二、目录结构

```
jiangweidaji/
├── README.md
├── .env                        # API Keys（不提交）
├── .env.example                # API Keys 模板
│
├── frontend/                   # 前端 — 一个简单的 HTML/JS 页面就够了
│   ├── index.html              # 单页面应用入口
│   ├── style.css               # 样式
│   ├── app.js                  # 主逻辑：录音 + 调API + 播放 + Live2D
│   └── live2d/                 # Live2D 模型文件（从官网下载免费模型）
│       └── model/              # .model3.json + 贴图
│
├── backend/                    # 后端 — 一个 main.py 搞定
│   ├── main.py                 # FastAPI 入口 + /chat 端点
│   ├── config.py               # 读 .env 配置
│   ├── orchestrator.py         # 核心流程: ASR → LLM → TTS
│   ├── prompts/                # 场景 Prompt 模板（.txt 文件）
│   │   ├── restaurant.txt      # 餐厅点餐场景
│   │   ├── travel.txt          # 旅行问路场景
│   │   └── interview.txt       # 面试场景
│   └── requirements.txt        # fastapi uvicorn openai python-dotenv
│
└── docs/
    └── scenario-design.md      # 场景设计思路
```

**就这么多文件。不需要数据库、不需要 ORM、不需要 Docker、不需要 Nginx。**

---

## 三、数据流（一次对话请求）

```
用户按住录音 → 松开发送
     │
     ▼
POST /chat  { audio: base64, scenario: "restaurant", history: [...] }
     │
     ├── 1. ASR:  audio → Whisper API → 转写文本
     │
     ├── 2. LLM:  文本 + 场景Prompt + 历史 → GPT-4o → 回复 + 纠错
     │
     ├── 3. TTS:  LLM回复文本 → OpenAI TTS → 音频
     │
     └── 4. 返回: { audio: base64, text: "...", correction: "...", score: 85 }
     │
     ▼
前端: 播放音频 + 显示字幕 + 显示反馈 + 虚拟形象张嘴
```

---

## 四、后端核心代码结构（`orchestrator.py` 伪代码）

```python
class ChatOrchestrator:
    def __init__(self):
        self.client = OpenAI()  # 同时处理 ASR, LLM, TTS

    async def process(self, audio_bytes, scenario, history):
        # 1. 语音转文字
        text = await self.client.audio.transcriptions.create(
            model="whisper-1", file=audio_bytes
        )

        # 2. 加载场景 Prompt
        system_prompt = load_prompt(f"prompts/{scenario}.txt")

        # 3. LLM 对话 + 纠错
        response = await self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                *history,
                {"role": "user", "content": text}
            ]
        )

        # 4. TTS 合成
        audio = await self.client.audio.speech.create(
            model="tts-1", voice="alloy",
            input=response.reply_text
        )

        return ChatResult(
            audio=base64(audio),
            reply=response.reply_text,
            correction=response.correction,
            score=response.score,
        )
```

**一个 OpenAI API Key 就能同时覆盖 ASR、LLM、TTS，极简到极致。**

---

## 五、前端页面布局

```
┌─────────────────────────────────────────────┐
│           多国语口语虚拟形象 Agent             │
├──────────────────┬──────────────────────────┤
│                  │                          │
│                  │   对话记录:               │
│   虚拟形象        │   🧑: 我想点一份牛排       │
│   (Live2D)      │   🤖: 好的，您要几分熟？   │
│                  │   🧑: Medium, please.    │
│                  │   🤖: Great choice! ...  │
│                  │                          │
│                  │   反馈: ⭐发音 85分         │
├──────────────────┴──────────────────────────┤
│   [场景: 餐厅 ▼]    🎤 按住说话              │
└─────────────────────────────────────────────┘
```

---

## 六、技术栈（比赛版）

| 项目 | 选择 | 理由 |
|------|------|------|
| **前端** | 原生 HTML + JS + Live2D SDK | 不需要 React 框架，一个 HTML 就能跑 |
| **后端** | Python FastAPI | 异步支持好，写 API 快 |
| **ASR** | OpenAI Whisper API | 一个 Key 搞定，不用自己部署 |
| **LLM** | OpenAI GPT-4o | 同上，对话+纠错一次调用完成 |
| **TTS** | OpenAI TTS | 同上，音质好 |
| **虚拟形象** | Live2D Cubism SDK for Web | 免费模型多，口型同步简单 |
| **部署** | 不需要 | 本地 localhost 演示就行 |

---

## 七、比赛 Phase 1 交付清单

| # | 功能 | 说明 |
|---|------|------|
| 1 | 语音输入 | 浏览器录音，按住说话松开发送 |
| 2 | AI 对话 | GPT-4o 角色扮演，支持 3 个场景 |
| 3 | 语音输出 | TTS 合成，浏览器自动播放 |
| 4 | 虚拟形象 | Live2D 模型展示，说话时张嘴 |
| 5 | 发音反馈 | LLM 顺便评价发音和语法 |
| 6 | 场景切换 | 下拉选择餐厅/旅行/面试 |

**6 个功能，全部可以在一个前端页面 + 一个后端文件中实现。**

---

## 八、与之前重架构的对比

| | 重架构版 | 极简版 |
|---|---------|--------|
| 文件数 | 100+ | ~15 |
| 需要数据库 | PostgreSQL + Redis | 不需要 |
| 需要 Docker | 是 | 不需要 |
| 需要消息队列 | RabbitMQ | 不需要 |
| 用户系统 | JWT + 注册登录 | 不需要 |
| 前后端框架 | Next.js + FastAPI | 原生 HTML + FastAPI |
| 能跑起来的时间 | 1-2 周 | 1-2 天 |
