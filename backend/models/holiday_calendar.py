import uuid
from datetime import date, datetime

from sqlalchemy import DATE, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class HolidayCalendar(Base):
    __tablename__ = "holiday_calendar"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    week_start_date: Mapped[date] = mapped_column(DATE, nullable=False)  # 해당 주 월요일
    reason: Mapped[str | None] = mapped_column(String(200))              # 추석, 여름휴가 등
    customer_name: Mapped[str | None] = mapped_column(String(200))       # NULL = 전체 고객사 적용
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
