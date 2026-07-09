"""配置管理 — 从环境变量读取，启动时校验，fail fast"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """全局配置，从 .env 文件读取"""

    # 火山引擎方舟平台
    ark_api_key: str = "PLACEHOLDER_FILL_LATER"
    ark_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"

    # 豆包模型 ID
    asr_model_id: str = "PLACEHOLDER_FILL_LATER"
    llm_model_id: str = "PLACEHOLDER_FILL_LATER"
    tts_model_id: str = "PLACEHOLDER_FILL_LATER"

    # TTS 音色 (Lily 的声音)
    tts_voice: str = "zh_female_qingxin"

    # 服务配置
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    # 前端 URL (CORS)
    frontend_url: str = "http://localhost:5173"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
