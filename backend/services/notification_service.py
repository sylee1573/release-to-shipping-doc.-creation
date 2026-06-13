import hashlib
import hmac
import logging
import time
from datetime import datetime

import httpx

from config import settings

logger = logging.getLogger(__name__)

_SOLAPI_BASE = "https://api.solapi.com"


async def _post_message(payload: dict) -> bool:
    """모든 외부 발송의 단일 진입점 — 격리 게이트(flag) 후 키 가드, 그다음 실제 호출.

    이중 방어: NOTIFICATIONS_ENABLED=false면 HTTP 호출 전에 차단(외부 호출 0건).
    플래그가 실수로 켜져도 더미 키면 SOLAPI_API_KEY 가드/인증 실패로 실송신 안 됨.
    """
    if not settings.NOTIFICATIONS_ENABLED:
        to = (payload.get("message") or {}).get("to", "")
        logger.warning("notification suppressed (NOTIFICATIONS_ENABLED=false): to=%s", to)
        return False
    if not settings.SOLAPI_API_KEY:
        return False
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_SOLAPI_BASE}/messages/v4/send",
            json=payload,
            headers=_auth_header(),
        )
        return resp.status_code == 200


def _auth_header() -> dict:
    date_str = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    salt = str(int(time.time() * 1000))
    data = date_str + salt
    signature = hmac.new(
        settings.SOLAPI_API_SECRET.encode(),
        data.encode(),
        hashlib.sha256,
    ).hexdigest()
    return {
        "Authorization": (
            f"HMAC-SHA256 apiKey={settings.SOLAPI_API_KEY}, "
            f"date={date_str}, salt={salt}, signature={signature}"
        )
    }


async def send_kakao(to: str, template_id: str, variables: dict) -> bool:
    """카카오 알림톡 발송."""
    payload = {
        "message": {
            "to": to,
            "from": settings.SOLAPI_SENDER_PHONE,
            "kakaoOptions": {
                "pfId": settings.SOLAPI_KAKAO_PFID,
                "templateId": template_id,
                "variables": variables,
            },
        }
    }
    return await _post_message(payload)


async def send_sms(to: str, text: str) -> bool:
    """SMS 단문 발송."""
    payload = {
        "message": {
            "to": to,
            "from": settings.SOLAPI_SENDER_PHONE,
            "text": text,
        }
    }
    return await _post_message(payload)
