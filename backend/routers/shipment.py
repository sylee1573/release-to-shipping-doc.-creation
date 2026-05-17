import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.tenant_guard import require_active_tenant
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


@router.get("/", response_model=list[ShipmentResponse])
async def list_shipment_docs(
    doc_type: str | None = Query(None, description="invoice 또는 packing_list"),
    production_request_id: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ShipmentDoc)
        .where(ShipmentDoc.tenant_id == user.tenant_id)  # tenant_id 필터
        .order_by(ShipmentDoc.created_at.desc())
        .offset(offset)
        .limit(limit)
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
    if not doc or doc.tenant_id != user.tenant_id:  # tenant_id 필터
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

    pr = await db.get(ProductionRequest, body.production_request_id)
    if not pr or pr.tenant_id != user.tenant_id:  # tenant_id 필터
        raise HTTPException(status_code=404, detail="생산의뢰서를 찾을 수 없습니다")

    doc = ShipmentDoc(
        tenant_id=user.tenant_id,
        production_request_id=pr.id,
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
    if not doc or doc.tenant_id != user.tenant_id:  # tenant_id 필터
        raise HTTPException(status_code=404, detail="선적서류를 찾을 수 없습니다")

    pr = await db.get(ProductionRequest, doc.production_request_id)
    order = await db.get(Order, pr.order_id) if pr else None
    confirmed = (order.confirmed_data or {}) if order else {}

    data = {
        "doc_number": doc.doc_number,
        "customer_name": order.customer_name if order else "",
        "part_number": confirmed.get("part_number", ""),
        "quantity": (pr.adjusted_quantity or pr.quantity) if pr else "",
        "unit": confirmed.get("unit", "EA"),
        "delivery_location": confirmed.get("delivery_location", ""),
    }

    excel_bytes = build_invoice(data) if doc.doc_type == "invoice" else build_packing_list(data)
    filename = f"{doc.doc_number or doc_id}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
