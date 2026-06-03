import uuid
from datetime import date, datetime

from sqlalchemy import DATE, DECIMAL, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    billing_month: Mapped[str] = mapped_column(String(7), nullable=False)  # 'YYYY-MM'
    unit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    amount: Mapped[float | None] = mapped_column(DECIMAL(12, 2))
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    due_date: Mapped[date] = mapped_column(DATE, nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/paid/overdue/suspended
    warning_1_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # D+30
    warning_2_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # D+37
    warning_3_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # D+44 중단예고
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="invoices")
