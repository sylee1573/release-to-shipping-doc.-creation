from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """헬스체크 — 인증 불필요. DB 연결 상태 포함."""
    await db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}
