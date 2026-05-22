import json

import google.generativeai as genai

from config import settings
from services.providers.base_provider import BaseAIProvider

_PARSE_PROMPT_TEMPLATE = """당신은 자동차 부품사 발주서 전문 파서입니다.
다음 발주서 텍스트에서 customer_code, part_number, quantity, unit, delivery_date, delivery_location을 추출하세요.

반환 형식 (JSON만 반환):
{{
  "fields": {{
    "필드명": {{"value": "추출값", "confidence": 0.0~1.0, "raw_text": "원문 발췌"}}
  }},
  "parse_notes": "파싱 특이사항 또는 null"
}}

{template_hint}

발주서:
{text}"""


class GeminiProvider(BaseAIProvider):

    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model_heavy = genai.GenerativeModel(settings.GEMINI_MODEL_HEAVY)
        self.model_light = genai.GenerativeModel(settings.GEMINI_MODEL_LIGHT)

    async def parse_document(self, text: str, template_hint: str = "") -> dict:
        hint_section = f"양식 참고:\n{template_hint}" if template_hint else ""
        prompt = _PARSE_PROMPT_TEMPLATE.format(text=text, template_hint=hint_section)
        response = await self.model_heavy.generate_content_async(prompt)
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)

    async def classify_simple(self, text: str, instruction: str) -> str:
        response = await self.model_light.generate_content_async(f"{instruction}\n\n입력: {text}")
        return response.text.strip()

    def get_provider_name(self) -> str:
        return "gemini"
