import json
import os

import httpx

from services.providers.base_provider import BaseAIProvider

_PARSE_SYSTEM = """당신은 자동차 부품사 발주서 전문 파서입니다.
발주서 텍스트에서 customer_code, part_number, quantity, unit, delivery_date, delivery_location을 추출하고
반드시 아래 JSON 형식만 반환하세요:
{"fields": {"필드명": {"value": "추출값", "confidence": 0.0~1.0, "raw_text": "원문"}}, "parse_notes": null}"""


class OllamaProvider(BaseAIProvider):

    def __init__(self):
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.model_heavy = os.getenv("OLLAMA_MODEL_HEAVY", "llama3.1:70b")
        self.model_light = os.getenv("OLLAMA_MODEL_LIGHT", "llama3.1:8b")

    async def _chat(self, model: str, messages: list[dict]) -> str:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{self.base_url}/api/chat",
                json={"model": model, "messages": messages, "stream": False},
            )
            response.raise_for_status()
            return response.json()["message"]["content"]

    async def parse_document(self, text: str, template_hint: str = "") -> dict:
        system = _PARSE_SYSTEM
        if template_hint:
            system += f"\n양식 참고: {template_hint}"
        content = await self._chat(
            self.model_heavy,
            [
                {"role": "system", "content": system},
                {"role": "user", "content": f"발주서:\n{text}"},
            ],
        )
        raw = content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)

    async def classify_simple(self, text: str, instruction: str) -> str:
        return await self._chat(
            self.model_light,
            [{"role": "user", "content": f"{instruction}\n입력: {text}"}],
        )

    def get_provider_name(self) -> str:
        return "ollama"
