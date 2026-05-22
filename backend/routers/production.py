import uuid
from datetime import date, datetime, timezone, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from middleware.tenant_guard import require_active_tenant
from models.order import Order
from models.production_request import ProductionRequest
from models.user import User
from schemas.production import (
    ProductionCreate,
    ProductionResponse,
    ProductionStatusUpdate,
    ProductionUpdate,
)
from services.excel_builder import build_production_request

router = APIRouter(tags=["production"])

_SHIPPING_PREP_DAYS = 2   # 출하 준비일수
_LEAD_TIME_DAYS = 7       # 생산 리드타임

VALID_STATUS_TRANSITIONS = {
    "draft": {"confirmed"},
    "confirmed": {"in_production", "draft"},
    "in_production": {"done", "confirmed"},
    "done": set(),
}


async def _generate_request_number(db: AsyncSession, tenant_id: uuid.UUID) -> str:
    today = date.today()
    ym = today.strftime("%Y%m")
    prefix = f"PR-{ym}-"
    # 해당 월의 기존 의뢰서 수로 순번 결정 (tenant 무관, 전체 기준)
    stmt = select(func.count()).where(
        ProductionRequest.request_number.like(f"{prefix}%")
    )
    result = await db.execute(stmt)
    count = result.scalar_one()
    return f"{prefix}{str(count + 1).zfill(4)}"


def _to_response(pr: ProductionRequest, customer_name: str | None = None) -> dict:
    data = {
        "id": pr.id,
        "tenant_id": pr.tenant_id,
        "order_id": pr.order_id,
        "request_number": pr.request_number,
        "customer_name": customer_name,
        "production_start_date": pr.production_start_date,
        "production_end_date": pr.production_end_date,
        "quantity": pr.quantity,
        "adjusted_quantity": pr.adjusted_quantity,
        "adjusted_delivery_date": pr.adjusted_delivery_date,
        "change_history": pr.change_history or [],
        "excel_path": pr.excel_path,
        "status": pr.status,
        "created_at": pr.created_at,
        "updated_at": pr.updated_at,
    }
    return data


@router.get("/", response_model=list[ProductionResponse])
async def list_production_requests(
    status: str | None = Query(None, description="상태 필터: draft/confirmed/in_production/done"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ProductionRequest, Order.customer_name)
        .join(Order, ProductionRequest.order_id == Order.id)
        .where(ProductionRequest.tenant_id == user.tenant_id)  # tenant_id 필터
    )
    if status:
        stmt = stmt.where(ProductionRequest.status == status)
    stmt = stmt.order_by(ProductionRequest.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(stmt)
    rows = result.all()
    return [ProductionResponse(**_to_response(pr, cname)) for pr, cname in rows]


@router.get("/{pr_id}", response_model=ProductionResponse)
async def get_production_request(
    pr_id: uuid.UUID,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ProductionRequest, Order.customer_name)
        .join(Order, ProductionRequest.order_id == Order.id)
        .where(
            ProductionRequest.id == pr_id,
            ProductionRequest.tenant_id == user.tenant_id,  # tenant_id 필터
        )
    )
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="생산의뢰서를 찾을 수 없습니다")
    pr, customer_name = row
    return ProductionResponse(**_to_response(pr, customer_name))


