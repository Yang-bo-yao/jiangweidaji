"""语音识别 (ASR) — 调用豆包 ASR，音频 bytes → 文本"""

import io

from backend.config import settings
from backend.llm.client import client


async def transcribe(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """
    将用户录音转为文本。

    Args:
        audio_bytes: 音频二进制数据 (浏览器 MediaRecorder 产出的 webm/wav)
        filename: 文件名 (含扩展名，用于 MIME 推断)

    Returns:
        识别出的文本
    """
    # 豆包 ASR 兼容 OpenAI transcription 接口
    # 需要将 bytes 包装成文件对象
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = filename

    response = await client.audio.transcriptions.create(
        model=settings.asr_model_id,
        file=audio_file,
    )
    return response.text.strip()
