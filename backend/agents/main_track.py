"""主干对话轨 (Main Track) — Lily 角色扮演 + 流式语音响应

职责：ASR → LLM(Lily对话) → TTS → 返回
不负责纠错，只管聊得开心，极速响应。
"""

from dataclasses import dataclass

from backend.llm import asr, chat, tts
from backend.prompts import get_scenario_prompt


@dataclass
class MainTrackResult:
    """主干对话轨的输出"""
    user_text: str        # ASR 转写结果
    reply_text: str       # Lily 的回复文本
    audio_bytes: bytes    # TTS 合成的音频


async def run(
    audio_bytes: bytes,
    scenario: str,
    history: list[dict],
    audio_filename: str = "audio.webm",
) -> MainTrackResult:
    """
    执行主干对话轨完整流程。

    Args:
        audio_bytes: 用户录音二进制
        scenario: 场景 key
        history: 对话历史
        audio_filename: 音频文件名

    Returns:
        MainTrackResult: 转写文本 + Lily回复 + 音频
    """
    # 1. ASR: 语音 → 文本
    user_text = await asr.transcribe(audio_bytes, filename=audio_filename)

    # 2. 加载场景 Prompt
    system_prompt = get_scenario_prompt(scenario)

    # 3. LLM: 生成 Lily 的回复 (非流式，Phase 2 先跑通，Phase 5 再换流式)
    reply_text = await chat.chat(system_prompt, history, user_text)

    # 4. TTS: 文本 → 音频
    audio_out = await tts.synthesize(reply_text)

    return MainTrackResult(
        user_text=user_text,
        reply_text=reply_text,
        audio_bytes=audio_out,
    )
