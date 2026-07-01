# 多国语口语虚拟形象 Agent

> **"改变教育 —— AI 学习体验重塑赛道"** 参赛项目

## 一句话介绍

按住说话，AI 虚拟角色陪你练口语——实时对话 + 发音纠正 + 场景扮演。

## 核心链路

```
🎤 录音 → Whisper 转文字 → GPT-4o 对话+纠错 → TTS 合成语音 → 🔈 播放
                                              ↘ 虚拟形象张嘴
```

## 技术栈（极简）

| 环节 | 方案 |
|------|------|
| 前端 | 原生 HTML + Three.js + VRM 3D 虚拟形象 |
| 后端 | Python FastAPI（一个文件） |
| ASR / LLM / TTS | OpenAI API（一个 Key 搞定全部） |

## 项目结构

```
frontend/    → 单页面：录音 + 3D VRM 虚拟形象 + 字幕
backend/     → main.py + orchestrator.py + prompts/
```

## 快速开始

```bash
# 1. 配置
cp .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY

# 2. 启动后端
cd backend && pip install -r requirements.txt && uvicorn main:app --reload

# 3. 打开前端
open frontend/index.html
```

## 文档

- [极简架构设计](./project_architecture.md)
- [比赛规划](./比赛规划.md)
