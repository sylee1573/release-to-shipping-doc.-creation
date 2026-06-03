import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import require_superadmin
from middleware.tenant_guard import require_active_tenant
from models.customer_profile import CustomerProfile
from models.invoice import Invoice
from models.item_master import ItemMaster
from models.parsing_template import ParsingTemplate
from models.tenant import Tenant
from models.user import User
from schemas.admin import (
    TemplateCreate,
    TemplateResponse,
    TenantCreate,
    TenantResponse,
    UsageReport,
)
from schemas.common import MessageResponse

router = APIRouter(tags=["admin"])


# ── 플랫폼 관리 (superadmin 전용) ─────────────────────────────────────

@router.get("/usage", response_model=list[UsageReport])
async def get_usage(
    billing_month: str | None = None,
    _: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(
            Invoice.tenant_id,
            Tenant.name.label("tenant_name"),
            Invoice.billing_month,
            Invoice.unit_count,
            Invoice.amount,
            Invoice.status,
        )
        .join(Tenant, Tenant.id == Invoice.tenant_id)
    )
    if billing_month:
        query = query.where(Invoice.billing_month == billing_month)
    result = await db.execute(query.order_by(Invoice.billing_month.desc()))
    rows = result.all()
    return [
        UsageReport(
            tenant_id=r.tenant_id,
            tenant_name=r.tenant_name,
            billing_month=r.billing_month,
            unit_count=r.unit_count,
            amount=r.amount,
            status=r.status,
        )
        for r in rows
    ]


@router.patch("/tenants/{tenant_id}/restore", response_model=MessageResponse)
async def restore_tenant(
    tenant_id: uuid.UUID,
    _: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="고객사를 찾을 수 없습니다")
    tenant.is_active = True
    tenant.suspended_at = None
    await db.commit()
    return MessageResponse(message=f"{tenant.name} 서비스가 복구되었습니다")


@router.get("/tenants", response_model=list[TenantResponse])
async def list_tenants(
    _: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).order_by(Tenant.name))
    return result.scalars().all()


@router.post("/tenants", response_model=TenantResponse, status_code=201)
async def create_tenant(
    body: TenantCreate,
    _: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    tenant = Tenant(
        name=body.name,
        business_number=body.business_number,
        contact_email=body.contact_email,
        contact_phone=body.contact_phone,
    )
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)
    return tenant


