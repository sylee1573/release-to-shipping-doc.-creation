import json
import os

import anthropic

from services.providers.base_provider import BaseAIProvider

_PARSE_SYSTEM = """당신은 자동차 부품사 발주서 전문 파서입니다.
주어진 발주서 텍스트에서 아래 필드를 추출하고 JSON으로 반환하세요.

필수 추출 필드:
- customer_code: 발주처 코드
- part_number: 품번
- quantity: 수량 (숫자)
- unit: 단위 (EA, SET 등)
- delivery_date: 납기일 (YYYY-MM-DD)
- delivery_location: 납품처

반환 형식 (반드시 이 JSON만 반환):
{
  "fields": {
    "필드명": {"value": "추출값", "confidence": 0.0~1.0, "raw_text": "원문 발췌"}
  },
  "parse_notes": "파싱 특이사항 (없으면 null)"
}

confidence 기준:
- 0.90 이상: 명확히 확인됨
- 0.70~0.89: 추정 가능하나 확인 권장
- 0.70 미만: 불확실, 수동 확인 필요"""


class AnthropicProvider(BaseAIProvider):

    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.model_heavy = os.getenv("ANTHROPIC_MODEL_HEAVY", "claude-sonnet-4-5")
        self.model_light = os.getenv("ANTHROPIC_MODEL_LIGHT", "claude-haiku-4-5-20251001")

    async def parse_document(self, text: str, template_hint: str = "") -> dict:
        system = _PARSE_SYSTEM
        if template_hint:
            system += f"\n\n발주서 양식 참고 정보:\n{template_hint}"

        message = await self.client.messages.create(
            model=self.model_heavy,
            max_tokens=2048,
            system=system,
            messages=[{"role": "user", "content": f"다음 발주서를 파싱하세요:\n\n{text}"}],
        )
        raw = message.content[0].text.strip()
        # JSON 블록이 감싸진 경우 제거
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)

    async def classify_simple(self, text: str, instruction: str) -> str:
        message = await self.client.messages.create(
            model=self.model_light,
            max_tokens=256,
            messages=[{"role": "user", "content": f"{instruction}\n\n입력: {text}"}],
        )
        return message.content[0].text.strip()

    def get_provider_name(self) -> str:
        return "anthropic"
