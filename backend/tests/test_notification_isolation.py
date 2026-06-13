"""발송 격리 — NOTIFICATIONS_ENABLED=false면 외부 호출 0건으로 차단되는지 검증."""
import pytest

from services import notification_service as ns


class _BoomClient:
    """post가 호출되면 즉시 실패 — '외부 호출 0건' 위반을 잡아낸다."""

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, *a, **k):
        raise AssertionError("외부 발송 호출 발생 — 격리 실패")


@pytest.mark.asyncio
async def test_suppressed_when_disabled(monkeypatch):
    """플래그 off: HTTP 호출 전에 차단되고 False 반환."""
    monkeypatch.setattr(ns.settings, "NOTIFICATIONS_ENABLED", False)
    monkeypatch.setattr(ns.httpx, "AsyncClient", _BoomClient)  # 호출되면 AssertionError

    assert await ns.send_kakao("01000000000", "TPL", {"k": "v"}) is False
    assert await ns.send_sms("01000000000", "본문") is False


@pytest.mark.asyncio
async def test_blocked_when_no_key(monkeypatch):
    """이중 방어: 플래그 on이어도 키가 더미/빈값이면 외부 호출 없이 차단."""
    monkeypatch.setattr(ns.settings, "NOTIFICATIONS_ENABLED", True)
    monkeypatch.setattr(ns.settings, "SOLAPI_API_KEY", "")
    monkeypatch.setattr(ns.httpx, "AsyncClient", _BoomClient)

    assert await ns.send_kakao("01000000000", "TPL", {}) is False
