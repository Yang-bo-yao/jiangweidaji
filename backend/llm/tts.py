"""语音合成 (TTS) — 调用豆包 TTS，文本 → 音频 bytes"""

from backend.config import settings
from backend.llm.client import client


async def synthesize(text: str) -> bytes:
    """
    将文本合成为语音音频。

    Args:
        text: 要合成的文本 (Lily 的回复)

    Returns:
        MP3 格式的音频二进制数据
    """
    response = await client.audio.speech.create(
        model=settings.tts_model_id,
        voice=settings.tts_voice,
        input=text,
        response_format="mp3",
    )
    return response.content
