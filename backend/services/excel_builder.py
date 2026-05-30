import io
import logging
import math
from datetime import date
from pathlib import Path

import openpyxl
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

logger = logging.getLogger(__name__)

TEMPLATE_PATH = Path(__file__).parent.parent.parent / "ship doc  ex" / "KCR26-06.xlsx"

SENDER_NAME = "KYUNG CHANG PRECISION IND. CO., LTD."
SENDER_ADDRESS = "149 Gukgasandan-daero 33-gil, Guji-myeon, Dalseong-gun, Daegu"
SENDER_TEL = "82-53-589-0133"
SENDER_FAX = "82-53-582-1786"


# ─── Style helpers (생산의뢰서용) ─────────────────────────────

def _side(style="thin"):
    return Side(style=style)

def _border(left="thin", right="thin", top="thin", bottom="thin"):
    return Border(left=_side(left), right=_side(right), top=_side(top), bottom=_side(bottom))

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


# ─── 공통 헬퍼 ────────────────────────────────────────────────

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


def _calc_item_amounts(item: dict):
    """(qty_num, up_num, extended) 반환. 단가 없으면 빈 문자열."""
    qty = item.get("quantity", 0)
    unit_price = item.get("unit_price")
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
    for sname in list(wb.sheetnames):
        if sname != sheet_name:
            wb.remove(wb[sname])

def _to_bytes(wb) -> bytes:
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _write_header(ws, sheet_type: str, header: dict):
    """IN(Invoice) 또는 PA(Packing List) 시트 공통 헤더 채우기."""
    ws["H2"] = header.get("doc_number", "")
    ws["K2"] = date.today().strftime("%Y-%m-%d")

    addr = _address_lines(
        header.get("ship_to_name", header.get("customer_name", "")),
        header.get("delivery_location", ""),
    )
    for i, row_num in enumerate(range(4, 12)):
        ws.cell(row=row_num, column=1).value = addr[i] if i < len(addr) else ""

    # 선적일자 (Row 22, "6. Sailing Date" 아래)
    ws["D22"] = header.get("sailing_date", "")

    if sheet_type == "invoice":
        ws["I16"] = f"  SA# : {header.get('po_number', '')}"
        ws["I18"] = f"  Tax ID : {header.get('tax_id', '')}" if header.get("tax_id") else ""
        ws["D18"] = header.get("final_destination", "")
    else:  # packing
        ws["H16"] = f"  SA# : {header.get('po_number', '')}"
        ws["H18"] = f"  Tax ID : {header.get('tax_id', '')}" if header.get("tax_id") else ""
        ws["D18"] = header.get("final_destination", "")


# ─── 생산의뢰서 (내부 문서 — 코드 기반) ─────────────────────

def build_production_request(data: dict) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "생산의뢰서"

    # 제목
    ws.merge_cells("A1:H1")
    _set(ws, 1, 1, "생산의뢰서 (4주 롤링 계획)", bold=True, size=16, align="center")
    ws.row_dimensions[1].height = 36
    ws.merge_cells("A2:H2")
    _set(ws, 2, 1, SENDER_NAME, size=10, align="center")
    ws.row_dimensions[2].height = 18
    ws.row_dimensions[3].height = 6

    # 기본 정보
    info_rows = [
        ("의뢰서 번호",      data.get("request_number", "")),
        ("발주처 (고객사)",   data.get("customer_name", "")),
        ("품번 (P/N)",       data.get("part_number", "")),
        ("품목 설명",        data.get("description", "")),
        ("발주번호 (P.O.#)", data.get("po_number", "")),
        ("내부 RAN#",        str(data.get("ran_number", ""))),
    ]
    for i, (label, value) in enumerate(info_rows, start=4):
        ws.row_dimensions[i].height = 20
        _set(ws, i, 1, label, bold=True, size=10, border=_thin(), fill_color="E8F4FD")
        ws.merge_cells(f"B{i}:H{i}")
        _set(ws, i, 2, value, size=10, border=_thin())

    # 4주 롤링 스케줄 테이블
    sched_start = 4 + len(info_rows) + 1
    ws.row_dimensions[sched_start - 1].height = 6

    # 헤더
    hdr = sched_start
    ws.row_dimensions[hdr].height = 22
    hdr_fill = "4472C4"
    for col, label in enumerate(["슬롯", "주간 시작일", "납품일", "생산수량(EA)", "선적 예정일", "생산완료일", "비고"], start=1):
        cell = ws.cell(row=hdr, column=col, value=label)
        cell.font = Font(bold=True, size=9, name="Arial", color="FFFFFF")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = _thin()
        cell.fill = PatternFill("solid", fgColor=hdr_fill)

    weekly = data.get("weekly_schedule") or []
    for si, slot in enumerate(weekly):
        r = hdr + 1 + si
        ws.row_dimensions[r].height = 18
        is_hol = slot.get("is_holiday", False)
        row_fill = "FFF2CC" if is_hol else None
        vals = [
            f"{slot.get('slot', si+1)}주차",
            slot.get("week_start", ""),
            slot.get("delivery_date", ""),
            "" if is_hol else slot.get("quantity", ""),
            "" if is_hol else slot.get("sailing_date", ""),
            "" if is_hol else slot.get("production_end", ""),
            slot.get("holiday_reason", "") if is_hol else "",
        ]
        for col, v in enumerate(vals, start=1):
            _set(ws, r, col, v, size=9, border=_thin(),
                 fill_color=row_fill, align="center" if col in (1, 4) else "left")

    # 변경이력
    history = data.get("change_history", [])
    if history:
        base = hdr + 1 + max(len(weekly), 4) + 2
        ws.merge_cells(f"A{base}:H{base}")
        _set(ws, base, 1, "변경 이력", bold=True, size=10, border=_thin(), fill_color="FFF2CC")
        for j, h in enumerate(history, start=1):
            r2 = base + j
            ws.merge_cells(f"A{r2}:H{r2}")
            txt = (
                f"[{h.get('changed_at','')[:10]}] {h.get('field','')}:"
                f" {h.get('before','')} → {h.get('after','')}  ({h.get('reason','')})"
            )
            _set(ws, r2, 1, txt, size=9, border=_thin())
            ws.row_dimensions[r2].height = 16

    _col_widths(ws, {"A": 10, "B": 14, "C": 14, "D": 14, "E": 14, "F": 14, "G": 14, "H": 20})
    return _to_bytes(wb)


