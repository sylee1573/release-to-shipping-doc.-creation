"""파싱 엔진 테스트 — 실제 발주서 샘플 85% 이상 정확도 목표."""
import pytest


SAMPLE_ORDER_TEXT = """
발주서
발주처: HMC-001 (현대자동차)
품번: 85310-AA000
품명: 와이퍼 블레이드
수량: 500 EA
납기일: 2026-06-30
납품처: 울산 1공장
"""


@pytest.mark.asyncio
async def test_parse_document_returns_required_fields():
    from services.ai_service import ai_provider

    result = await ai_provider.parse_document(SAMPLE_ORDER_TEXT)

    assert "fields" in result
    fields = result["fields"]
    assert "customer_code" in fields
    assert "part_number" in fields
    assert "quantity" in fields
    assert "delivery_date" in fields


@pytest.mark.asyncio
async def test_confidence_score_range():
    from services.ai_service import ai_provider

    result = await ai_provider.parse_document(SAMPLE_ORDER_TEXT)
    fields = result["fields"]

    for field_name, field_data in fields.items():
        assert 0.0 <= field_data["confidence"] <= 1.0, (
            f"{field_name} confidence {field_data['confidence']} out of range"
        )


def test_scan_pdf_detection():
    from services.pdf_service import is_scan_pdf

    assert is_scan_pdf("") is True
    assert is_scan_pdf("a" * 49) is True
    assert is_scan_pdf("a" * 50) is False


def test_normalize_pua_recovers_glyph_codes():
    """깨진 ToUnicode CMap: PUA(+0xF000) 글리프코드 → 실제 문자 복원."""
    from services.pdf_service import _normalize_pua

    pua = "".join(chr(ord(c) + 0xF000) for c in "forteq NA")
    assert _normalize_pua(pua) == "forteq NA"


def test_normalize_pua_leaves_normal_text():
    """정상 한글/ASCII는 그대로(0xF000 영역 미사용)."""
    from services.pdf_service import _normalize_pua

    s = "발주서 품번 85310-AA000 수량 500EA"
    assert _normalize_pua(s) == s
    assert _normalize_pua("") == ""


# --- parse_validation: 에스컬레이션 판정 (오프라인) ---

def _good_parsed():
    """구조검증 통과 + 핵심필드 고신뢰."""
    return {
        "fields": {
            "part_number":   {"value": "85310-AA000", "confidence": 0.95, "raw_text": ""},
            "quantity":      {"value": 500,           "confidence": 0.92, "raw_text": ""},
            "delivery_date": {"value": "2026-06-30",  "confidence": 0.91, "raw_text": ""},
        },
        "delivery_schedule": [{"date": "2026-06-30", "quantity": 500}],
    }


def test_validate_parsed_passes_good():
    from services.parse_validation import validate_parsed
    assert validate_parsed(_good_parsed()) == []


def test_validate_parsed_missing_fields():
    from services.parse_validation import validate_parsed
    assert validate_parsed({}) == ["fields 누락 또는 형식 오류"]


def test_validate_parsed_missing_part_number():
    from services.parse_validation import validate_parsed
    p = _good_parsed()
    p["fields"]["part_number"]["value"] = ""
    assert any("part_number" in e for e in validate_parsed(p))


def test_validate_parsed_nonpositive_quantity():
    from services.parse_validation import validate_parsed
    p = _good_parsed()
    p["fields"]["quantity"]["value"] = 0
    assert any("quantity" in e for e in validate_parsed(p))


def test_validate_parsed_bad_date():
    from services.parse_validation import validate_parsed
    p = _good_parsed()
    p["fields"]["delivery_date"]["value"] = "6/30"
    assert any("delivery_date" in e for e in validate_parsed(p))


def test_validate_parsed_bad_schedule_entry():
    from services.parse_validation import validate_parsed
    p = _good_parsed()
    p["delivery_schedule"] = [{"date": "30.06.2026", "quantity": -5}]
    errs = validate_parsed(p)
    assert any("delivery_schedule[0].date" in e for e in errs)
    assert any("delivery_schedule[0].quantity" in e for e in errs)


def test_low_confidence_fields_detects():
    from services.parse_validation import low_confidence_fields
    p = _good_parsed()
    p["fields"]["delivery_date"]["confidence"] = 0.40  # 빨강
    assert "delivery_date" in low_confidence_fields(p)


def test_needs_escalation_good_is_false():
    from services.parse_validation import needs_escalation
    assert needs_escalation(_good_parsed()) is False


def test_needs_escalation_low_confidence_is_true():
    """구조는 멀쩡해도 핵심필드 저신뢰면 에스컬레이션."""
    from services.parse_validation import needs_escalation
    p = _good_parsed()
    p["fields"]["quantity"]["confidence"] = 0.55
    assert needs_escalation(p) is True


def test_needs_escalation_structural_fail_is_true():
    from services.parse_validation import needs_escalation
    assert needs_escalation({}) is True


# --- parse_with_escalation: 1차 Haiku → Sonnet 에스컬레이션 (오프라인, fake provider) ---

class _FakeProvider:
    """parse_document 호출을 기록하는 가짜 provider. escalate=False는 Haiku, True는 Sonnet."""
    def __init__(self, haiku_result=None, haiku_exc=None, sonnet_result=None):
        self.haiku_result = haiku_result
        self.haiku_exc = haiku_exc
        self.sonnet_result = sonnet_result
        self.calls = []  # escalate 플래그 기록

    async def parse_document(self, text, template_hint="", escalate=False):
        self.calls.append(escalate)
        if escalate:
            return self.sonnet_result
        if self.haiku_exc is not None:
            raise self.haiku_exc
        return self.haiku_result


@pytest.mark.asyncio
async def test_escalation_good_haiku_no_sonnet():
    """Haiku 결과가 양호하면 Sonnet 호출 없이 그대로 반환."""
    from routers.orders import parse_with_escalation
    prov = _FakeProvider(haiku_result=_good_parsed())
    result = await parse_with_escalation("text", provider=prov)
    assert result == _good_parsed()
    assert prov.calls == [False]  # Haiku 1회만


@pytest.mark.asyncio
async def test_escalation_weak_haiku_triggers_sonnet():
    """Haiku 결과가 부실(구조검증 실패)하면 Sonnet으로 재시도."""
    from routers.orders import parse_with_escalation
    prov = _FakeProvider(haiku_result={"fields": {}}, sonnet_result=_good_parsed())
    result = await parse_with_escalation("text", provider=prov)
    assert result == _good_parsed()
    assert prov.calls == [False, True]  # Haiku → Sonnet


@pytest.mark.asyncio
async def test_escalation_haiku_json_exception_recovers_via_sonnet():
    """핵심 회귀: Haiku가 JSON 잘림으로 예외를 던져도 하드 실패 대신 Sonnet 복구."""
    from routers.orders import parse_with_escalation
    prov = _FakeProvider(
        haiku_exc=ValueError("AI 응답을 JSON으로 파싱할 수 없습니다."),
        sonnet_result=_good_parsed(),
    )
    result = await parse_with_escalation("text", provider=prov)
    assert result == _good_parsed()
    assert prov.calls == [False, True]  # 예외 후 Sonnet 재시도
