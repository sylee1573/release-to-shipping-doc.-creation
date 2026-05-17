import uuid
from datetime import date, datetime

from sqlalchemy import DATE, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class ProductionRequest(Base):
    __tablename__ = "production_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False)
    request_number: Mapped[str | None] = mapped_column(String(100))  # PR-{YYYYMM}-{0001}
    production_start_date: Mapped[date | None] = mapped_column(DATE)  # 납기 역산
    production_end_date: Mapped[date | None] = mapped_column(DATE)
    quantity: Mapped[int | None] = mapped_column(Integer)
    adjusted_quantity: Mapped[int | None] = mapped_column(Integer)
    adjusted_delivery_date: Mapped[date | None] = mapped_column(DATE)
    change_history: Mapped[list] = mapped_column(JSONB, default=list)  # 변경이력 배열
    excel_path: Mapped[str | None] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft/confirmed/in_production/done
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    tenant: Mapped["Tenant"] = relationship("Tenant")
    order: Mapped["Order"] = relationship("Order", back_populates="production_requests")
    shipment_docs: Mapped[list["ShipmentDoc"]] = relationship(
        "ShipmentDoc", back_populates="production_request", lazy="noload"
    )
