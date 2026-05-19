from pathlib import Path
from typing import Literal
from pydantic_settings import BaseSettings

# 실행 디렉토리에 관계없이 프로젝트 루트의 .env를 항상 탐색
_env_path = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    # AI 프로바이더 (.env 1줄로 전환)
    AI_PROVIDER: str = "anthropic"

    # Anthropic (기본값)
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL_HEAVY: str = "claude-sonnet-4-5"
    ANTHROPIC_MODEL_LIGHT: str = "claude-haiku-4-5-20251001"

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL_HEAVY: str = "gpt-4o"
    OPENAI_MODEL_LIGHT: str = "gpt-4o-mini"

    # Google Gemini
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL_HEAVY: str = "gemini-1.5-pro"
    GEMINI_MODEL_LIGHT: str = "gemini-1.5-flash"

    # Ollama (로컬, 설치형 고객사)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL_HEAVY: str = "llama3.1:70b"
    OLLAMA_MODEL_LIGHT: str = "llama3.1:8b"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:pass@localhost:5432/order_automation"

    # JWT
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440

    # Solapi (카카오 알림톡 + SMS)
    SOLAPI_API_KEY: str = ""
    SOLAPI_API_SECRET: str = ""
    SOLAPI_SENDER_PHONE: str = ""
    SOLAPI_KAKAO_PFID: str = ""

    # 파일 저장 경로
    UPLOAD_DIR: str = "/data/uploads"
    EXCEL_OUTPUT_DIR: str = "/data/outputs"

    # 앱 설정
    ENVIRONMENT: Literal["development", "production"] = "development"
    SENTRY_DSN: str = ""
    FRONTEND_URL: str = "http://localhost:5173"

    model_config = {"env_file": str(_env_path), "env_file_encoding": "utf-8"}


settings = Settings()
