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
from services import pdf_service, excel_service
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
    fname = file.filename.lower()
    is_pdf  = fname.endswith(".pdf")
    is_xlsx = fname.endswith(".xlsx")
    is_xls  = fname.endswith(".xls")

    if not (is_pdf or is_xlsx or is_xls):
        raise HTTPException(status_code=400, detail="PDF 또는 Excel(.xlsx, .xls) 파일만 지원합니다")

    file_bytes = await file.read()

    # 1단계: 텍스트 추출 (PDF: pdfplumber / Excel: openpyxl or xlrd)
    if is_pdf:
        raw_text = pdf_service.extract_text(file_bytes)
        if pdf_service.is_scan_pdf(raw_text):
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "SCAN_PDF",
                    "message": "스캔 PDF는 자동 파싱이 불가합니다. 수동 입력 폼을 이용해주세요.",
                },
            )
    else:
        raw_text = excel_service.extract_text_from_excel(file_bytes, file.filename)

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
    # 텍스트 추출 실패 시 AI 호출 금지 (빈 입력 → 예시 데이터 오염 방지)
    if not raw_text or len(raw_text.strip()) < 20:
        order.parse_status = "failed"
        await db.commit()
        await db.refresh(order)
        raise HTTPException(
            status_code=422,
            detail={"code": "EMPTY_TEXT", "message": "파일에서 텍스트를 추출할 수 없습니다. 스캔 PDF이거나 손상된 파일일 수 있습니다."},
        )
    try:
        parsed = await ai_provider.parse_document(raw_text, template_hint)
        order.parsed_data = parsed
        order.parse_status = "done"

        # 고객사명 추출: ship_to_name(납품처) 우선, 없으면 customer_code
        # ship_to_name이 실제 Invoice 수신처이므로 그룹핑 기준으로 사용
        fields = parsed.get("fields", {})
        ship_to = str(fields.get("ship_to_name", {}).get("value", "") or "").strip()
        customer_code = str(fields.get("customer_code", {}).get("value", "") or "").strip()
        name = ship_to or customer_code
        if name:
            # 대소문자 정규화 (동일 고객사가 다른 케이스로 저장되는 것 방지)
            order.customer_name = name.upper()
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
    if not order or order.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="발주서를 찾을 수 없습니다")

    order.confirmed_data = body.confirmed_data
    order.confirmed_by = user.id
    order.confirmed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(order)
    return order


# 신뢰도 기준 미달 필드의 한글 표시명
_FIELD_LABELS = {
    "customer_code":    "고객사코드",
    "part_number":      "품번",
    "description":      "품목설명",
    "quantity":         "수량",
    "unit":             "단위",
    "delivery_date":    "납기일",
    "delivery_location":"납품지",
    "po_number":        "PO번호",
    "ship_to_name":     "납품처명",
    "unit_price":       "단가",
}
_CONFIDENCE_THRESHOLD = 0.90


@router.post("/{order_id}/auto-confirm")
async def auto_confirm_order(
    order_id: uuid.UUID,
    user: User = Depends(require_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    """
    ParseReview 없이 parsed_data를 그대로 confirmed_data로 저장.
    신뢰도 낮은 필드는 경고 목록으로 반환 (생산의뢰서 생성은 차단하지 않음).
    """
    from datetime import datetime, timezone

    order = await db.get(Order, order_id)
    if not order or order.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="발주서를 찾을 수 없습니다")

    if not order.parsed_data:
        raise HTTPException(status_code=422, detail="파싱 결과가 없습니다. 파싱 상태를 확인하세요.")

    fields = order.parsed_data.get("fields", {})
    confirmed_data: dict = {}
    warnings: list[dict] = []

    for field_name, field_data in fields.items():
        if not isinstance(field_data, dict):
            continue
        value      = field_data.get("value")
        confidence = float(field_data.get("confidence", 1.0))

        confirmed_data[field_name] = value if value is not None else ""

        if confidence < _CONFIDENCE_THRESHOLD:
            warnings.append({
                "field":      field_name,
                "label":      _FIELD_LABELS.get(field_name, field_name),
                "confidence": round(confidence, 2),
                "value":      str(value) if value is not None else "(없음)",
            })

    # parse_status 실패 시에도 경고로 기록
    if order.parse_status == "failed":
        warnings.append({
            "field":      "parse_status",
            "label":      "AI 파싱",
            "confidence": 0.0,
            "value":      "파싱 실패 — 일부 필드가 누락될 수 있습니다",
        })

    order.confirmed_data = confirmed_data
    order.confirmed_by   = user.id
    order.confirmed_at   = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(order)

    return {"order_id": str(order.id), "warnings": warnings}
