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
│  │ 录音按钮 │  │ 3D虚拟形象 │  │ 对话字幕 + 反馈    │   │
│  │ 🎤     │  │ (VRM)    │  │ "你说得不错！"     │   │
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

**核心思路**: 一个 API 端点搞定一切。前端录音 → 发音频给后端 → 后端串行处理 → 返回音频+字幕+反馈 → 前端播放+3D 虚拟形象驱动。

---

## 二、目录结构

```
jiangweidaji/
├── README.md
├── .env                        # API Keys（不提交）
├── .env.example                # API Keys 模板
│
├── frontend/                   # 前端
│   ├── index.html              # 单页面入口
│   ├── style.css               # 样式
│   ├── app.js                  # 主逻辑：录音 + 调API + 播放 + VRM控制
│   ├── avatar.js               # VRM 3D 虚拟形象模块
│   └── models/                 # VRM 模型文件（.vrm）
│       └── avatar.vrm          # 从 VRoid Hub 下载
│
├── backend/                    # 后端
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

---

## 三、VRM 3D 虚拟形象方案

### 3.1 技术栈

| 组件 | 选择 | 说明 |
|------|------|------|
| 3D 渲染 | Three.js | WebGL 3D 引擎 |
| VRM 加载 | `@pixiv/three-vrm` | 解析 .vrm 模型文件 |
| 口型同步 | BlendShape `A` / `I` / `U` / `E` / `O` | VRM 标准口型参数 |
| 模型来源 | [VRoid Hub](https://hub.vroid.com/) | 上千个免费角色模型 |

### 3.2 口型同步原理

VRM 模型自带 5 个标准 BlendShape 对应日语/通用元音：

```
音量大小 → 映射到 BlendShape 权重:
  'A'  (あ)  → 张嘴
  'I'  (い)  → 咧嘴
  'U'  (う)  → 嘟嘴
  'E'  (え)  → 微笑嘴型
  'O'  (お)  → 圆嘴
```

简单做法：播放 TTS 音频时，用 `AnalyserNode` 实时分析音量，按音量驱动 'A' BlendShape（张嘴幅度），足够自然。

### 3.3 模型获取步骤

```
1. 访问 https://hub.vroid.com/
2. 浏览免费角色，找到喜欢的
3. 下载 .vrm 文件
4. 放到 frontend/models/avatar.vrm
5. 代码中加载即可
```

推荐几个 VRoid Hub 上的高质量免费角色：
- **Alicia Solid** — 职场风格，适合商务场景
- **Mika** — 活泼风格，适合日常社交
- **Kozakura** — 知性风格，适合教学场景

### 3.4 前端核心代码结构（`avatar.js`）

```javascript
// 伪代码：VRM 3D 虚拟形象初始化 + 口型同步

import * as THREE from 'three';
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm';

// 1. 初始化场景
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 20);
const renderer = new THREE.WebGLRenderer({ alpha: true });

// 2. 加载 VRM 模型
const loader = new GLTFLoader();
loader.register(parser => new VRMLoaderPlugin(parser));
const gltf = await loader.loadAsync('models/avatar.vrm');
const vrm = gltf.userData.vrm;

// 3. 口型同步（播放 TTS 音频时调用）
function updateLipSync(audioVolume) {
    vrm.expressionManager.setValue('A', audioVolume * 1.5);
    // 或者轮换元音：'A' 'I' 'U' 'E' 'O' 让口型更丰富
}

// 4. 渲染循环
function animate() {
    requestAnimationFrame(animate);
    vrm.update(deltaTime);
    renderer.render(scene, camera);
}
```

### 3.5 对比 Live2D 的优势

| | Live2D (2D) | VRM (3D) |
|---|-------------|----------|
| 视觉冲击力 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 角色可旋转 | ❌ | ✅ 拖拽旋转 |
| 模型资源量 | 官方 3-5 个免费 | VRoid Hub 上千个 |
| 表情丰富度 | 预设表情 | BlendShape 任意组合 |
| 包体积 | ~2MB | ~5-10MB |
| 加载速度 | 快 | 稍慢（可接受） |

---

## 四、数据流（一次对话请求）

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
前端: 播放音频 → AnalyserNode 分析音量 → 驱动 VRM BlendShape 张嘴
      同时显示字幕 + 反馈面板
```

---

## 五、后端核心代码结构（`orchestrator.py` 伪代码）

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

## 六、前端页面布局

```
┌─────────────────────────────────────────────┐
│         多国语口语虚拟形象 Agent               │
│         [场景: 餐厅 ▼]                       │
├────────────────────┬────────────────────────┤
│                    │                        │
│                    │  对话记录:              │
│    🤖 3D 虚拟形象   │  🧑: 我想点一份牛排     │
│    (VRM)          │  🤖: 好的，您要几分熟？  │
│    - 可拖拽旋转    │  🧑: Medium, please.   │
│    - 说话时张嘴    │  🤖: Great choice! ... │
│    - 自然待机动作   │                        │
│                    │  反馈: ⭐发音 85分       │
│                    │  💡 "medium发音可以     │
│                    │     更清晰一些"         │
├────────────────────┴────────────────────────┤
│              🎤 按住说话                     │
└─────────────────────────────────────────────┘
```

---

## 七、技术栈（比赛版）

| 项目 | 选择 | 理由 |
|------|------|------|
| **前端** | 原生 HTML + JS | 不需要框架 |
| **3D 渲染** | Three.js | WebGL 标准方案 |
| **虚拟形象** | `@pixiv/three-vrm` + VRM 模型 | 3D 角色，BlendShape 口型同步 |
| **后端** | Python FastAPI | 异步支持好 |
| **ASR** | OpenAI Whisper API | 一个 Key 搞定 |
| **LLM** | OpenAI GPT-4o | 对话+纠错一次调用 |
| **TTS** | OpenAI TTS | 音质好，流式输出 |
| **部署** | 不需要 | 本地 localhost 演示 |

---

## 八、比赛 Phase 1 交付清单

| # | 功能 | 说明 |
|---|------|------|
| 1 | 语音输入 | 浏览器录音，按住说话松开发送 |
| 2 | AI 对话 | GPT-4o 角色扮演，支持 3 个场景 |
| 3 | 语音输出 | TTS 合成，浏览器自动播放 |
| 4 | 3D 虚拟形象 | VRM 模型，说话时 BlendShape 张嘴，可拖拽旋转 |
| 5 | 发音反馈 | LLM 顺便评价发音和语法 |
| 6 | 场景切换 | 下拉选择餐厅/旅行/面试 |

**6 个功能，全部可以在一个前端页面 + 一个后端文件中实现。**

---

## 九、前端依赖（CDN 引入，无需 npm）

```html
<!-- Three.js -->
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  }
}
</script>

<!-- @pixiv/three-vrm -->
<script src="https://unpkg.com/@pixiv/three-vrm@2.0.0/lib/three-vrm.min.js"></script>
```

不需要 `package.json`、不需要 `npm install`、不需要打包工具。一个 HTML 文件全搞定。
