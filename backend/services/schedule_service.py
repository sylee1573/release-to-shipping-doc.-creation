from datetime import date, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, update

from database import AsyncSessionLocal
from models.invoice import Invoice
from models.tenant import Tenant
from services import notification_service

scheduler = AsyncIOScheduler()


async def check_overdue_invoices():
    """매일 자정 실행: 미납 인보이스 단계별 처리."""
    today = date.today()

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Invoice).where(Invoice.paid_at.is_(None), Invoice.status != "suspended")
        )
        invoices = result.scalars().all()

        for inv in invoices:
            days_overdue = (today - inv.due_date).days

            if days_overdue >= 45 and inv.status != "suspended":
                # 서비스 자동 중단
                await session.execute(
                    update(Tenant)
                    .where(Tenant.id == inv.tenant_id)
                    .values(is_active=False, suspended_at=date.today())
                )
                inv.status = "suspended"

            elif days_overdue >= 44 and not inv.warning_3_sent_at:
                # 중단 예고 (D+44)
                tenant = await session.get(Tenant, inv.tenant_id)
                if tenant:
                    await notification_service.send_kakao(
                        tenant.contact_phone or "",
                        "SUSPEND_TOMORROW",
                        {"company": tenant.name},
                    )
                    inv.warning_3_sent_at = date.today()

            elif days_overdue >= 37 and not inv.warning_2_sent_at:
                # 2차 경고 (D+37)
                tenant = await session.get(Tenant, inv.tenant_id)
                if tenant:
                    await notification_service.send_kakao(
                        tenant.contact_phone or "",
                        "OVERDUE_WARNING_2",
                        {"company": tenant.name, "billing_month": inv.billing_month},
                    )
                    inv.warning_2_sent_at = date.today()
                    inv.status = "overdue"

            elif days_overdue >= 30 and not inv.warning_1_sent_at:
                # 1차 경고 (D+30)
                tenant = await session.get(Tenant, inv.tenant_id)
                if tenant:
                    await notification_service.send_kakao(
                        tenant.contact_phone or "",
                        "OVERDUE_WARNING_1",
                        {"company": tenant.name, "billing_month": inv.billing_month},
                    )
                    inv.warning_1_sent_at = date.today()
                    inv.status = "overdue"

        await session.commit()


def start_scheduler():
    scheduler.add_job(check_overdue_invoices, "cron", hour=0, minute=0, id="overdue_check")
    scheduler.start()


def stop_scheduler():
    scheduler.shutdown(wait=False)
