"""파싱 결과 검증 + 에스컬레이션 판정 (벤더 독립 — 어떤 AI provider든 동일 적용).

Haiku 1차 파싱 결과를 검사해 부실하면 Sonnet으로 한 번 더 거른다.
- validate_parsed: 구조 검증(필수 필드 존재·타입·날짜)
- low_confidence_fields: 핵심 필드의 저신뢰 탐지
- needs_escalation: 위 둘의 OR — orders.py가 이걸로 Sonnet 재시도 결정
"""
from datetime import datetime

# 다운스트림(생산의뢰서/Invoice)에 반드시 필요한 핵심 필드
_CRITICAL_FIELDS = ("part_number", "quantity", "delivery_date")
_CONFIDENCE_THRESHOLD = 0.70


def _is_valid_date(value) -> bool:
    """YYYY-MM-DD로 파싱되면 True."""
    if not isinstance(value, str):
        return False
    try:
        datetime.strptime(value.strip(), "%Y-%m-%d")
        return True
    except ValueError:
        return False


def _as_positive_number(value):
    """양수면 그 값, 아니면 None. int/float/숫자문자열 허용."""
    try:
        num = float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return num if num > 0 else None


def validate_parsed(parsed: dict) -> list[str]:
    """구조 검증. 빈 리스트면 통과, 아니면 문제 설명 리스트."""
    errors: list[str] = []

    fields = parsed.get("fields") if isinstance(parsed, dict) else None
    if not isinstance(fields, dict):
        return ["fields 누락 또는 형식 오류"]

    def _value(name):
        fd = fields.get(name)
        return fd.get("value") if isinstance(fd, dict) else None

    # 핵심 필드 존재
    pn = _value("part_number")
    if pn is None or str(pn).strip() == "":
        errors.append("part_number 누락")

    qty = _value("quantity")
    if qty is None or str(qty).strip() == "":
        errors.append("quantity 누락")
    elif _as_positive_number(qty) is None:
        errors.append("quantity가 양수가 아님")

    dd = _value("delivery_date")
    if dd is None or str(dd).strip() == "":
        errors.append("delivery_date 누락")
    elif not _is_valid_date(dd):
        errors.append("delivery_date가 YYYY-MM-DD 형식이 아님")

    # delivery_schedule(있으면) 각 항목 검증
    schedule = parsed.get("delivery_schedule")
    if isinstance(schedule, list):
        for i, entry in enumerate(schedule):
            if not isinstance(entry, dict):
                errors.append(f"delivery_schedule[{i}] 형식 오류")
                continue
            if not _is_valid_date(entry.get("date")):
                errors.append(f"delivery_schedule[{i}].date 형식 오류")
            if _as_positive_number(entry.get("quantity")) is None:
                errors.append(f"delivery_schedule[{i}].quantity가 양수가 아님")

    return errors


def low_confidence_fields(parsed: dict, threshold: float = _CONFIDENCE_THRESHOLD) -> list[str]:
    """핵심 필드 중 confidence < threshold인 필드명 목록."""
    fields = parsed.get("fields") if isinstance(parsed, dict) else None
    if not isinstance(fields, dict):
        return list(_CRITICAL_FIELDS)

    low: list[str] = []
    for name in _CRITICAL_FIELDS:
        fd = fields.get(name)
        if not isinstance(fd, dict):
            low.append(name)
            continue
        try:
            conf = float(fd.get("confidence", 1.0))
        except (TypeError, ValueError):
            conf = 0.0
        if conf < threshold:
            low.append(name)
    return low


def needs_escalation(parsed: dict) -> bool:
    """구조검증 실패 OR 핵심필드 저신뢰면 True → Sonnet 재시도 권장."""
    return bool(validate_parsed(parsed)) or bool(low_confidence_fields(parsed))
