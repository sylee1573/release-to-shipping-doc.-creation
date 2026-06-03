import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class ItemMaster(Base):
    __tablename__ = "item_master"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)

    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)  # customer_profiles와 매칭
    part_number: Mapped[str] = mapped_column(String(200), nullable=False)

    description: Mapped[str | None] = mapped_column(String(500))      # 표준 품목 설명
    unit_price: Mapped[float | None] = mapped_column(Numeric(14, 6))  # 단가 (USD)
    net_weight_per_pc: Mapped[float | None] = mapped_column(Numeric(12, 6))  # 개당 순중량 (kg)
    gross_weight_per_pc: Mapped[float | None] = mapped_column(Numeric(12, 6))  # 개당 gross 중량 (kg)
    pcs_per_box: Mapped[int | None] = mapped_column(Integer)           # 박스당 수량
    boxes_per_pallet: Mapped[int | None] = mapped_column(Integer)      # 파레트당 박스 수
    cbm_per_pallet: Mapped[float | None] = mapped_column(Numeric(10, 6))  # 박스당 CBM (m³)

    # 품번별 RAN 카운터 (0→첫 발급 시 10, 이후 10씩 증가)
    ran_last: Mapped[int] = mapped_column(Integer, default=0)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
