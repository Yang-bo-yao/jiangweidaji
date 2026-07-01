# 多国语口语虚拟形象 Agent — 项目主体架构

## 项目简介

本项目参加 **"改变教育 —— AI 学习体验重塑赛道"** 比赛，旨在构建一个基于 AI 多模态能力的多国语口语虚拟形象 Agent。用户通过语音与虚拟形象进行实时对话，系统提供发音纠正、语法反馈、文化提示等全方位语言学习体验。

---

## 一、系统总体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端层 (Frontend)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────┐ │
│  │ 对话界面  │ │ 虚拟形象  │ │ 反馈面板  │ │ 场景/设置/个人中心  │ │
│  │ Chat UI  │ │ Avatar   │ │Feedback  │ │  Settings/Profile  │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                        网关层 (Gateway)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  API Gateway │  │  WebSocket   │  │   Auth / 鉴权          │ │
│  │   (REST)     │  │   Gateway    │  │   (JWT Token)          │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                      核心业务层 (Core Services)                   │
│  ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌───────────────┐ │
│  │ 对话编排引擎│ │ 语音处理服务│ │ 评测反馈  │ │ 虚拟形象驱动  │ │
│  │ Dialogue   │ │  Speech    │ │ Evaluation│ │ Avatar       │ │
│  │ Orchestrator│ │  Pipeline  │ │ Engine    │ │ Engine       │ │
│  └────────────┘ └────────────┘ └──────────┘ └───────────────┘ │
│  ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌───────────────┐ │
│  │ 场景管理   │ │ 用户/进度   │ │ 游戏化    │ │ 内容管理      │ │
│  │ Scenario   │ │  User &    │ │ Gamification│ Content      │ │
│  │ Manager    │ │ Progress   │ │ Engine    │ │ Manager      │ │
│  └────────────┘ └────────────┘ └──────────┘ └───────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                        AI 能力层 (AI Layer)                      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ ASR  │ │ LLM  │ │ TTS  │ │ 发音评测  │ │ 情感识别         │ │
│  │引擎  │ │引擎  │ │引擎  │ │ 音素对齐  │ │ Emotion AI      │ │
│  └──────┘ └──────┘ └──────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐                                     │
│  │ 口型同步  │ │ 文化知识库│                                     │
│  │ LipSync  │ │ Culture  │                                     │
│  └──────────┘ └──────────┘                                     │
├─────────────────────────────────────────────────────────────────┤
│                       基础设施层 (Infra)                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌────────────┐ │
│  │ MySQL│ │Redis │ │  OSS │ │ MQ   │ │日志  │ │ 监控/告警  │ │
│  │      │ │      │ │      │ │      │ │      │ │            │ │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、项目目录结构

