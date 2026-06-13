import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str | None = None
    role: str = "member"               # superadmin: admin/manager/member · 고객사 admin: manager/member
    tenant_id: uuid.UUID | None = None  # superadmin이 대상 고객사 지정 시에만 사용


class UserActiveUpdate(BaseModel):
    is_active: bool


class TenantCreate(BaseModel):
    name: str
    business_number: str | None = None
    contact_email: EmailStr
    contact_phone: str | None = None


class TenantResponse(BaseModel):
    id: uuid.UUID
    name: str
    business_number: str | None
    contact_email: str
    contact_phone: str | None
    is_active: bool
    suspended_at: datetime | None
    plan_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UsageReport(BaseModel):
    tenant_id: uuid.UUID
    tenant_name: str
    billing_month: str
    unit_count: int
    amount: float | None
    status: str


class TemplateCreate(BaseModel):
    tenant_id: uuid.UUID
    customer_name: str
    template_description: str | None = None
    field_mapping: dict | None = None
    sample_text: str | None = None


class TemplateResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    customer_name: str
    template_description: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
