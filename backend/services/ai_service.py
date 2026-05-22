from config import settings
from services.providers.base_provider import BaseAIProvider


def get_ai_provider() -> BaseAIProvider:
    """
    AI_PROVIDER 환경변수에 따라 프로바이더 자동 선택.
    전환 시 .env의 AI_PROVIDER 값만 수정하면 됨.
    """
    provider = settings.AI_PROVIDER.lower()

    if provider == "anthropic":
        from services.providers.anthropic_provider import AnthropicProvider
        return AnthropicProvider()
    elif provider == "openai":
        from services.providers.openai_provider import OpenAIProvider
        return OpenAIProvider()
    elif provider == "gemini":
        from services.providers.gemini_provider import GeminiProvider
        return GeminiProvider()
    elif provider == "ollama":
        from services.providers.ollama_provider import OllamaProvider
        return OllamaProvider()
    else:
        raise ValueError(f"지원하지 않는 AI_PROVIDER: {provider}")


# 전역 싱글턴 — 앱 시작 시 1회 초기화
ai_provider: BaseAIProvider = get_ai_provider()
