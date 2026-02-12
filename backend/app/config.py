from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# override=True 让 .env 文件覆盖已有的环境变量
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)


class Settings(BaseSettings):
    github_token: str = ""
    openai_api_key: str = ""
    openai_base_url: str = "https://api.deepseek.com/v1"
    openai_model: str = "deepseek-chat"


settings = Settings()
