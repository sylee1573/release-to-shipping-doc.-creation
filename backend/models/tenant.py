import uuid
from datetime import datetime

from sqlalchemy import Boolean, DECIMAL, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    business_number: Mapped[str | None] = mapped_column(String(20))
    contact_email: Mapped[str] = mapped_column(String(200), nullable=False)
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    plan_type: Mapped[str] = mapped_column(String(50), default="per_unit")
    monthly_fee: Mapped[float | None] = mapped_column(DECIMAL(12, 2))  # 정액제 월 청구액
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    users: Mapped[list["User"]] = relationship("User", back_populates="tenant", lazy="noload")
    orders: Mapped[list["Order"]] = relationship("Order", back_populates="tenant", lazy="noload")
    invoices: Mapped[list["Invoice"]] = relationship("Invoice", back_populates="tenant", lazy="noload")