@router.post("/", response_model=ProductionResponse, status_code=201)
async def create_production_request(
    body: ProductionCreate,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    order = await db.get(Order, body.order_id)
    if not order or order.tenant_id != user.tenant_id:  # tenant_id 필터
        raise HTTPException(status_code=404, detail="발주서를 찾을 수 없습니다")

    production_end = body.delivery_date - timedelta(days=_SHIPPING_PREP_DAYS)
    production_start = production_end - timedelta(days=_LEAD_TIME_DAYS)

    pr = ProductionRequest(
        tenant_id=user.tenant_id,
        order_id=body.order_id,
        request_number=await _generate_request_number(db, user.tenant_id),
        production_start_date=production_start,
        production_end_date=production_end,
        quantity=body.quantity,
        status="draft",
    )
    db.add(pr)
    await db.commit()
    await db.refresh(pr)
    return ProductionResponse(**_to_response(pr, order.customer_name))


@router.patch("/{pr_id}", response_model=ProductionResponse)
async def update_production_request(
    pr_id: uuid.UUID,
    body: ProductionUpdate,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    pr = await db.get(ProductionRequest, pr_id)
    if not pr or pr.tenant_id != user.tenant_id:  # tenant_id 필터
        raise HTTPException(status_code=404, detail="생산의뢰서를 찾을 수 없습니다")

    now_iso = datetime.now(timezone.utc).isoformat()
    new_entries = []

    if body.adjusted_quantity is not None:
        new_entries.append({
            "changed_at": now_iso,
            "changed_by": str(user.id),
            "field": "quantity",
            "before": pr.adjusted_quantity if pr.adjusted_quantity is not None else pr.quantity,
            "after": body.adjusted_quantity,
            "reason": body.reason,
        })
        pr.adjusted_quantity = body.adjusted_quantity

    if body.adjusted_delivery_date is not None:
        prev_delivery = str(pr.adjusted_delivery_date or pr.production_end_date)
        new_entries.append({
            "changed_at": now_iso,
            "changed_by": str(user.id),
            "field": "delivery_date",
            "before": prev_delivery,
            "after": str(body.adjusted_delivery_date),
            "reason": body.reason,
        })
        pr.adjusted_delivery_date = body.adjusted_delivery_date
        pr.production_end_date = body.adjusted_delivery_date - timedelta(days=_SHIPPING_PREP_DAYS)
        pr.production_start_date = pr.production_end_date - timedelta(days=_LEAD_TIME_DAYS)

    pr.change_history = (pr.change_history or []) + new_entries
    await db.commit()
    await db.refresh(pr)

    order = await db.get(Order, pr.order_id)
    return ProductionResponse(**_to_response(pr, order.customer_name if order else None))


@router.patch("/{pr_id}/status", response_model=ProductionResponse)
async def update_production_status(
    pr_id: uuid.UUID,
    body: ProductionStatusUpdate,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    pr = await db.get(ProductionRequest, pr_id)
    if not pr or pr.tenant_id != user.tenant_id:  # tenant_id 필터
        raise HTTPException(status_code=404, detail="생산의뢰서를 찾을 수 없습니다")

    allowed = VALID_STATUS_TRANSITIONS.get(pr.status, set())
    if body.status not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"'{pr.status}' 상태에서 '{body.status}'로 변경할 수 없습니다",
        )

    pr.status = body.status
    await db.commit()
    await db.refresh(pr)

    order = await db.get(Order, pr.order_id)
    return ProductionResponse(**_to_response(pr, order.customer_name if order else None))


@router.get("/{pr_id}/download")
async def download_production_excel(
    pr_id: uuid.UUID,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    pr = await db.get(ProductionRequest, pr_id)
    if not pr or pr.tenant_id != user.tenant_id:  # tenant_id 필터
        raise HTTPException(status_code=404, detail="생산의뢰서를 찾을 수 없습니다")

    order = await db.get(Order, pr.order_id)
    confirmed = order.confirmed_data or {} if order else {}

    excel_bytes = build_production_request({
        "request_number": pr.request_number,
        "customer_name": order.customer_name if order else "",
        "part_number": confirmed.get("part_number", ""),
        "quantity": pr.adjusted_quantity or pr.quantity,
        "production_start_date": pr.production_start_date,
        "production_end_date": pr.production_end_date,
        "delivery_date": pr.adjusted_delivery_date or pr.production_end_date,
        "delivery_location": confirmed.get("delivery_location", ""),
    })

    filename = f"{pr.request_number or pr_id}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
