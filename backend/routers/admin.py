import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import hash_password, require_admin, require_superadmin
from middleware.tenant_guard import require_active_tenant
from models.customer_profile import CustomerProfile
from models.invoice import Invoice
from models.item_master import ItemMaster
from models.parsing_template import ParsingTemplate
from models.tenant import Tenant
from models.user import User
from services import billing_service, excel_service
from schemas.admin import (
    AdminUserCreate,
    InvoiceGenerate,
    InvoiceGenerateResult,
    TemplateCreate,
    TemplateResponse,
    TenantCreate,
    TenantResponse,
    TenantUpdate,
    UsageReport,
    UserActiveUpdate,
)
from schemas.auth import UserResponse
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
            Invoice.id.label("invoice_id"),
            Invoice.tenant_id,
            Tenant.name.label("tenant_name"),
            Invoice.billing_month,
            Invoice.unit_count,
            Invoice.amount,
            Invoice.status,
            Invoice.due_date,
            Invoice.paid_at,
        )
        .join(Tenant, Tenant.id == Invoice.tenant_id)
    )
    if billing_month:
        query = query.where(Invoice.billing_month == billing_month)
    result = await db.execute(query.order_by(Invoice.billing_month.desc()))
    rows = result.all()
    return [
        UsageReport(
            invoice_id=r.invoice_id,
            tenant_id=r.tenant_id,
            tenant_name=r.tenant_name,
            billing_month=r.billing_month,
            unit_count=r.unit_count,
            amount=r.amount,
            status=r.status,
            due_date=r.due_date,
            paid_at=r.paid_at,
        )
        for r in rows
    ]


@router.post("/invoices/generate", response_model=InvoiceGenerateResult)
async def generate_invoices(
    body: InvoiceGenerate,
    _: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """선택한 월에 대해 정액 인보이스 발행 (월정액 설정된 고객사 대상, 중복 자동 제외)."""
    result = await billing_service.generate_invoices_for_month(db, body.billing_month)
    return InvoiceGenerateResult(**result)


@router.patch("/invoices/{invoice_id}/pay", response_model=MessageResponse)
async def mark_invoice_paid(
    invoice_id: uuid.UUID,
    _: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """입금 확인 — 인보이스를 납부완료 처리."""
    invoice = await db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="인보이스를 찾을 수 없습니다")
    invoice.paid_at = datetime.now(timezone.utc)
    invoice.status = "paid"
    await db.commit()
    return MessageResponse(message="입금이 확인되었습니다")


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
        monthly_fee=body.monthly_fee,
    )
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)
    return tenant


@router.patch("/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: uuid.UUID,
    body: TenantUpdate,
    _: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="고객사를 찾을 수 없습니다")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    await db.commit()
    await db.refresh(tenant)
    return tenant


# ── 계정 관리 (superadmin: 전체 / 고객사 admin: 자기 테넌트 직원) ───────