```
jiangweidaji/
├── README.md                          # 项目说明
├── project_architecture.md            # 本架构文档
├── docker-compose.yml                 # 容器编排
├── .env.example                       # 环境变量模板
├── .gitignore
│
├── frontend/                          # 前端应用 (React/Next.js)
│   ├── package.json
│   ├── src/
│   │   ├── app/                       # Next.js App Router
│   │   │   ├── layout.tsx             # 全局布局
│   │   │   ├── page.tsx               # 首页/登录
│   │   │   ├── chat/                  # 对话页
│   │   │   ├── scenarios/             # 场景选择页
│   │   │   └── profile/               # 个人中心
│   │   ├── components/
│   │   │   ├── chat/                  # 对话相关组件
│   │   │   │   ├── ChatContainer.tsx  # 对话容器
│   │   │   │   ├── MessageBubble.tsx  # 消息气泡
│   │   │   │   ├── VoiceInput.tsx     # 语音输入按钮
│   │   │   │   └── Subtitles.tsx      # 字幕展示
│   │   │   ├── avatar/               # 虚拟形象组件
│   │   │   │   ├── AvatarRenderer.tsx # 虚拟形象渲染
│   │   │   │   ├── AvatarCustomizer.tsx # 形象定制
│   │   │   │   └── AvatarEmotion.tsx  # 表情状态
│   │   │   ├── feedback/             # 反馈面板组件
│   │   │   │   ├── FeedbackPanel.tsx  # 主反馈面板
│   │   │   │   ├── PronunciationChart.tsx # 发音雷达图
│   │   │   │   ├── GrammarTips.tsx    # 语法提示
│   │   │   │   └── ProgressBar.tsx    # 进度条
│   │   │   ├── gamification/         # 游戏化组件
│   │   │   │   ├── Achievements.tsx   # 成就徽章
│   │   │   │   ├── DailyChallenge.tsx # 每日挑战
│   │   │   │   └── Leaderboard.tsx    # 排行榜
│   │   │   ├── scenario/             # 场景组件
│   │   │   │   ├── ScenarioCard.tsx   # 场景卡片
│   │   │   │   ├── ScenarioSelector.tsx # 场景选择器
│   │   │   │   └── ScenarioBrief.tsx  # 场景简介
│   │   │   └── common/               # 通用组件
│   │   │       ├── Header.tsx
│   │   │       ├── Sidebar.tsx
│   │   │       └── LoadingSpinner.tsx
│   │   ├── hooks/                    # 自定义 Hooks
│   │   │   ├── useWebSocket.ts       # WebSocket 连接
│   │   │   ├── useAudioRecorder.ts   # 录音控制
│   │   │   ├── useAvatarController.ts # 虚拟形象控制
│   │   │   └── useFeedback.ts        # 反馈数据处理
│   │   ├── services/                 # API 调用层
│   │   │   ├── api.ts                # HTTP 客户端
│   │   │   ├── authService.ts        # 认证服务
│   │   │   ├── chatService.ts        # 对话服务
│   │   │   ├── scenarioService.ts    # 场景服务
│   │   │   └── progressService.ts    # 进度服务
│   │   ├── store/                    # 状态管理 (Zustand)
│   │   │   ├── chatStore.ts          # 对话状态
│   │   │   ├── userStore.ts          # 用户状态
│   │   │   ├── avatarStore.ts        # 虚拟形象状态
│   │   │   └── scenarioStore.ts      # 场景状态
│   │   ├── types/                    # TypeScript 类型
│   │   │   ├── chat.ts
│   │   │   ├── scenario.ts
│   │   │   ├── feedback.ts
│   │   │   └── avatar.ts
│   │   └── utils/                    # 工具函数
│   │       ├── audio.ts              # 音频处理
│   │       └── format.ts             # 格式化
│   └── public/
│       ├── models/                   # 3D模型文件 (.vrm)
│       └── assets/                   # 静态资源
│
├── backend/                           # 后端服务 (Python/FastAPI)
│   ├── requirements.txt
│   ├── pyproject.toml
│   ├── alembic/                      # 数据库迁移
│   ├── app/
│   │   ├── main.py                   # 应用入口
│   │   ├── config.py                 # 配置管理
│   │   │
│   │   ├── api/                      # API 路由层
│   │   │   ├── __init__.py
│   │   │   ├── deps.py               # 依赖注入
│   │   │   ├── v1/
│   │   │   │   ├── router.py         # v1 路由汇总
│   │   │   │   ├── auth.py           # 认证接口
│   │   │   │   ├── chat.py           # 对话接口 (REST)
│   │   │   │   ├── scenario.py       # 场景接口
│   │   │   │   ├── user.py           # 用户接口
│   │   │   │   └── progress.py       # 学习进度接口
│   │   │   └── ws/
│   │   │       ├── chat_ws.py        # 对话 WebSocket
│   │   │       └── avatar_ws.py      # 虚拟形象状态同步
│   │   │
│   │   ├── core/                     # 核心业务逻辑
│   │   │   ├── __init__.py
│   │   │   ├── dialogue_orchestrator.py  # 对话编排引擎 ★
│   │   │   ├── scenario_manager.py       # 场景管理器
│   │   │   ├── session_manager.py        # 会话管理
│   │   │   └── context_manager.py        # 上下文管理(记忆)
│   │   │
│   │   ├── services/                 # 业务服务层
│   │   │   ├── __init__.py
│   │   │   ├── speech_pipeline.py    # 语音处理流水线 ★
│   │   │   ├── evaluation_engine.py  # 评测反馈引擎 ★
│   │   │   ├── avatar_controller.py  # 虚拟形象控制器
│   │   │   ├── gamification_service.py # 游戏化服务
│   │   │   ├── progress_service.py   # 学习进度服务
│   │   │   └── content_service.py    # 内容管理服务
│   │   │
│   │   ├── ai/                       # AI 能力封装
│   │   │   ├── __init__.py
│   │   │   ├── asr/                  # 语音识别
│   │   │   │   ├── base.py           # ASR 抽象接口
│   │   │   │   ├── whisper.py        # OpenAI Whisper
│   │   │   │   └── funasr.py         # FunASR
│   │   │   ├── llm/                  # 大语言模型
│   │   │   │   ├── base.py           # LLM 抽象接口
│   │   │   │   ├── openai.py         # GPT-4o
│   │   │   │   ├── claude.py         # Claude
│   │   │   │   └── prompts/          # Prompt 模板
│   │   │   │       ├── teacher.py    # 教师角色提示词
│   │   │   │       ├── evaluator.py  # 评测提示词
│   │   │   │       └── scenarios/    # 各场景系统提示词
│   │   │   ├── tts/                  # 语音合成
│   │   │   │   ├── base.py           # TTS 抽象接口
│   │   │   │   ├── elevenlabs.py     # ElevenLabs
│   │   │   │   └── cosyvoice.py      # CosyVoice
│   │   │   ├── pronunciation/        # 发音评测
│   │   │   │   ├── phoneme_aligner.py # 音素对齐
│   │   │   │   └── prosody_analyzer.py # 韵律分析
│   │   │   ├── emotion/              # 情感识别
│   │   │   │   ├── base.py
│   │   │   │   └── hume.py           # Hume AI
│   │   │   ├── lipsync/              # 口型同步
│   │   │   │   ├── base.py
│   │   │   │   └── rhubarb.py        # Rhubarb Lip Sync
│   │   │   └── culture/              # 文化知识库
│   │   │       ├── knowledge_base.py
│   │   │       └── data/             # 文化知识数据
│   │   │
│   │   ├── models/                   # 数据模型 (SQLAlchemy)
│   │   │   ├── __init__.py
│   │   │   ├── user.py               # 用户模型
│   │   │   ├── session.py            # 对话会话模型
│   │   │   ├── message.py            # 消息记录模型
│   │   │   ├── scenario.py           # 场景模型
│   │   │   ├── feedback.py           # 反馈记录模型
│   │   │   ├── progress.py           # 学习进度模型
│   │   │   └── achievement.py        # 成就模型
│   │   │
│   │   ├── schemas/                  # Pydantic Schema
│   │   │   ├── chat.py
│   │   │   ├── scenario.py
│   │   │   ├── feedback.py
│   │   │   └── user.py
│   │   │
│   │   └── utils/                    # 工具
│   │       ├── audio_utils.py        # 音频处理工具
│   │       └── text_utils.py         # 文本处理工具
│   │
│   └── tests/                        # 测试
│       ├── test_dialogue.py
│       ├── test_speech.py
│       └── test_evaluation.py
│
├── avatar-engine/                     # 虚拟形象引擎 (独立模块)
│   ├── package.json
│   ├── src/
│   │   ├── index.ts                  # 入口
│   │   ├── renderer/                 # 渲染器
│   │   │   ├── Live2DRenderer.ts     # Live2D 渲染
│   │   │   ├── VRMRenderer.ts        # VRM 渲染
│   │   │   └── ThreeRenderer.ts      # Three.js 渲染
│   │   ├── animation/                # 动画控制
│   │   │   ├── EmotionController.ts  # 表情控制
│   │   │   ├── LipSyncController.ts  # 口型同步
│   │   │   ├── GestureController.ts  # 手势/动作
│   │   │   └── IdleAnimation.ts      # 待机动画
│   │   ├── voice/                    # 语音驱动
│   │   │   └── VoiceDriver.ts        # 语音→口型/表情驱动
│   │   └── types/
│   │       └── index.ts
│   └── assets/                       # 模型资源
│
├── docs/                              # 文档
│   ├── api-spec.md                   # API 接口文档
│   ├── scenario-design.md            # 场景设计文档
│   ├── ai-prompt-design.md           # Prompt 工程设计
│   └── tech-stack.md                 # 技术栈说明
│
└── scripts/                           # 脚本工具
    ├── setup.sh                      # 环境初始化
    ├── seed_data.py                  # 种子数据
    └── deploy.sh                     # 部署脚本
```

