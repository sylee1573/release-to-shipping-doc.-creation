import uuid
from datetime import date, datetime

from sqlalchemy import DATE, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class ShipmentDoc(Base):
    __tablename__ = "shipment_docs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    production_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("production_requests.id"), nullable=False
    )
    doc_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'invoice' / 'packing_list'
    pr_ids: Mapped[list | None] = mapped_column(JSONB)            # 다품번 묶음 시 PR UUID 목록
    doc_number: Mapped[str | None] = mapped_column(String(100))  # INV-{YYYYMM}-{0001} / PKL-...
    sailing_week_monday: Mapped[date | None] = mapped_column(DATE)  # 기준 선적주(월). NULL=슬롯1 폴백
    excel_path: Mapped[str | None] = mapped_column(String(1000))
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped["Tenant"] = relationship("Tenant")
    production_request: Mapped["ProductionRequest"] = relationship(
        "ProductionRequest", back_populates="shipment_docs"
    )
