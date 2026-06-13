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

# 앱 로거를 stdout으로 노출 (uvicorn은 자체 로거만 설정 → 앱 INFO/WARNING이 안 보이던 문제)
logging.basicConfig(level=logging.INFO)
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
        "006_shipment_sailing_week.sql",
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

# CORS — 운영에서는 FRONTEND_URL(콤마 구분 다중 허용) + 이 프로젝트 Vercel 도메인(프리뷰 포함) 허용.
# 환경변수 오타·트레일링 슬래시에도 안전하도록 정규식 병행.
_is_dev = settings.ENVIRONMENT == "development"
_frontend_origins = [o.strip() for o in settings.FRONTEND_URL.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _is_dev else _frontend_origins,
    allow_origin_regex=None if _is_dev else r"https://release-to-shipping-doc-creation[a-z0-9-]*\.vercel\.app",
    allow_credentials=not _is_dev,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1/auth")
app.include_router(orders.router, prefix="/api/v1/orders")
app.include_router(production.router, prefix="/api/v1/production")
app.include_router(shipment.router, prefix="/api/v1/shipment")
app.include_router(admin.router, prefix="/api/v1/admin")