---

## 三、核心模块说明

### 3.1 对话编排引擎 (Dialogue Orchestrator) ★

**定位**: 系统的"大脑"，协调整个对话流程。

**职责**:
- 接收用户语音输入，调度 ASR → LLM → TTS → 评测 → 口型同步 全链路
- 管理对话上下文（短期记忆 + 长期记忆）
- 根据场景模板生成符合角色设定的回复
- 控制对话分支走向

**数据流**:
```
User Voice → ASR → Text → LLM(Dialogue Generation + Error Correction)
                                    ↓
                          Response Text + Feedback
                          ↙                    ↘
                    TTS + LipSync          Evaluation Display
                         ↓
                  Avatar Animation
```

### 3.2 语音处理流水线 (Speech Pipeline)

**定位**: 处理语音输入输出的完整链路。

**职责**:
- 语音活动检测 (VAD)，判断用户是否说完
- 流式 ASR 转写
- 多语言 TTS 合成
- 音频格式转换与降噪

**关键设计**: 采用策略模式，支持切换不同的 ASR/TTS 提供商。

### 3.3 评测反馈引擎 (Evaluation Engine)

**定位**: 对用户口语进行多维度评测。

**评测维度**:
| 维度 | 权重 | 说明 |
|------|------|------|
| 发音准确度 | 30% | 音素级别对比 |
| 流利度 | 20% | 语速、停顿、重复 |
| 语法正确性 | 20% | 时态、句式结构 |
| 词汇丰富度 | 15% | 词汇量、搭配 |
| 语用得体性 | 15% | 是否符合场景文化习惯 |

