import io
import logging
from datetime import date
from pathlib import Path

import openpyxl
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

logger = logging.getLogger(__name__)

# KCR26-06.xlsx — IN(Invoice) + PA(Packing List) 시트가 실제 양식 레이아웃 보유
TEMPLATE_PATH = Path(__file__).parent.parent.parent / "ship doc  ex" / "KCR26-06.xlsx"

SENDER_NAME = "KYUNG CHANG PRECISION IND. CO., LTD."
SENDER_ADDRESS = "149 Gukgasandan-daero 33-gil, Guji-myeon, Dalseong-gun, Daegu"
SENDER_TEL = "82-53-589-0133"
SENDER_FAX = "82-53-582-1786"


# ─── Style helpers (생산의뢰서 코드 생성용) ───────────────────────────

def _side(style="thin"):
    return Side(style=style)


def _border(left="thin", right="thin", top="thin", bottom="thin"):
    return Border(
        left=_side(left), right=_side(right), top=_side(top), bottom=_side(bottom)
    )


def _thin():
    return _border()


def _set(ws, row, col, value, bold=False, size=10, align="left", valign="center",
         border=None, fill_color=None, wrap=False):
    cell = ws.cell(row=row, column=col, value=value)
    cell.font = Font(bold=bold, size=size, name="Arial")
    cell.alignment = Alignment(horizontal=align, vertical=valign, wrap_text=wrap)
    if border:
        cell.border = border
    if fill_color:
        cell.fill = PatternFill("solid", fgColor=fill_color)
    return cell


def _col_widths(ws, widths: dict):
    for col_letter, w in widths.items():
        ws.column_dimensions[col_letter].width = w


# ─── 공통 헬퍼 ────────────────────────────────────────────────────────

def _address_lines(ship_to: str, delivery_location: str, max_lines: int = 8) -> list[str]:
    lines = []
    if ship_to:
        lines.append(ship_to)
    if delivery_location:
        for part in delivery_location.replace("\n", ",").split(","):
            part = part.strip()
            if part:
                lines.append(part)
    return lines[:max_lines]


def _calc_amounts(data: dict):
    """(qty_num, up_num, extended) 반환. 단가 없으면 up_num·extended는 빈 문자열."""
    qty = data.get("quantity", 0)
    unit_price = data.get("unit_price")
    try:
        qty_num = int(qty)
    except (ValueError, TypeError):
        qty_num = qty

    if unit_price is None:
        return qty_num, "", ""
    try:
        up_num = float(unit_price)
        extended = round(qty_num * up_num, 2) if isinstance(qty_num, int) else ""
    except (ValueError, TypeError):
        return qty_num, "", ""
    return qty_num, up_num, extended


def _keep_only(wb, sheet_name: str):
    """지정 시트 하나만 남기고 나머지 삭제."""
    for sname in list(wb.sheetnames):
        if sname != sheet_name:
            wb.remove(wb[sname])


def _to_bytes(wb) -> bytes:
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ─── 생산의뢰서 (내부 문서 — 코드 기반 유지) ────────────────────────

def build_production_request(data: dict) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "생산의뢰서"

    ws.merge_cells("A1:F1")
    _set(ws, 1, 1, "생산의뢰서", bold=True, size=16, align="center")
    ws.row_dimensions[1].height = 36

    ws.merge_cells("A2:F2")
    _set(ws, 2, 1, SENDER_NAME, size=10, align="center")
    ws.row_dimensions[2].height = 18
    ws.row_dimensions[3].height = 6

    rows = [
        ("의뢰서 번호",      data.get("request_number", "")),
        ("발주처 (고객사)",   data.get("customer_name", "")),
        ("품번 (P/N)",       data.get("part_number", "")),
        ("품목 설명",        data.get("description", "")),
        ("생산 수량",        f"{data.get('quantity', '')} EA"),
        ("생산 시작일",      str(data.get("production_start_date", ""))),
        ("생산 완료일",      str(data.get("production_end_date", ""))),
        ("고객 납기일",      str(data.get("delivery_date", ""))),
        ("납품처",           data.get("delivery_location", "")),
        ("발주번호 (P.O.#)", data.get("po_number", "")),
        ("콜번호 (RAN#)",    data.get("ran_number", "")),
    ]

    for i, (label, value) in enumerate(rows, start=4):
        ws.row_dimensions[i].height = 20
        _set(ws, i, 1, label, bold=True, size=10, border=_thin(), fill_color="E8F4FD")
        ws.merge_cells(f"B{i}:F{i}")
        _set(ws, i, 2, value, size=10, border=_thin())

    history = data.get("change_history", [])
    if history:
        r = len(rows) + 5
        ws.merge_cells(f"A{r}:F{r}")
        _set(ws, r, 1, "변경 이력", bold=True, size=10, border=_thin(), fill_color="FFF2CC")
        r += 1
        for h in history:
            ws.merge_cells(f"A{r}:F{r}")
            txt = (
                f"[{h.get('changed_at','')[:10]}] {h.get('field','')}:"
                f" {h.get('before','')} → {h.get('after','')}  ({h.get('reason','')})"
            )
            _set(ws, r, 1, txt, size=9, border=_thin())
            r += 1

    _col_widths(ws, {"A": 22, "B": 18, "C": 15, "D": 15, "E": 15, "F": 15})
    return _to_bytes(wb)


