import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)

    # SA 파싱된 customer_code 값과 매칭되는 키
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)

    # SA 날짜 유형: 'arrival'(고객 도착일) | 'completion'(물건 완료일)
    date_type: Mapped[str] = mapped_column(String(20), default="arrival")

    # Invoice / Packing 수신처 정보
    ship_to_name: Mapped[str | None] = mapped_column(String(500))
    ship_to_address: Mapped[str | None] = mapped_column(Text)       # 줄바꿈 포함 전체 주소
    final_destination: Mapped[str | None] = mapped_column(String(500))

    # 납기 역산 설정 (일수)
    sea_transit_days: Mapped[int] = mapped_column(Integer, default=21)    # 해상 운송일수 (도착일→선적일)
    shipping_prep_days: Mapped[int] = mapped_column(Integer, default=2)   # 출하 준비일수 (선적일→생산완료일)
    production_lead_days: Mapped[int] = mapped_column(Integer, default=7) # 생산 리드타임

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