**输出**: 各维度评分 + 具体改进建议 + 正确示范。

### 3.4 虚拟形象控制器 (Avatar Controller)

**定位**: 管理虚拟形象的外观、表情和动作。

**职责**:
- 根据 LLM 回复内容驱动情感表情（开心/鼓励/惊讶/思考）
- 根据 TTS 音频数据驱动口型同步
- 管理待机动画和互动动作（点头、击掌等）
- 支持用户自定义外观（发型、服装、肤色等）

### 3.5 场景管理器 (Scenario Manager)

**定位**: 管理五大类学习场景的内容和逻辑。

**场景分类**:
| 大类 | 示例子场景 |
|------|-----------|
| 日常社交 | 自我介绍、点餐、问路、打电话 |
| 职场商务 | 面试、会议发言、商务邮件口述、谈判 |
| 旅行出游 | 酒店入住、机场值机、购物、就医 |
| 学术校园 | 课堂讨论、学术报告、小组合作 |
| 文化沉浸 | 节日习俗、餐桌礼仪、俚语俗语 |

**每个场景包含**: 背景设定、角色信息、任务目标、文化贴士、对话分支树。

### 3.6 游戏化引擎 (Gamification Engine)

**定位**: 通过游戏化机制提升学习动力。

**核心机制**:
- **成就徽章**: 首次完成场景、连续打卡、发音满分等
- **经验值与等级**: 完成对话获得 XP，升级解锁新场景
- **每日挑战**: 每天推送特定任务
- **排行榜**: 好友/全球排行

---

