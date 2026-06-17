"""정액제 인보이스 발행 로직.

월정액(tenants.monthly_fee)이 설정된 고객사마다 해당 월 인보이스를 1건 생성한다.
이미 같은 (tenant, billing_month) 인보이스가 있으면 건너뛴다(멱등).
"""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.invoice import Invoice
from models.tenant import Tenant

DUE_DAYS = 14  # 발행일로부터 납부 기한


async def generate_invoices_for_month(session: AsyncSession, billing_month: str) -> dict:
    """billing_month('YYYY-MM')에 대해 정액 인보이스를 발행. {created, skipped} 반환."""
    # 월정액이 설정된 고객사만 대상
    tenants = (
        (await session.execute(select(Tenant).where(Tenant.monthly_fee.isnot(None), Tenant.monthly_fee > 0)))
        .scalars()
        .all()
    )

    # 이미 발행된 고객사 집합 (중복 방지)
    existing = set(
        (await session.execute(
            select(Invoice.tenant_id).where(Invoice.billing_month == billing_month)
        )).scalars().all()
    )

    now = datetime.now(timezone.utc)
    due = date.today() + timedelta(days=DUE_DAYS)
    created = 0
    for t in tenants:
        if t.id in existing:
            continue
        session.add(Invoice(
            tenant_id=t.id,
            billing_month=billing_month,
            unit_count=0,            # 정액제 — 건수 미사용
            amount=t.monthly_fee,
            issued_at=now,
            due_date=due,
            status="pending",
        ))
        created += 1

    await session.commit()
    return {"billing_month": billing_month, "created": created, "skipped": len(tenants) - created}
