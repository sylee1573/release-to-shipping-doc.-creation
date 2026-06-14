import uuid
from datetime import date, datetime, timezone, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.tenant_guard import require_active_tenant
from models.customer_profile import CustomerProfile
from models.holiday_calendar import HolidayCalendar
from models.item_master import ItemMaster
from models.order import Order
from models.production_request import ProductionRequest
from models.shipment_doc import ShipmentDoc
from models.user import User
from schemas.common import MessageResponse
from schemas.production import (
    ProductionCreate,
    ProductionResponse,
    ProductionStatusUpdate,
    ProductionUpdate,
)
from services.excel_builder import build_production_request

# 주의 시작(월요일) 계산 헬퍼
def _week_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())

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


async def _get_customer_profile(db, tenant_id, customer_name):
    """고객사 프로필 조회 — 없으면 기본값 반환."""
    cp_result = await db.execute(
        select(CustomerProfile).where(
            CustomerProfile.tenant_id == tenant_id,
            CustomerProfile.customer_name == customer_name,
            CustomerProfile.is_active == True,
        )
    )
    return cp_result.scalar_one_or_none()


def _calc_dates(delivery_date: date, cp) -> tuple[date, date, date]:
    """(sailing_date, production_end, production_start) 계산."""
    date_type          = cp.date_type          if cp else "arrival"
    sea_transit_days   = cp.sea_transit_days   if cp else 21   # 고객프로필 없을 때 해상운송 기본값 21일
    shipping_prep_days = cp.shipping_prep_days if cp else 2
    lead_time_days     = cp.production_lead_days if cp else 7

    if date_type == "arrival":
        # 도착일 기준: 도착일 → 선적일 → 생산완료일 → 생산시작일
        sailing_date    = delivery_date - timedelta(days=sea_transit_days)
        production_end  = sailing_date  - timedelta(days=shipping_prep_days)
    else:
        # 완료일 기준: 완료일 = 생산완료일, 선적일은 그 이후
        production_end  = delivery_date
        sailing_date    = production_end + timedelta(days=shipping_prep_days)

    production_start = production_end - timedelta(days=lead_time_days)
    return sailing_date, production_end, production_start


def _to_response(pr: ProductionRequest, customer_name: str | None = None,
                 part_number: str | None = None) -> dict:
    return {
        "id": pr.id,
        "tenant_id": pr.tenant_id,
        "order_id": pr.order_id,
        "request_number": pr.request_number,
        "customer_name": customer_name,
        "part_number": part_number,
        "sailing_date": pr.sailing_date,
        "production_start_date": pr.production_start_date,
        "production_end_date": pr.production_end_date,
        "quantity": pr.quantity,
        "adjusted_quantity": pr.adjusted_quantity,
        "adjusted_delivery_date": pr.adjusted_delivery_date,
        "ran_number":      pr.ran_number,
        "weekly_schedule": pr.weekly_schedule or [],
        "change_history":  pr.change_history or [],
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
        select(ProductionRequest, Order.customer_name, Order.confirmed_data)
        .join(Order, ProductionRequest.order_id == Order.id)
        .where(ProductionRequest.tenant_id == user.tenant_id)
    )
    if status:
        stmt = stmt.where(ProductionRequest.status == status)
    stmt = stmt.order_by(ProductionRequest.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return [
        ProductionResponse(**_to_response(
            pr, cname,
            str((conf or {}).get("part_number", "")) if conf else "",
        ))
        for pr, cname, conf in result.all()
    ]


@router.get("/{pr_id}", response_model=ProductionResponse)
async def get_production_request(
    pr_id: uuid.UUID,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ProductionRequest, Order.customer_name, Order.confirmed_data)
        .join(Order, ProductionRequest.order_id == Order.id)
        .where(ProductionRequest.id == pr_id, ProductionRequest.tenant_id == user.tenant_id)
    )
    row = (await db.execute(stmt)).first()
    if not row:
        raise HTTPException(status_code=404, detail="생산의뢰서를 찾을 수 없습니다")
    pr, customer_name, conf = row
    pn = str((conf or {}).get("part_number", "")) if conf else ""
    return ProductionResponse(**_to_response(pr, customer_name, pn))


