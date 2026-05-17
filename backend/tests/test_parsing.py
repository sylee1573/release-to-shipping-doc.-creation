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
