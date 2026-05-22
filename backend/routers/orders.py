import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import settings
from database import get_db
from middleware.auth import get_current_user
from middleware.tenant_guard import require_active_tenant
from models.order import Order
from models.user import User
from schemas.order import ConfirmOrderRequest, OrderResponse
from services import pdf_service
from services.ai_service import ai_provider
from models.parsing_template import ParsingTemplate

router = APIRouter(tags=["orders"])


@router.get("/", response_model=list[OrderResponse])
async def list_orders(
    parse_status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Order)
        .where(Order.tenant_id == user.tenant_id)  # tenant_id 필터
        .order_by(Order.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if parse_status:
        stmt = stmt.where(Order.parse_status == parse_status)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/upload", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def upload_order(
    file: UploadFile = File(...),
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    """발주서 파일 업로드 + 파싱 시작. 10초 이내 완료 목표."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF 파일만 지원합니다")

    file_bytes = await file.read()

    # 1단계: pdfplumber 텍스트 추출
    raw_text = pdf_service.extract_text(file_bytes)
    if pdf_service.is_scan_pdf(raw_text):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "SCAN_PDF",
                "message": "스캔 PDF는 자동 파싱이 불가합니다. 수동 입력 폼을 이용해주세요.",
            },
        )

    # 파일 저장 (테넌트 디렉토리 분리)
    upload_dir = Path(settings.UPLOAD_DIR) / str(user.tenant_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_id = str(uuid.uuid4())
    file_path = upload_dir / f"{file_id}_{file.filename}"
    file_path.write_bytes(file_bytes)

    # DB에 pending 상태로 저장
    order = Order(
        tenant_id=user.tenant_id,
        file_name=file.filename,
        file_path=str(file_path),
        parse_status="processing",
        raw_text=raw_text,
    )
    db.add(order)
    await db.flush()

    # 양식 템플릿 조회 (있으면 파싱 힌트로 활용)
    template_result = await db.execute(
        select(ParsingTemplate)
        .where(ParsingTemplate.tenant_id == user.tenant_id, ParsingTemplate.is_active == True)
        .limit(1)
    )
    template = template_result.scalar_one_or_none()
    template_hint = template.template_description or "" if template else ""

    # 2단계: AI 파싱 (텍스트만 전달 — 토큰 최소화)
    import traceback, logging
    try:
        parsed = await ai_provider.parse_document(raw_text, template_hint)
        order.parsed_data = parsed
        order.parse_status = "done"

        # 고객사명 추출
        customer_code = parsed.get("fields", {}).get("customer_code", {}).get("value")
        if customer_code:
            order.customer_name = str(customer_code)
    except Exception as e:
        logging.error(f"[parse_error] {type(e).__name__}: {e}\n{traceback.format_exc()}")
        order.parse_status = "failed"

    await db.commit()
    await db.refresh(order)
    return order


@router.get("/{order_id}/parse-result", response_model=OrderResponse)
async def get_parse_result(
    order_id: uuid.UUID,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != user.tenant_id:  # tenant_id 필터
        raise HTTPException(status_code=404, detail="발주서를 찾을 수 없습니다")
    return order


@router.post("/{order_id}/confirm", response_model=OrderResponse)
async def confirm_order(
    order_id: uuid.UUID,
    body: ConfirmOrderRequest,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone

    order = await db.get(Order, order_id)
    if not order or order.tenant_id != user.tenant_id:  # tenant_id 필터
        raise HTTPException(status_code=404, detail="발주서를 찾을 수 없습니다")

    order.confirmed_data = body.confirmed_data
    order.confirmed_by = user.id
    order.confirmed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(order)
    return order
