import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import require_superadmin
from models.invoice import Invoice
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


@router.get("/usage", response_model=list[UsageReport])
async def get_usage(
    billing_month: str | None = None,
    _: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """고객사별 월별 사용량 리포트 (관리자 전용)."""
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
    """입금 확인 후 서비스 복구 (관리자 전용)."""
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
    """고객사 목록 조회 (관리자 전용)."""
    result = await db.execute(select(Tenant).order_by(Tenant.name))
    return result.scalars().all()


@router.post("/tenants", response_model=TenantResponse, status_code=201)
async def create_tenant(
    body: TenantCreate,
    _: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """신규 고객사 등록 (관리자 전용)."""
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
    """발주서 양식 템플릿 목록 (관리자 전용)."""
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
    """발주서 양식 템플릿 등록 (관리자 전용)."""
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
    """템플릿 비활성화 (관리자 전용). 삭제 대신 is_active=False."""
    tmpl = await db.get(ParsingTemplate, template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")
    tmpl.is_active = False
    await db.commit()
    return MessageResponse(message="템플릿이 비활성화되었습니다")