# ─── Commercial Invoice (다품번 지원) ────────────────────────

def build_invoice(header: dict, items: list[dict] | None = None) -> bytes:
    """
    header: doc_number, ship_to_name, delivery_location, final_destination,
            sailing_date, po_number, [tax_id, customer_name]
    items:  list of {part_number, description, quantity, unit_price, po_number, ran_number}
    """
    # 단일 호출 호환 (header에 items 필드 포함된 경우)
    if items is None:
        items = header.get("_items") or [header]

    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"Invoice 양식 파일 없음: {TEMPLATE_PATH}")

    wb = load_workbook(TEMPLATE_PATH)
    ws = wb["IN"]

    _write_header(ws, "invoice", header)

    # 데이터 행 (row 29부터)
    DATA_START = 29
    total_qty = 0
    total_ext = 0.0
    has_price = False

    for idx, item in enumerate(items):
        row = DATA_START + idx
        qty_num, up_num, extended = _calc_item_amounts(item)
        ws[f"A{row}"] = item.get("part_number", "")
        ws[f"E{row}"] = item.get("description", "")
        ws[f"H{row}"] = qty_num
        ws[f"J{row}"] = up_num if up_num != "" else None
        ws[f"K{row}"] = extended if extended != "" else None
        ws[f"M{row}"] = item.get("po_number", header.get("po_number", ""))
        ws[f"N{row}"] = item.get("ran_number", "")

        if isinstance(qty_num, int):
            total_qty += qty_num
        if extended != "":
            total_ext += float(extended)
            has_price = True

    # TOTAL 행
    total_row = DATA_START + len(items)
    ws[f"A{total_row}"] = "TOTAL"
    ws[f"H{total_row}"] = total_qty
    ws[f"K{total_row}"] = round(total_ext, 2) if has_price else None

    _keep_only(wb, "IN")
    return _to_bytes(wb)


# ─── Packing List (다품번 지원) ──────────────────────────────

def build_packing_list(header: dict, items: list[dict] | None = None) -> bytes:
    """
    header: doc_number, ship_to_name, delivery_location, final_destination,
            sailing_date, po_number
    items:  list of {part_number, description, quantity, net_weight_per_pc,
                     pcs_per_box, po_number, ran_number}
    """
    if items is None:
        items = header.get("_items") or [header]

    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"Packing List 양식 파일 없음: {TEMPLATE_PATH}")

    wb = load_workbook(TEMPLATE_PATH)
    ws = wb["PA"]

    _write_header(ws, "packing", header)

    DATA_START = 29
    total_qty = 0
    total_box = 0
    total_net = 0.0
    total_gross = 0.0
    has_weight = False

    for idx, item in enumerate(items):
        row = DATA_START + idx
        qty = item.get("quantity", 0)
        pcs_per_box = item.get("pcs_per_box") or 360
        net_w = item.get("net_weight_per_pc") or 0

        try:
            qty_num = int(qty)
            box_count = math.ceil(qty_num / int(pcs_per_box))
            net_total   = round(float(net_w) * qty_num, 3) if net_w else ""
            gross_total = round(float(net_total) * 1.023, 3) if net_total != "" else ""
        except (ValueError, TypeError):
            qty_num, box_count, net_total, gross_total = qty, "", "", ""

        ws[f"A{row}"] = item.get("part_number", "")
        ws[f"E{row}"] = item.get("description", "")
        ws[f"H{row}"] = qty_num
        ws[f"J{row}"] = box_count
        ws[f"K{row}"] = net_total   if net_total   != "" else None
        ws[f"L{row}"] = gross_total if gross_total != "" else None
        ws[f"M{row}"] = None  # CBM — 팔레트 치수 필요
        ws[f"N{row}"] = item.get("po_number", header.get("po_number", ""))
        ws[f"O{row}"] = item.get("ran_number", "")

        if isinstance(qty_num, int):
            total_qty += qty_num
        if isinstance(box_count, int):
            total_box += box_count
        if net_total != "":
            total_net   += float(net_total)
            total_gross += float(gross_total)
            has_weight = True

    # TOTAL 행
    total_row = DATA_START + len(items)
    ws[f"A{total_row}"] = "TOTAL"
    ws[f"H{total_row}"] = total_qty
    ws[f"J{total_row}"] = total_box
    ws[f"K{total_row}"] = round(total_net,   3) if has_weight else None
    ws[f"L{total_row}"] = round(total_gross, 3) if has_weight else None

    _keep_only(wb, "PA")
    return _to_bytes(wb)