@router.get("/templates", response_model=list[TemplateResponse])
async def list_templates(
    tenant_id: uuid.UUID | None = None,
    _: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ParsingTemplate).where(ParsingTemplate.is_active == True)
    if tenant_id:
        stmt = stmt.where(ParsingTemplate.tenant_id == tenant_id)
    stmt = stmt.order_by(ParsingTemplate.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/templates", response_model=TemplateResponse, status_code=201)
async def create_parsing_template(
    body: TemplateCreate,
    _: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    tenant = await db.get(Tenant, body.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="고객사를 찾을 수 없습니다")
    tmpl = ParsingTemplate(
        tenant_id=body.tenant_id,
        customer_name=body.customer_name,
        template_description=body.template_description,
        field_mapping=body.field_mapping,
        sample_text=body.sample_text,
    )
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return tmpl


@router.delete("/templates/{template_id}", response_model=MessageResponse)
async def deactivate_template(
    template_id: uuid.UUID,
    _: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    tmpl = await db.get(ParsingTemplate, template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")
    tmpl.is_active = False
    await db.commit()
    return MessageResponse(message="템플릿이 비활성화되었습니다")


# ── 고객사 프로필 (테넌트 자체 관리) ──────────────────────────────────

class CustomerProfileCreate(BaseModel):
    customer_name: str
    date_type: str = "arrival"           # 'arrival' | 'completion'
    ship_to_name: str | None = None
    ship_to_address: str | None = None
    final_destination: str | None = None
    sea_transit_days: int = 21           # 해상 운송일수
    shipping_prep_days: int = 2          # 출하 준비일수
    production_lead_days: int = 7        # 생산 리드타임


class CustomerProfileUpdate(BaseModel):
    date_type: str | None = None
    ship_to_name: str | None = None
    ship_to_address: str | None = None
    final_destination: str | None = None
    sea_transit_days: int | None = None
    shipping_prep_days: int | None = None
    production_lead_days: int | None = None


class CustomerProfileResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    customer_name: str
    date_type: str
    ship_to_name: str | None
    ship_to_address: str | None
    final_destination: str | None
    sea_transit_days: int
    shipping_prep_days: int
    production_lead_days: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.get("/customer-profiles", response_model=list[CustomerProfileResponse])
async def list_customer_profiles(
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CustomerProfile)
        .where(CustomerProfile.tenant_id == user.tenant_id, CustomerProfile.is_active == True)
        .order_by(CustomerProfile.customer_name)
    )
    return result.scalars().all()


@router.post("/customer-profiles", response_model=CustomerProfileResponse, status_code=201)
async def create_customer_profile(
    body: CustomerProfileCreate,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    if body.date_type not in ("arrival", "completion"):
        raise HTTPException(status_code=422, detail="date_type은 'arrival' 또는 'completion'이어야 합니다")
    cp = CustomerProfile(
        tenant_id=user.tenant_id,
        customer_name=body.customer_name,
        date_type=body.date_type,
        ship_to_name=body.ship_to_name,
        ship_to_address=body.ship_to_address,
        final_destination=body.final_destination,
        sea_transit_days=body.sea_transit_days,
        shipping_prep_days=body.shipping_prep_days,
        production_lead_days=body.production_lead_days,
    )
    db.add(cp)
    await db.commit()
    await db.refresh(cp)
    return cp


@router.put("/customer-profiles/{cp_id}", response_model=CustomerProfileResponse)
async def update_customer_profile(
    cp_id: uuid.UUID,
    body: CustomerProfileUpdate,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    cp = await db.get(CustomerProfile, cp_id)
    if not cp or cp.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="고객사 프로필을 찾을 수 없습니다")
    if body.date_type is not None:
        if body.date_type not in ("arrival", "completion"):
            raise HTTPException(status_code=422, detail="date_type은 'arrival' 또는 'completion'이어야 합니다")
        cp.date_type = body.date_type
    if body.ship_to_name is not None:
        cp.ship_to_name = body.ship_to_name
    if body.ship_to_address is not None:
        cp.ship_to_address = body.ship_to_address
    if body.final_destination is not None:
        cp.final_destination = body.final_destination
    if body.sea_transit_days is not None:
        cp.sea_transit_days = body.sea_transit_days
    if body.shipping_prep_days is not None:
        cp.shipping_prep_days = body.shipping_prep_days
    if body.production_lead_days is not None:
        cp.production_lead_days = body.production_lead_days
    await db.commit()
    await db.refresh(cp)
    return cp


@router.delete("/customer-profiles/{cp_id}", response_model=MessageResponse)
async def delete_customer_profile(
    cp_id: uuid.UUID,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    cp = await db.get(CustomerProfile, cp_id)
    if not cp or cp.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="고객사 프로필을 찾을 수 없습니다")
    cp.is_active = False
    await db.commit()
    return MessageResponse(message="삭제되었습니다")


# ── 품목마스터 (테넌트 자체 관리) ─────────────────────────────────────

class ItemMasterCreate(BaseModel):
    customer_name: str
    part_number: str
    description: str | None = None
    unit_price: float | None = None
    net_weight_per_pc: float | None = None
    gross_weight_per_pc: float | None = None
    pcs_per_box: int | None = None
    boxes_per_pallet: int | None = None
    cbm_per_pallet: float | None = None


class ItemMasterUpdate(BaseModel):
    description: str | None = None
    unit_price: float | None = None
    net_weight_per_pc: float | None = None
    gross_weight_per_pc: float | None = None
    pcs_per_box: int | None = None
    boxes_per_pallet: int | None = None
    cbm_per_pallet: float | None = None


class ItemMasterResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    customer_name: str
    part_number: str
    description: str | None
    unit_price: float | None
    net_weight_per_pc: float | None
    gross_weight_per_pc: float | None
    pcs_per_box: int | None
    boxes_per_pallet: int | None
    cbm_per_pallet: float | None
    ran_last: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.get("/item-master", response_model=list[ItemMasterResponse])
async def list_item_master(
    customer_name: str | None = None,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ItemMaster).where(ItemMaster.tenant_id == user.tenant_id, ItemMaster.is_active == True)
    if customer_name:
        stmt = stmt.where(ItemMaster.customer_name == customer_name)
    stmt = stmt.order_by(ItemMaster.customer_name, ItemMaster.part_number)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/item-master", response_model=ItemMasterResponse, status_code=201)
async def create_item_master(
    body: ItemMasterCreate,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    item = ItemMaster(
        tenant_id=user.tenant_id,
        customer_name=body.customer_name,
        part_number=body.part_number,
        description=body.description,
        unit_price=body.unit_price,
        net_weight_per_pc=body.net_weight_per_pc,
        gross_weight_per_pc=body.gross_weight_per_pc,
        pcs_per_box=body.pcs_per_box,
        boxes_per_pallet=body.boxes_per_pallet,
        cbm_per_pallet=body.cbm_per_pallet,
        ran_last=0,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.put("/item-master/{item_id}", response_model=ItemMasterResponse)
async def update_item_master(
    item_id: uuid.UUID,
    body: ItemMasterUpdate,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(ItemMaster, item_id)
    if not item or item.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다")
    if body.description is not None:
        item.description = body.description
    if body.unit_price is not None:
        item.unit_price = body.unit_price
    if body.net_weight_per_pc is not None:
        item.net_weight_per_pc = body.net_weight_per_pc
    if body.gross_weight_per_pc is not None:
        item.gross_weight_per_pc = body.gross_weight_per_pc
    if body.pcs_per_box is not None:
        item.pcs_per_box = body.pcs_per_box
    if body.boxes_per_pallet is not None:
        item.boxes_per_pallet = body.boxes_per_pallet
    if body.cbm_per_pallet is not None:
        item.cbm_per_pallet = body.cbm_per_pallet
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/item-master/{item_id}", response_model=MessageResponse)
async def delete_item_master(
    item_id: uuid.UUID,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(ItemMaster, item_id)
    if not item or item.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다")
    item.is_active = False
    await db.commit()
    return MessageResponse(message="삭제되었습니다")