_ROLES_BY_SUPERADMIN = ("admin", "manager", "member")
_ROLES_BY_TENANT_ADMIN = ("manager", "member")  # 고객사 admin은 admin 승격 불가


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    tenant_id: uuid.UUID | None = None,
    caller: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User)
    if caller.is_superadmin:
        if tenant_id:
            stmt = stmt.where(User.tenant_id == tenant_id)
    else:
        stmt = stmt.where(User.tenant_id == caller.tenant_id)  # §11 테넌트 격리
    result = await db.execute(stmt.order_by(User.created_at))
    return result.scalars().all()


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    body: AdminUserCreate,
    caller: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if caller.is_superadmin:
        tenant_id = body.tenant_id or caller.tenant_id
        allowed = _ROLES_BY_SUPERADMIN
    else:
        tenant_id = caller.tenant_id            # 강제: 자기 테넌트 (§11)
        allowed = _ROLES_BY_TENANT_ADMIN
    if body.role not in allowed:
        raise HTTPException(status_code=403, detail="해당 권한의 계정을 생성할 수 없습니다")

    if not await db.get(Tenant, tenant_id):
        raise HTTPException(status_code=404, detail="고객사를 찾을 수 없습니다")

    dup = await db.execute(select(User).where(User.email == body.email))
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 사용 중인 이메일입니다")

    user = User(
        tenant_id=tenant_id,
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/{user_id}/active", response_model=UserResponse)
async def set_user_active(
    user_id: uuid.UUID,
    body: UserActiveUpdate,
    caller: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    target = await db.get(User, user_id)
    if not target or (not caller.is_superadmin and target.tenant_id != caller.tenant_id):
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    if target.is_superadmin:
        raise HTTPException(status_code=403, detail="운영자 계정은 변경할 수 없습니다")
    if target.id == caller.id:
        raise HTTPException(status_code=400, detail="본인 계정은 변경할 수 없습니다")
    target.is_active = body.is_active
    await db.commit()
    await db.refresh(target)
    return target


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
    boxes_per_pallet: int | None = None  # 파레트당 박스 수 (Packing CBM 폴백)


class CustomerProfileUpdate(BaseModel):
    date_type: str | None = None
    ship_to_name: str | None = None
    ship_to_address: str | None = None
    final_destination: str | None = None
    sea_transit_days: int | None = None
    shipping_prep_days: int | None = None
    production_lead_days: int | None = None
    boxes_per_pallet: int | None = None


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
    boxes_per_pallet: int | None
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
        boxes_per_pallet=body.boxes_per_pallet,
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
    if body.boxes_per_pallet is not None:
        cp.boxes_per_pallet = body.boxes_per_pallet
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


# ── 품목마스터 Excel 일괄 업로드 ──────────────────────────────────

class ItemMasterBulkError(BaseModel):
    row: int
    message: str


class ItemMasterBulkResult(BaseModel):
    total: int          # 파싱된 데이터 행 수
    created: int        # 신규 등록
    skipped: int        # 중복(기존 또는 파일 내) 건너뜀
    errors: list[ItemMasterBulkError]


_BULK_ITEM_FIELDS = (
    "description", "unit_price", "net_weight_per_pc", "gross_weight_per_pc",
    "pcs_per_box", "boxes_per_pallet", "cbm_per_pallet",
)


@router.post("/item-master/bulk-upload", response_model=ItemMasterBulkResult, status_code=201)
async def bulk_upload_item_master(
    file: UploadFile = File(...),
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    fname = (file.filename or "").lower()
    if not (fname.endswith(".xlsx") or fname.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Excel(.xlsx, .xls) 파일만 지원합니다")

    file_bytes = await file.read()
    rows, error = excel_service.parse_item_master_rows(file_bytes, fname)
    if error:
        raise HTTPException(status_code=422, detail=error)
    if not rows:
        raise HTTPException(status_code=422, detail="등록할 데이터 행이 없습니다")

    # 기존 (customer_name, part_number) 쌍 1회 조회 → 중복 판정용 set
    existing_result = await db.execute(
        select(ItemMaster.customer_name, ItemMaster.part_number).where(
            ItemMaster.tenant_id == user.tenant_id,
            ItemMaster.is_active == True,
        )
    )
    seen: set[tuple[str, str]] = {(c, p) for c, p in existing_result.all()}

    created = skipped = 0
    errors: list[ItemMasterBulkError] = []
    new_items: list[ItemMaster] = []

    for item in rows:
        cust = item.get("customer_name")
        pn   = item.get("part_number")
        if not cust or not pn:
            errors.append(ItemMasterBulkError(row=item["row"], message="고객사명·품번은 필수입니다"))
            continue
        key = (cust, pn)
        if key in seen:
            skipped += 1
            continue
        seen.add(key)
        new_items.append(ItemMaster(
            tenant_id=user.tenant_id,
            customer_name=cust,
            part_number=pn,
            ran_last=0,
            **{f: item[f] for f in _BULK_ITEM_FIELDS if f in item},
        ))
        created += 1

    if new_items:
        db.add_all(new_items)
        await db.commit()

    return ItemMasterBulkResult(total=len(rows), created=created, skipped=skipped, errors=errors)
