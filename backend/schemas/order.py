import uuid
from datetime import datetime
from pydantic import BaseModel


class FieldValue(BaseModel):
    value: str | int | float | None
    confidence: float  # 0.0 ~ 1.0
    raw_text: str | None = None


class ParsedData(BaseModel):
    fields: dict[str, FieldValue]
    parse_notes: str | None = None


class OrderResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    customer_name: str | None
    file_name: str | None
    parse_status: str
    parsed_data: dict | None
    confirmed_data: dict | None
    confirmed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConfirmOrderRequest(BaseModel):
    confirmed_data: dict[str, str | int | float]
