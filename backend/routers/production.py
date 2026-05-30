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
from models.customer_profile import CustomerProfile
from models.item_master import ItemMaster
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

VALID_STATUS_TRANSITIONS = {
    "draft":         {"confirmed"},
    "confirmed":     {"in_production", "draft"},
    "in_production": {"done", "confirmed"},
    "done":          set(),
}


async def _generate_request_number(db: AsyncSession, tenant_id: uuid.UUID) -> str:
    today = date.today()
    ym = today.strftime("%Y%m")
    prefix = f"PR-{ym}-"
    stmt = select(func.count()).where(ProductionRequest.request_number.like(f"{prefix}%"))
    result = await db.execute(stmt)
    count = result.scalar_one()
    return f"{prefix}{str(count + 1).zfill(4)}"


def _to_response(pr: ProductionRequest, customer_name: str | None = None) -> dict:
    return {
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
        "ran_number": pr.ran_number,
        "change_history": pr.change_history or [],
        "excel_path": pr.excel_path,
        "status": pr.status,
        "created_at": pr.created_at,
        "updated_at": pr.updated_at,
    }


@router.get("/", response_model=list[ProductionResponse])
async def list_production_requests(
    status: str | None = Query(None),
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

    confirmed = order.confirmed_data or {}
    part_number = str(confirmed.get("part_number", ""))
    customer_name = order.customer_name or ""

    # 수량: body 값 우선, 없으면 confirmed_data에서
    try:
        qty = body.quantity if body.quantity is not None else int(float(confirmed.get("quantity", 1)))
    except (TypeError, ValueError):
        qty = 1

    # 납기일: body 값 우선, 없으면 confirmed_data에서
    if body.delivery_date is not None:
        delivery_date = body.delivery_date
    else:
        try:
            delivery_date = date.fromisoformat(str(confirmed.get("delivery_date", "")))
        except (ValueError, TypeError):
            raise HTTPException(status_code=422, detail="납기일을 입력하거나 발주서에 납기일이 있어야 합니다")

    # 고객사 프로필 조회 → 납기 역산 설정
    cp_result = await db.execute(
        select(CustomerProfile)
        .where(
            CustomerProfile.tenant_id == user.tenant_id,
            CustomerProfile.customer_name == customer_name,
            CustomerProfile.is_active == True,
        )
    )
    cp = cp_result.scalar_one_or_none()

    date_type = cp.date_type if cp else "arrival"
    shipping_prep_days = cp.shipping_prep_days if cp else 2
    lead_time_days = cp.production_lead_days if cp else 7

    # 납기 역산
    if date_type == "arrival":
        # SA 날짜 = 고객 도착일 → 출하 준비일수 차감
        production_end = delivery_date - timedelta(days=shipping_prep_days)
    else:
        # SA 날짜 = 물건 완료일 → 그대로 사용
        production_end = delivery_date
    production_start = production_end - timedelta(days=lead_time_days)

    # 품번별 RAN 자동부여
    im_result = await db.execute(
        select(ItemMaster)
        .where(
            ItemMaster.tenant_id == user.tenant_id,
            ItemMaster.part_number == part_number,
            ItemMaster.is_active == True,
        )
    )
    item = im_result.scalar_one_or_none()

    if item:
        new_ran = item.ran_last + 10
        item.ran_last = new_ran
    else:
        new_ran = 10
        item = ItemMaster(
            tenant_id=user.tenant_id,
            customer_name=customer_name,
            part_number=part_number,
            ran_last=10,
        )
        db.add(item)

    pr = ProductionRequest(
        tenant_id=user.tenant_id,
        order_id=body.order_id,
        request_number=await _generate_request_number(db, user.tenant_id),
        production_start_date=production_start,
        production_end_date=production_end,
        quantity=qty,
        ran_number=new_ran,
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

    # 납기 역산 설정 (수정 시에도 고객사 프로필 참조)
    order = await db.get(Order, pr.order_id)
    customer_name = order.customer_name if order else ""
    cp_result = await db.execute(
        select(CustomerProfile)
        .where(
            CustomerProfile.tenant_id == user.tenant_id,
            CustomerProfile.customer_name == customer_name,
            CustomerProfile.is_active == True,
        )
    )
    cp = cp_result.scalar_one_or_none()
    date_type = cp.date_type if cp else "arrival"
    shipping_prep_days = cp.shipping_prep_days if cp else 2
    lead_time_days = cp.production_lead_days if cp else 7

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
        prev = str(pr.adjusted_delivery_date or pr.production_end_date)
        new_entries.append({
            "changed_at": now_iso,
            "changed_by": str(user.id),
            "field": "delivery_date",
            "before": prev,
            "after": str(body.adjusted_delivery_date),
            "reason": body.reason,
        })
        pr.adjusted_delivery_date = body.adjusted_delivery_date
        new_end = (
            body.adjusted_delivery_date - timedelta(days=shipping_prep_days)
            if date_type == "arrival"
            else body.adjusted_delivery_date
        )
        pr.production_end_date = new_end
        pr.production_start_date = new_end - timedelta(days=lead_time_days)

    pr.change_history = (pr.change_history or []) + new_entries
    await db.commit()
    await db.refresh(pr)

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

    # 품목마스터에서 description 보완
    part_number = str(confirmed.get("part_number", ""))
    im_result = await db.execute(
        select(ItemMaster)
        .where(ItemMaster.tenant_id == user.tenant_id, ItemMaster.part_number == part_number, ItemMaster.is_active == True)
    )
    item = im_result.scalar_one_or_none()
    description = (item.description if item and item.description else None) or confirmed.get("description", "")

    excel_bytes = build_production_request({
        "request_number": pr.request_number,
        "customer_name": order.customer_name if order else "",
        "part_number": part_number,
        "description": description,
        "quantity": pr.adjusted_quantity or pr.quantity,
        "ran_number": pr.ran_number,
        "production_start_date": pr.production_start_date,
        "production_end_date": pr.production_end_date,
        "delivery_date": pr.adjusted_delivery_date or pr.production_end_date,
        "delivery_location": confirmed.get("delivery_location", ""),
        "po_number": confirmed.get("po_number", ""),
        "change_history": pr.change_history or [],
    })

    filename = f"{pr.request_number or pr_id}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
