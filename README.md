# 多国语口语虚拟形象 Agent

> **"改变教育 —— AI 学习体验重塑赛道"** 参赛项目

## 一句话介绍

一个基于 AI 多模态能力的虚拟形象口语陪练，让用户通过语音与虚拟角色进行沉浸式场景对话，实时获得发音纠正和表达反馈。

## 核心特色

- 🎭 **虚拟形象互动** — Live2D/VRM 虚拟角色，情感表达 + 口型同步
- 🗣️ **多语言对话** — 支持中/英/日/韩等 7+ 语言
- 🎬 **场景化角色扮演** — 日常社交、职场商务、旅行出游等真实场景
- 📊 **多维度反馈** — 发音、流利度、语法、词汇、语用得体性
- 🎮 **游戏化激励** — 成就系统、等级经验、每日挑战

## 技术架构速览

```
Frontend (Next.js) ←→ API Gateway (FastAPI) ←→ Core Services ←→ AI Layer (GPT-4o/Whisper/ElevenLabs)
                           ↕
                   Avatar Engine (Three.js/Live2D)
```

## 项目结构

```
jiangweidaji/
├── frontend/        # React/Next.js 前端
├── backend/         # Python/FastAPI 后端
├── avatar-engine/   # 虚拟形象渲染引擎
├── docs/            # 设计文档
└── scripts/         # 部署脚本
```

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/Yang-bo-yao/jiangweidaji.git
cd jiangweidaji

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API Keys

# 3. 启动服务
docker-compose up -d
```

## 文档索引

- [项目主体架构](./project_architecture.md) — 完整架构设计、目录结构、模块说明
- 比赛规划 — 设计灵感与功能设计（见仓库 `比赛规划.md`）

## 比赛阶段目标 (Phase 1)

- [x] 架构设计
- [ ] 对话编排引擎 (ASR → LLM → TTS 闭环)
- [ ] 基础虚拟形象交互
- [ ] 2-3 个场景 Demo
- [ ] 发音反馈 MVP