@router.post("/", response_model=ProductionResponse, status_code=201)
async def create_production_request(
    body: ProductionCreate,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    order = await db.get(Order, body.order_id)
    if not order or order.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="발주서를 찾을 수 없습니다")

    confirmed     = order.confirmed_data or {}
    part_number   = str(confirmed.get("part_number", ""))
    customer_name = order.customer_name or ""

    # 수량
    try:
        qty = body.quantity if body.quantity is not None else int(float(confirmed.get("quantity", 1)))
    except (TypeError, ValueError):
        qty = 1

    # 납기일
    if body.delivery_date is not None:
        delivery_date = body.delivery_date
    else:
        try:
            delivery_date = date.fromisoformat(str(confirmed.get("delivery_date", "")))
        except (ValueError, TypeError):
            raise HTTPException(status_code=422, detail="납기일을 입력하거나 발주서에 납기일이 있어야 합니다")

    # 고객사 프로필 → 날짜 역산
    cp = await _get_customer_profile(db, user.tenant_id, customer_name)
    sailing_date, production_end, production_start = _calc_dates(delivery_date, cp)

    # 품번별 RAN 자동부여
    im_result = await db.execute(
        select(ItemMaster).where(
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
            tenant_id=user.tenant_id, customer_name=customer_name,
            part_number=part_number, ran_last=10,
        )
        db.add(item)

    pr = ProductionRequest(
        tenant_id=user.tenant_id,
        order_id=body.order_id,
        request_number=await _generate_request_number(db, user.tenant_id),
        sailing_date=sailing_date,
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
    if not pr or pr.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="생산의뢰서를 찾을 수 없습니다")

    order = await db.get(Order, pr.order_id)
    cp = await _get_customer_profile(db, user.tenant_id, order.customer_name if order else "")

    now_iso = datetime.now(timezone.utc).isoformat()
    new_entries = []

    if body.adjusted_quantity is not None:
        new_entries.append({
            "changed_at": now_iso, "changed_by": str(user.id),
            "field": "quantity",
            "before": pr.adjusted_quantity if pr.adjusted_quantity is not None else pr.quantity,
            "after": body.adjusted_quantity, "reason": body.reason,
        })
        pr.adjusted_quantity = body.adjusted_quantity

    if body.adjusted_delivery_date is not None:
        prev = str(pr.adjusted_delivery_date or pr.production_end_date)
        new_entries.append({
            "changed_at": now_iso, "changed_by": str(user.id),
            "field": "delivery_date",
            "before": prev, "after": str(body.adjusted_delivery_date), "reason": body.reason,
        })
        pr.adjusted_delivery_date = body.adjusted_delivery_date
        sailing, prod_end, prod_start = _calc_dates(body.adjusted_delivery_date, cp)
        pr.sailing_date = sailing
        pr.production_end_date = prod_end
        pr.production_start_date = prod_start

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
    if not pr or pr.tenant_id != user.tenant_id:
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


@router.delete("/{pr_id}", response_model=MessageResponse)
async def delete_production_request(
    pr_id: uuid.UUID,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    pr = await db.get(ProductionRequest, pr_id)
    if not pr or pr.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="생산의뢰서를 찾을 수 없습니다")

    # 선적서류가 연결된 PR은 삭제 거부 (데이터 보호)
    cnt = await db.execute(
        select(func.count()).select_from(ShipmentDoc).where(
            ShipmentDoc.production_request_id == pr_id
        )
    )
    if cnt.scalar_one() > 0:
        raise HTTPException(
            status_code=409,
            detail="선적서류가 연결된 생산의뢰서는 삭제할 수 없습니다",
        )

    await db.delete(pr)
    await db.commit()
    return MessageResponse(message="삭제되었습니다")


@router.get("/{pr_id}/download")
async def download_production_excel(
    pr_id: uuid.UUID,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    pr = await db.get(ProductionRequest, pr_id)
    if not pr or pr.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="생산의뢰서를 찾을 수 없습니다")

    order = await db.get(Order, pr.order_id)
    confirmed = order.confirmed_data or {} if order else {}
    part_number = str(confirmed.get("part_number", ""))

    im_result = await db.execute(
        select(ItemMaster).where(
            ItemMaster.tenant_id == user.tenant_id,
            ItemMaster.part_number == part_number, ItemMaster.is_active == True,
        )
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
        "sailing_date": str(pr.sailing_date) if pr.sailing_date else "",
        "production_start_date": pr.production_start_date,
        "production_end_date": pr.production_end_date,
        "delivery_date": pr.adjusted_delivery_date or pr.production_end_date,
        "delivery_location": confirmed.get("delivery_location", ""),
        "po_number": confirmed.get("po_number", ""),
        "weekly_schedule": pr.weekly_schedule or [],
        "change_history":  pr.change_history or [],
    })

    filename = f"{pr.request_number or pr_id}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── 4주 롤링 생산계획 생성/갱신 ─────────────────────────────

