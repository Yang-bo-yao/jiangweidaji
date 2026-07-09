"""豆包大模型 API 客户端 — 兼容 OpenAI SDK"""

from openai import AsyncOpenAI

from backend.config import settings

# 全局共享的异步客户端实例
# 豆包 (火山引擎 Ark) 兼容 OpenAI API 格式，只需替换 base_url 和 api_key
client = AsyncOpenAI(
    api_key=settings.ark_api_key,
    base_url=settings.ark_base_url,
)
