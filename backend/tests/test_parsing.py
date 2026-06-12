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
