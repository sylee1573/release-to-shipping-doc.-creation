from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config import settings

# Railway는 postgresql:// 형식으로 DATABASE_URL을 제공 — asyncpg 드라이버로 변환
_db_url = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1) \
    if settings.DATABASE_URL.startswith("postgresql://") else settings.DATABASE_URL

engine = create_async_engine(
    _db_url,
    echo=settings.ENVIRONMENT == "development",
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