# ─── Commercial Invoice (KCR26-06 IN 시트 기반) ───────────────────────

def build_invoice(data: dict) -> bytes:
    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(
            f"Invoice 양식 파일을 찾을 수 없습니다: {TEMPLATE_PATH}\n"
            "프로젝트 루트의 'ship doc  ex/KCR26-06.xlsx' 파일이 필요합니다."
        )

    wb = load_workbook(TEMPLATE_PATH)
    ws = wb["IN"]

    # 서류 번호 / 날짜
    ws["H2"] = data.get("doc_number", "")
    ws["K2"] = date.today().strftime("%Y-%m-%d")

    # 납품처 (수신처) — 행 4~11
    addr = _address_lines(
        data.get("ship_to_name", data.get("customer_name", "")),
        data.get("delivery_location", ""),
    )
    for i, row_num in enumerate(range(4, 12)):
        ws.cell(row=row_num, column=1).value = addr[i] if i < len(addr) else ""

    # SA# / Tax ID / 최종 목적지
    ws["I16"] = f"  SA# : {data.get('po_number', '')}"
    ws["I18"] = f"  Tax ID : {data.get('tax_id', '')}" if data.get("tax_id") else ""
    ws["D18"] = data.get("final_destination", "")

    # 데이터 행 (row 29)
    qty_num, up_num, extended = _calc_amounts(data)
    ws["A29"] = data.get("part_number", "")
    ws["E29"] = data.get("description", "")
    ws["H29"] = qty_num
    ws["J29"] = up_num if up_num else ""
    ws["K29"] = extended if extended != "" else ""
    ws["M29"] = data.get("po_number", "")
    ws["N29"] = data.get("ran_number", "")

    # 합계 행 (row 30)
    ws["A30"] = "TOTAL"
    ws["H30"] = qty_num
    ws["K30"] = extended if extended != "" else ""

    _keep_only(wb, "IN")
    return _to_bytes(wb)


# ─── Packing List (KCR26-06 PA 시트 기반) ────────────────────────────

def build_packing_list(data: dict) -> bytes:
    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(
            f"Packing List 양식 파일을 찾을 수 없습니다: {TEMPLATE_PATH}\n"
            "프로젝트 루트의 'ship doc  ex/KCR26-06.xlsx' 파일이 필요합니다."
        )

    wb = load_workbook(TEMPLATE_PATH)
    ws = wb["PA"]

    # 서류 번호 / 날짜
    ws["H2"] = data.get("doc_number", "")
    ws["K2"] = date.today().strftime("%Y-%m-%d")

    # 납품처 — 행 4~11
    addr = _address_lines(
        data.get("ship_to_name", data.get("customer_name", "")),
        data.get("delivery_location", ""),
    )
    for i, row_num in enumerate(range(4, 12)):
        ws.cell(row=row_num, column=1).value = addr[i] if i < len(addr) else ""

    # SA# / Tax ID / 최종 목적지
    ws["H16"] = f"  SA# : {data.get('po_number', '')}"
    ws["H18"] = f"  Tax ID : {data.get('tax_id', '')}" if data.get("tax_id") else ""
    ws["D18"] = data.get("final_destination", "")

    # 박스/중량 계산
    qty = data.get("quantity", 0)
    pcs_per_box = data.get("pcs_per_box") or 360
    net_w = data.get("net_weight_per_pc") or 0
    try:
        qty_num = int(qty)
        box_count = -(-qty_num // int(pcs_per_box))
        net_total = round(float(net_w) * qty_num, 3) if net_w else ""
        gross_total = round(float(net_total) * 1.023, 3) if net_total != "" else ""
    except (ValueError, TypeError):
        qty_num = qty
        box_count = ""
        net_total = ""
        gross_total = ""

    # 데이터 행 (row 29)
    ws["A29"] = data.get("part_number", "")
    ws["E29"] = data.get("description", "")
    ws["H29"] = qty_num
    ws["J29"] = box_count
    ws["K29"] = net_total if net_total != "" else ""
    ws["L29"] = gross_total if gross_total != "" else ""
    ws["M29"] = ""  # CBM — 팔레트 치수 필요, 추후 구현
    ws["N29"] = data.get("po_number", "")
    ws["O29"] = data.get("ran_number", "")

    # 합계 행 (row 30)
    ws["A30"] = "TOTAL"
    ws["H30"] = qty_num
    ws["J30"] = box_count
    ws["K30"] = net_total if net_total != "" else ""
    ws["L30"] = gross_total if gross_total != "" else ""

    _keep_only(wb, "PA")
    return _to_bytes(wb)
