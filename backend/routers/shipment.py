import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.tenant_guard import require_active_tenant
from models.customer_profile import CustomerProfile
from models.item_master import ItemMaster
from models.order import Order
from models.production_request import ProductionRequest
from models.shipment_doc import ShipmentDoc
from models.user import User
from schemas.shipment import ShipmentCreate, ShipmentResponse
from services.excel_builder import build_invoice, build_packing_list

router = APIRouter(tags=["shipment"])


async def _generate_doc_number(db: AsyncSession, doc_type: str) -> str:
    today = date.today()
    ym = today.strftime("%Y%m")
    prefix = "INV" if doc_type == "invoice" else "PKL"
    full_prefix = f"{prefix}-{ym}-"
    stmt = select(func.count()).where(ShipmentDoc.doc_number.like(f"{full_prefix}%"))
    result = await db.execute(stmt)
    count = result.scalar_one()
    return f"{full_prefix}{str(count + 1).zfill(4)}"


async def _get_item_for_pr(db, tenant_id, part_number) -> ItemMaster | None:
    result = await db.execute(
        select(ItemMaster).where(
            ItemMaster.tenant_id == tenant_id,
            ItemMaster.part_number == part_number,
            ItemMaster.is_active == True,
        )
    )
    return result.scalar_one_or_none()


@router.get("/", response_model=list[ShipmentResponse])
async def list_shipment_docs(
    doc_type: str | None = Query(None),
    production_request_id: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ShipmentDoc)
        .where(ShipmentDoc.tenant_id == user.tenant_id)
        .order_by(ShipmentDoc.created_at.desc())
        .offset(offset).limit(limit)
    )
    if doc_type:
        stmt = stmt.where(ShipmentDoc.doc_type == doc_type)
    if production_request_id:
        stmt = stmt.where(ShipmentDoc.production_request_id == production_request_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{doc_id}", response_model=ShipmentResponse)
async def get_shipment_doc(
    doc_id: uuid.UUID,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(ShipmentDoc, doc_id)
    if not doc or doc.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="선적서류를 찾을 수 없습니다")
    return doc


@router.post("/", response_model=ShipmentResponse, status_code=201)
async def create_shipment_doc(
    body: ShipmentCreate,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    if body.doc_type not in ("invoice", "packing_list"):
        raise HTTPException(status_code=400, detail="doc_type은 'invoice' 또는 'packing_list'여야 합니다")

    pr_ids = body.production_request_ids  # validator에서 보장 (최소 1개)

    # 모든 PR 권한 확인
    for pr_id in pr_ids:
        pr = await db.get(ProductionRequest, pr_id)
        if not pr or pr.tenant_id != user.tenant_id:
            raise HTTPException(status_code=404, detail=f"생산의뢰서 {pr_id}를 찾을 수 없습니다")

    doc = ShipmentDoc(
        tenant_id=user.tenant_id,
        production_request_id=pr_ids[0],          # 대표 PR (FK 제약)
        pr_ids=[str(pid) for pid in pr_ids],      # 전체 목록 (JSONB)
        doc_type=body.doc_type,
        doc_number=await _generate_doc_number(db, body.doc_type),
        issued_at=datetime.now(timezone.utc),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/{doc_id}/download")
async def download_shipment_doc(
    doc_id: uuid.UUID,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(ShipmentDoc, doc_id)
    if not doc or doc.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="선적서류를 찾을 수 없습니다")

    # 포함된 PR 목록 (단일 or 복수)
    all_pr_ids = [uuid.UUID(pid) for pid in doc.pr_ids] if doc.pr_ids else [doc.production_request_id]

    # 대표 PR로 헤더 데이터 구성
    first_pr   = await db.get(ProductionRequest, all_pr_ids[0])
    first_order = await db.get(Order, first_pr.order_id) if first_pr else None
    first_confirmed = (first_order.confirmed_data or {}) if first_order else {}
    customer_name = first_order.customer_name or "" if first_order else ""

    # 고객사 프로필
    cp_result = await db.execute(
        select(CustomerProfile).where(
            CustomerProfile.tenant_id == user.tenant_id,
            CustomerProfile.customer_name == customer_name,
            CustomerProfile.is_active == True,
        )
    )
    cp = cp_result.scalar_one_or_none()

    # 공통 헤더 (선적일자는 대표 PR 기준)
    sailing_date = str(first_pr.sailing_date) if first_pr and first_pr.sailing_date else ""
    header = {
        "doc_number":        doc.doc_number,
        "customer_name":     customer_name,
        "ship_to_name":      (cp.ship_to_name if cp else None) or first_confirmed.get("ship_to_name", customer_name),
        "delivery_location": (cp.ship_to_address if cp else None) or first_confirmed.get("delivery_location", ""),
        "final_destination": (cp.final_destination if cp else None) or first_confirmed.get("final_destination", ""),
        "sailing_date":      sailing_date,
        "po_number":         first_confirmed.get("po_number", ""),
    }

    # 품목별 라인 아이템 구성
    items = []
    for pr_id in all_pr_ids:
        pr    = await db.get(ProductionRequest, pr_id)
        order = await db.get(Order, pr.order_id) if pr else None
        conf  = (order.confirmed_data or {}) if order else {}
        pn    = str(conf.get("part_number", ""))
        item_master = await _get_item_for_pr(db, user.tenant_id, pn)

        items.append({
            "part_number":      pn,
            "description":      (item_master.description if item_master and item_master.description else None) or conf.get("description", ""),
            "quantity":         (pr.adjusted_quantity or pr.quantity) if pr else "",
            "unit_price":       (float(item_master.unit_price) if item_master and item_master.unit_price else None) or conf.get("unit_price"),
            "net_weight_per_pc": float(item_master.net_weight_per_pc) if item_master and item_master.net_weight_per_pc else None,
            "pcs_per_box":      item_master.pcs_per_box if item_master else None,
            "po_number":        conf.get("po_number", header["po_number"]),
            "ran_number":       pr.ran_number if pr and pr.ran_number else "",
        })

    excel_bytes = build_invoice(header, items) if doc.doc_type == "invoice" else build_packing_list(header, items)
    filename = f"{doc.doc_number or doc_id}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
