import json
import logging

import anthropic

from config import settings
from services.providers.base_provider import BaseAIProvider

logger = logging.getLogger(__name__)

# Few-shot 예시를 포함한 시스템 프롬프트
_PARSE_SYSTEM = """당신은 자동차 부품사 발주서 전문 파서입니다. 발주서 텍스트에서 필드를 추출해 JSON으로 반환합니다.

필수 추출 필드:
- customer_code: 발주처 코드 또는 회사명 (이 문서를 발행한 외국 바이어; 우리 한국 공급사 이름이 아님)
- part_number: 품번 (Material / P.N. / Item No.)
- description: 품목 설명 (예: BRACKET-SEC'D AIR INJN)
- quantity: 가장 가까운 미래 납기의 Volume (숫자만; Progress/CUM 제외)
- unit: 단위 (항상 "EA"로 통일)
- delivery_date: 가장 가까운 납기일 (YYYY-MM-DD; DD.MM.YYYY → 변환 필수)
- delivery_location: 납품처 전체 주소 (물건을 받을 장소; 회사명 + 주소)
- po_number: 발주번호 (Scheduling Agreement / S/A No. / P.O. Number)
- ship_to_name: 물건을 주문하고 받는 외국 바이어 회사명 (문서를 발행한 회사; 우리 한국 공급사 이름이 절대 아님. 문서 상단 또는 Ship To 란에 표기됨)
- unit_price: 단가 (USD; 문서에 없으면 null)

delivery_schedule (최상위 필드, fields 밖에 위치):
SA의 전체 납품 일정을 배열로 추출. 미래 날짜 기준 최대 8건.
형식: [{"date": "YYYY-MM-DD", "quantity": 숫자}, ...]
날짜는 반드시 YYYY-MM-DD 형식으로 변환. Progress/CUM 수량은 제외.

---
[예시 입력 — BorgWarner SA Release]
BORGWARNER TURBO AND EMISSIONS SYSTEMS DE MEXICO SA DE CV
Scheduling agreement number: 417001130
Material: E1490001119     Description: BRACKET-SEC'D AIR INJN
Call Number: 0000000380
Delivery schedule:
  Due date: 27.05.2026   Volume: 500    Progress: 14400
  Due date: 10.06.2026   Volume: 500    Progress: 14900

[예시 출력]
{"fields":{"customer_code":{"value":"BORGWARNER TURBO AND EMISSIONS SYSTEMS","confidence":0.95,"raw_text":"BORGWARNER TURBO AND EMISSIONS SYSTEMS DE MEXICO SA DE CV"},"part_number":{"value":"E1490001119","confidence":0.99,"raw_text":"Material: E1490001119"},"description":{"value":"BRACKET-SEC'D AIR INJN","confidence":0.99,"raw_text":"Description: BRACKET-SEC'D AIR INJN"},"quantity":{"value":500,"confidence":0.97,"raw_text":"Volume: 500"},"unit":{"value":"EA","confidence":0.99,"raw_text":"EA"},"delivery_date":{"value":"2026-05-27","confidence":0.95,"raw_text":"Due date: 27.05.2026"},"delivery_location":{"value":"BORGWARNER TURBO AND EMISSIONS SYSTEMS DE MEXICO SA DE CV","confidence":0.80,"raw_text":"BORGWARNER TURBO AND EMISSIONS SYSTEMS DE MEXICO SA DE CV"},"po_number":{"value":"417001130","confidence":0.99,"raw_text":"Scheduling agreement number: 417001130"},"ship_to_name":{"value":"BORGWARNER TURBO AND EMISSIONS SYSTEMS DE MEXICO SA DE CV","confidence":0.95,"raw_text":"BORGWARNER TURBO AND EMISSIONS SYSTEMS DE MEXICO SA DE CV"},"unit_price":{"value":null,"confidence":0.0,"raw_text":""}},"delivery_schedule":[{"date":"2026-05-27","quantity":500},{"date":"2026-06-03","quantity":500},{"date":"2026-06-10","quantity":500},{"date":"2026-06-17","quantity":300}],"parse_notes":"납기 4건 전체 추출. Progress는 누계이므로 제외."}
---

confidence 기준:
- 0.90 이상: 명확히 확인됨
- 0.70~0.89: 추정 가능하나 확인 권장
- 0.70 미만: 불확실, 수동 확인 필요

반환 형식: 위 예시 출력과 동일한 JSON만 반환. 코드블록·설명 없이 JSON 텍스트만."""


def _parse_json_response(raw: str) -> dict:
    """완성된 JSON 문자열 파싱. 마크다운 펜스 있으면 제거 후 재시도."""
    raw = raw.strip()

    if raw.startswith("{"):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass

    if "```" in raw:
        for part in raw.split("```"):
            candidate = part.lstrip("json").strip()
            if candidate.startswith("{"):
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    continue

    logger.error("AI JSON 파싱 실패. 원문(첫 600자): %s", raw[:600])
    raise ValueError("AI 응답을 JSON으로 파싱할 수 없습니다. 로그를 확인하세요.")


class AnthropicProvider(BaseAIProvider):

    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.model_heavy = settings.ANTHROPIC_MODEL_HEAVY
        self.model_light = settings.ANTHROPIC_MODEL_LIGHT

    async def parse_document(self, text: str, template_hint: str = "") -> dict:
        system = _PARSE_SYSTEM
        if template_hint:
            system += f"\n\n발주서 양식 참고:\n{template_hint}"

        # assistant prefill로 JSON 출력 강제
        message = await self.client.messages.create(
            model=self.model_heavy,
            max_tokens=2048,
            system=system,
            messages=[
                {"role": "user", "content": f"다음 발주서를 파싱하세요:\n\n{text}"},
                {"role": "assistant", "content": '{"fields": {'},
            ],
        )
        raw = message.content[0].text.strip()
        # assistant prefill '{"fields": {' 이후를 Claude가 완성 → prepend해서 완전한 JSON 복원
        return _parse_json_response('{"fields": {' + raw)

    async def classify_simple(self, text: str, instruction: str) -> str:
        message = await self.client.messages.create(
            model=self.model_light,
            max_tokens=256,
            messages=[{"role": "user", "content": f"{instruction}\n\n입력: {text}"}],
        )
        return message.content[0].text.strip()

    def get_provider_name(self) -> str:
        return "anthropic"