## 四、技术栈选型

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端框架** | Next.js 14 + TypeScript | SSR/SSG 支持，App Router |
| **UI 组件** | Tailwind CSS + shadcn/ui | 原子化 CSS + 无头组件 |
| **状态管理** | Zustand | 轻量级状态管理 |
| **虚拟形象** | Three.js / Live2D SDK / @pixiv/three-vrm | 3D/2D 虚拟形象渲染 |
| **后端框架** | FastAPI (Python 3.11+) | 异步高性能 |
| **数据库** | PostgreSQL | 主存储 |
| **缓存** | Redis | 会话缓存、排行榜 |
| **消息队列** | RabbitMQ / Redis Stream | 异步任务（评测等） |
| **对象存储** | MinIO / S3 | 音频、模型文件 |
| **ASR** | OpenAI Whisper / FunASR | 语音识别 |
| **LLM** | GPT-4o / Claude 3.5 | 对话生成 |
| **TTS** | ElevenLabs / CosyVoice | 语音合成 |
| **发音评测** | 自研音素对齐 | 发音打分 |
| **情感识别** | Hume AI | 语音情感分析 |
| **容器化** | Docker + Docker Compose | 开发/部署 |

---

## 五、数据流全景图

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  用户语音  │────▶│  VAD 检测    │────▶│  ASR 转写     │
│  (Mic)    │     │  (静音截断)   │     │  (Whisper)   │
└──────────┘     └──────────────┘     └──────┬───────┘
                                              │
                                              ▼
                    ┌──────────────────────────────────────┐
                    │        Dialogue Orchestrator         │
                    │  ┌──────────────────────────────┐    │
                    │  │ 1. 加载场景上下文 + 历史记忆    │    │
                    │  │ 2. 调用 LLM 生成回复 + 纠错     │    │
                    │  │ 3. 调用评测引擎分析用户输入     │    │
                    │  │ 4. 调用情感识别分析用户情绪     │    │
                    │  │ 5. 组装响应包                  │    │
                    │  └──────────────────────────────┘    │
                    └──┬────────┬──────────┬──────────────┘
                       │        │          │
          ┌────────────┘        │          └────────────┐
          ▼                     ▼                       ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│  TTS 合成        │  │  评测反馈数据    │  │  虚拟形象表情/动作    │
│  + 口型同步数据   │  │  (评分+建议)    │  │  (Emotion + Gesture) │
└────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘
         │                    │                       │
         ▼                    ▼                       ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│  音频播放        │  │  反馈面板展示    │  │  虚拟形象渲染更新     │
│  (Speaker)      │  │  (UI Update)    │  │  (Avatar Render)    │
└─────────────────┘  └─────────────────┘  └─────────────────────┘
```

---

## 六、Phase 1 比赛阶段交付范围

根据比赛规划，Phase 1 聚焦以下核心模块：

| 优先级 | 模块 | 交付物 |
|--------|------|--------|
| P0 | 对话编排引擎 | 核心对话流程跑通 |
| P0 | LLM 集成 (GPT-4o) | 角色扮演对话生成 |
| P0 | ASR + TTS 集成 | 语音输入输出闭环 |
| P0 | 基础虚拟形象渲染 | 2D Live2D 模型展示 + 基础表情 |
| P1 | 2-3 个场景 Demo | 日常社交 + 旅行出游 + 职场商务各1个 |
| P1 | 发音反馈 MVP | 基础音素对比 + 评分展示 |
| P1 | Web 前端 | 对话界面 + 虚拟形象 + 反馈面板 |
| P2 | 用户系统 | 注册登录 + 会话记录 |

---

## 七、下一步开发计划

1. **搭建前端脚手架**: Next.js 项目初始化 + 基础布局
2. **搭建后端脚手架**: FastAPI 项目初始化 + 数据库模型
3. **实现对话编排引擎**: 串联 ASR → LLM → TTS 最小闭环
4. **集成虚拟形象**: 加载 Live2D 模型 + 基础表情控制
5. **构建场景模板**: 编写 2-3 个场景的系统 Prompt
6. **实现评测 MVP**: 基础发音对比逻辑
7. **联调测试**: 端到端跑通完整对话流程
