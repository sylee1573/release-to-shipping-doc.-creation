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
    """서버 시작 시 migrations/ SQL 파일을 구문별로 실행 (멱등)."""
    migration_dir = Path(__file__).parent / "migrations"
    files = [
        "init.sql",
        "002_customer_profile_item_master.sql",
        "003_sailing_date_multi_item.sql",
        "004_item_master_pallet_cbm.sql",
        "005_invoice_warning3.sql",
    ]

    for fname in files:
        fpath = migration_dir / fname
        if not fpath.exists():
            continue
        sql = fpath.read_text(encoding="utf-8")
        # ';' 기준으로 분리 후 각 구문에서 앞쪽 주석 라인 제거
        def _strip_comments(s: str) -> str:
            lines = [ln for ln in s.splitlines() if not ln.strip().startswith("--")]
            return "\n".join(lines).strip()

        stmts = [_strip_comments(s) for s in sql.split(";")]
        stmts = [s for s in stmts if s]
        ok = skipped = 0
        for stmt in stmts:
            try:
                async with engine.begin() as conn:
                    await conn.exec_driver_sql(stmt)
                ok += 1
            except Exception as e:
                skipped += 1
                logger.debug("migration %s stmt skipped: %s", fname, e)
        logger.info("migration %s: %d ok, %d skipped", fname, ok, skipped)


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
