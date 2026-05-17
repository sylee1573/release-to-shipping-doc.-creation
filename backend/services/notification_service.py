import hashlib
import hmac
import time
from datetime import datetime

import httpx

from config import settings

_SOLAPI_BASE = "https://api.solapi.com"


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
    """카카오 알림톡 발송. 실패 시 SMS 폴백."""
    if not settings.SOLAPI_API_KEY:
        return False

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
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_SOLAPI_BASE}/messages/v4/send",
            json=payload,
            headers=_auth_header(),
        )
        return resp.status_code == 200


async def send_sms(to: str, text: str) -> bool:
    """SMS 단문 발송."""
    if not settings.SOLAPI_API_KEY:
        return False

    payload = {
        "message": {
            "to": to,
            "from": settings.SOLAPI_SENDER_PHONE,
            "text": text,
        }
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_SOLAPI_BASE}/messages/v4/send",
            json=payload,
            headers=_auth_header(),
        )
        return resp.status_code == 200
