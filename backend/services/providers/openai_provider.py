import json
import os

from openai import AsyncOpenAI

from services.providers.base_provider import BaseAIProvider

_PARSE_SYSTEM = """당신은 자동차 부품사 발주서 전문 파서입니다.
주어진 발주서 텍스트에서 customer_code, part_number, quantity, unit, delivery_date, delivery_location을 추출하세요.

반환 형식 (JSON만 반환):
{
  "fields": {
    "필드명": {"value": "추출값", "confidence": 0.0~1.0, "raw_text": "원문 발췌"}
  },
  "parse_notes": "파싱 특이사항 또는 null"
}"""


class OpenAIProvider(BaseAIProvider):

    def __init__(self):
        self.client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model_heavy = os.getenv("OPENAI_MODEL_HEAVY", "gpt-4o")
        self.model_light = os.getenv("OPENAI_MODEL_LIGHT", "gpt-4o-mini")

    async def parse_document(self, text: str, template_hint: str = "") -> dict:
        system = _PARSE_SYSTEM
        if template_hint:
            system += f"\n\n발주서 양식 참고:\n{template_hint}"

        response = await self.client.chat.completions.create(
            model=self.model_heavy,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": f"다음 발주서를 파싱하세요:\n\n{text}"},
            ],
        )
        return json.loads(response.choices[0].message.content)

    async def classify_simple(self, text: str, instruction: str) -> str:
        response = await self.client.chat.completions.create(
            model=self.model_light,
            messages=[{"role": "user", "content": f"{instruction}\n\n입력: {text}"}],
        )
        return response.choices[0].message.content.strip()

    def get_provider_name(self) -> str:
        return "openai"
