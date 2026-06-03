import logging
from contextlib import asynccontextmanager
from pathlib import Path

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import engine
from routers import admin, auth, health, orders, production, shipment
from services.schedule_service import start_scheduler, stop_scheduler

if settings.SENTRY_DSN:
    sentry_sdk.init(dsn=settings.SENTRY_DSN, environment=settings.ENVIRONMENT)

logger = logging.getLogger(__name__)


async def _run_migrations():
    """서버 시작 시 migrations/ SQL 파일을 순서대로 실행 (IF NOT EXISTS 멱등)."""
    migration_dir = Path(__file__).parent / "migrations"
    files = [
        "init.sql",
        "005_invoice_warning3.sql",
    ]
    async with engine.begin() as conn:
        for fname in files:
            fpath = migration_dir / fname
            if not fpath.exists():
                continue
            sql = fpath.read_text(encoding="utf-8")
            try:
                await conn.exec_driver_sql(sql)
                logger.info("migration OK: %s", fname)
            except Exception as e:
                logger.warning("migration skip %s: %s", fname, e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _run_migrations()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="발주 자동화 SaaS API",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.ENVIRONMENT == "development" else [settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1/auth")
app.include_router(orders.router, prefix="/api/v1/orders")
app.include_router(production.router, prefix="/api/v1/production")
app.include_router(shipment.router, prefix="/api/v1/shipment")
app.include_router(admin.router, prefix="/api/v1/admin")