class GenerateWeeklyBody(BaseModel):
    order_id: uuid.UUID


@router.post("/generate-weekly", response_model=ProductionResponse, status_code=200)
async def generate_weekly_plan(
    body: GenerateWeeklyBody,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    """
    SA 1건 → 생산의뢰서 1건 (4주 스케줄 포함) 생성 또는 갱신.
    동일 고객사+품번의 기존 PR이 있으면 weekly_schedule을 롤링 업데이트.
    """
    order = await db.get(Order, body.order_id)
    if not order or order.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="발주서를 찾을 수 없습니다")

    confirmed = order.confirmed_data or {}
    parsed   = order.parsed_data or {}
    part_number   = str(confirmed.get("part_number", ""))
    customer_name = order.customer_name or ""

    # SA 전체 납품 스케줄 추출 (delivery_schedule 필드)
    delivery_schedule = parsed.get("delivery_schedule", [])
    if not delivery_schedule:
        # fallback: confirmed_data의 delivery_date + quantity 로 1건 구성
        d = confirmed.get("delivery_date")
        q = confirmed.get("quantity")
        if d and q:
            delivery_schedule = [{"date": str(d), "quantity": int(float(str(q)))}]

    if not delivery_schedule:
        raise HTTPException(status_code=422, detail="SA 납품 스케줄을 찾을 수 없습니다. 발주서를 다시 확인하세요.")

    # 고객사 프로필
    cp = await _get_customer_profile(db, user.tenant_id, customer_name)

    # 휴무 캘린더 조회
    holiday_result = await db.execute(
        select(HolidayCalendar).where(
            HolidayCalendar.tenant_id == user.tenant_id,
            HolidayCalendar.customer_name.in_([customer_name, None]),
        )
    )
    holidays = {h.week_start_date: h.reason for h in holiday_result.scalars().all()}

    # 선적일 기준 4주 슬롯 구성
    # 슬롯 1 = "업로드(생성)일의 다음 주", 슬롯 4 = 다음 주 +3주
    # 이번 주 이하 선적(slot<1) 및 5주차+(slot>4)는 제외 → 일정 없으면 빈칸
    # 동일 선적주에 납품이 여러 건이면 수량 합산
    today         = date.today()
    anchor_monday = _week_monday(today) + timedelta(days=7)   # 다음 주 월요일 = 1주차

    slots_map: dict[date, dict] = {}

    for entry in sorted(delivery_schedule, key=lambda x: x["date"]):
        try:
            d_date = date.fromisoformat(entry["date"])
            qty    = int(entry["quantity"])
        except (ValueError, KeyError):
            continue

        sailing, prod_end, _ = _calc_dates(d_date, cp)
        sailing_week_mon = _week_monday(sailing)

        # 슬롯 번호: 다음 주 = 1, 그 다음 주 = 2, ... +3주 = 4
        slot_num = (sailing_week_mon - anchor_monday).days // 7 + 1
        if slot_num < 1 or slot_num > 4:
            continue

        if sailing_week_mon in slots_map:
            slots_map[sailing_week_mon]["quantity"] += qty
        else:
            week_start = _week_monday(d_date)
            is_hol     = week_start in holidays
            slots_map[sailing_week_mon] = {
                "slot":                slot_num,
                "week_start":          str(week_start),
                "sailing_week_monday": str(sailing_week_mon),
                "delivery_date":       str(d_date),
                "quantity":            qty,
                "sailing_date":        str(sailing),
                "production_end":      str(prod_end),
                "is_holiday":          is_hol,
                "holiday_reason":      holidays.get(week_start),
            }

    slots = sorted(slots_map.values(), key=lambda s: s["slot"])

    if not slots:
        raise HTTPException(status_code=422, detail="유효한 미래 납품 일정이 없습니다.")

    slot1 = slots[0]

    # 동일 고객사+품번의 기존 활성 PR 조회
    existing_result = await db.execute(
        select(ProductionRequest)
        .join(Order, ProductionRequest.order_id == Order.id)
        .where(
            ProductionRequest.tenant_id == user.tenant_id,
            ProductionRequest.status.notin_(["done"]),
            Order.customer_name == customer_name,
        )
    )
    # part_number 필터: confirmed_data에서 확인
    existing_pr = None
    for pr_candidate in existing_result.scalars().all():
        candidate_order = await db.get(Order, pr_candidate.order_id)
        if candidate_order:
            candidate_conf = candidate_order.confirmed_data or {}
            if str(candidate_conf.get("part_number", "")) == part_number:
                existing_pr = pr_candidate
                break

    now_iso = datetime.now(timezone.utc).isoformat()

    if existing_pr:
        # 롤링 업데이트: 기존 PR의 weekly_schedule 갱신
        old_schedule = existing_pr.weekly_schedule or []
        new_entries = []

        # 슬롯별 수량 변화 기록
        old_by_week = {s["week_start"]: s for s in old_schedule}
        for s in slots:
            old = old_by_week.get(s["week_start"])
            if old and old["quantity"] != s["quantity"]:
                new_entries.append({
                    "changed_at": now_iso,
                    "changed_by": "system",
                    "field":      f"quantity_slot{s['slot']}({s['week_start']})",
                    "before":     old["quantity"],
                    "after":      s["quantity"],
                    "reason":     "SA 업데이트",
                })

        existing_pr.order_id        = order.id  # 최신 SA로 갱신
        existing_pr.weekly_schedule = slots
        existing_pr.quantity        = slot1["quantity"]
        existing_pr.sailing_date    = date.fromisoformat(slot1["sailing_date"])
        existing_pr.production_end_date   = date.fromisoformat(slot1["production_end"])
        existing_pr.production_start_date = date.fromisoformat(slot1["production_end"]) - timedelta(
            days=cp.production_lead_days if cp else 7
        )
        if new_entries:
            existing_pr.change_history = (existing_pr.change_history or []) + new_entries

        await db.commit()
        await db.refresh(existing_pr)
        return ProductionResponse(**_to_response(existing_pr, customer_name))

    else:
        # 신규 PR 생성
        im_result = await db.execute(
            select(ItemMaster).where(
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
                tenant_id=user.tenant_id, customer_name=customer_name,
                part_number=part_number, ran_last=10,
            )
            db.add(item)

        pr = ProductionRequest(
            tenant_id=user.tenant_id,
            order_id=order.id,
            request_number=await _generate_request_number(db, user.tenant_id),
            weekly_schedule=slots,
            quantity=slot1["quantity"],
            sailing_date=date.fromisoformat(slot1["sailing_date"]),
            production_end_date=date.fromisoformat(slot1["production_end"]),
            production_start_date=date.fromisoformat(slot1["production_end"]) - timedelta(
                days=cp.production_lead_days if cp else 7
            ),
            ran_number=new_ran,
            status="draft",
        )
        db.add(pr)
        await db.commit()
        await db.refresh(pr)
        return ProductionResponse(**_to_response(pr, customer_name))
