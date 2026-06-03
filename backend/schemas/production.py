import uuid
from datetime import date, datetime
from pydantic import BaseModel


class ProductionCreate(BaseModel):
    order_id: uuid.UUID
    quantity: int | None = None          # None이면 발주서 confirmed_data에서 자동 채움
    delivery_date: date | None = None    # None이면 발주서 confirmed_data에서 자동 채움


class ProductionUpdate(BaseModel):
    adjusted_quantity: int | None = None
    adjusted_delivery_date: date | None = None
    reason: str


class ProductionStatusUpdate(BaseModel):
    status: str  # draft / confirmed / in_production / done


class ProductionResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    order_id: uuid.UUID
    request_number: str | None
    customer_name: str | None = None      # 발주 고객사명 (Order에서 join)
    production_start_date: date | None
    production_end_date: date | None
    quantity: int | None
    adjusted_quantity: int | None
    adjusted_delivery_date: date | None
    sailing_date: date | None = None
    ran_number: int | None = None
    part_number: str | None = None
    weekly_schedule: list | None = None
    change_history: list
    excel_path: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
