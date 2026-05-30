import uuid
from datetime import datetime
from pydantic import BaseModel, model_validator


class ShipmentCreate(BaseModel):
    # 단일 또는 복수 PR 지원
    production_request_ids: list[uuid.UUID] | None = None  # 복수 (다품번)
    production_request_id: uuid.UUID | None = None          # 단일 (기존 호환)
    doc_type: str  # 'invoice' / 'packing_list'

    @model_validator(mode="after")
    def resolve_ids(self):
        if not self.production_request_ids and self.production_request_id:
            self.production_request_ids = [self.production_request_id]
        if not self.production_request_ids:
            raise ValueError("production_request_ids 또는 production_request_id 중 하나는 필수입니다")
        if not self.production_request_id:
            self.production_request_id = self.production_request_ids[0]
        return self


class ShipmentResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    production_request_id: uuid.UUID
    pr_ids: list[str] | None = None     # 다품번 묶음 PR ID 목록
    doc_type: str
    doc_number: str | None
    excel_path: str | None
    issued_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
