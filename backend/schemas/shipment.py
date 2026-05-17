import uuid
from datetime import datetime
from pydantic import BaseModel


class ShipmentCreate(BaseModel):
    production_request_id: uuid.UUID
    doc_type: str  # 'invoice' / 'packing_list'


class ShipmentResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    production_request_id: uuid.UUID
    doc_type: str
    doc_number: str | None
    excel_path: str | None
    issued_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
