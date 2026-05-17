import io
from datetime import date

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side


def _border(style: str = "thin") -> Border:
    side = Side(style=style)
    return Border(left=side, right=side, top=side, bottom=side)


def build_production_request(data: dict) -> bytes:
    """생산의뢰서 Excel 생성 후 bytes 반환."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "생산의뢰서"

    # 헤더
    ws.merge_cells("A1:F1")
    ws["A1"] = "생산의뢰서"
    ws["A1"].font = Font(size=16, bold=True)
    ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 30

    # 기본 정보
    headers = [
        ("의뢰서 번호", data.get("request_number", "")),
        ("고객사", data.get("customer_name", "")),
        ("품번", data.get("part_number", "")),
        ("수량", data.get("quantity", "")),
        ("생산 시작일", str(data.get("production_start_date", ""))),
        ("생산 완료일", str(data.get("production_end_date", ""))),
        ("납기일", str(data.get("delivery_date", ""))),
        ("납품처", data.get("delivery_location", "")),
    ]

    for row_idx, (label, value) in enumerate(headers, start=3):
        ws.cell(row=row_idx, column=1, value=label).font = Font(bold=True)
        ws.cell(row=row_idx, column=1).fill = PatternFill("solid", fgColor="E8F4FD")
        ws.cell(row=row_idx, column=1).border = _border()
        ws.cell(row=row_idx, column=2, value=value).border = _border()

    ws.column_dimensions["A"].width = 20
    ws.column_dimensions["B"].width = 30

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_invoice(data: dict) -> bytes:
    """Invoice Excel 생성 후 bytes 반환."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Invoice"

    ws.merge_cells("A1:F1")
    ws["A1"] = "INVOICE"
    ws["A1"].font = Font(size=18, bold=True)
    ws["A1"].alignment = Alignment(horizontal="center")
    ws.row_dimensions[1].height = 35

    fields = [
        ("Invoice No.", data.get("doc_number", "")),
        ("Date", str(date.today())),
        ("Bill To", data.get("customer_name", "")),
        ("Part Number", data.get("part_number", "")),
        ("Quantity", data.get("quantity", "")),
        ("Unit", data.get("unit", "")),
        ("Delivery Location", data.get("delivery_location", "")),
    ]

    for row_idx, (label, value) in enumerate(fields, start=3):
        ws.cell(row=row_idx, column=1, value=label).font = Font(bold=True)
        ws.cell(row=row_idx, column=1).border = _border()
        ws.cell(row=row_idx, column=2, value=value).border = _border()

    ws.column_dimensions["A"].width = 22
    ws.column_dimensions["B"].width = 30

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_packing_list(data: dict) -> bytes:
    """Packing List Excel 생성 후 bytes 반환."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Packing List"

    ws.merge_cells("A1:F1")
    ws["A1"] = "PACKING LIST"
    ws["A1"].font = Font(size=18, bold=True)
    ws["A1"].alignment = Alignment(horizontal="center")
    ws.row_dimensions[1].height = 35

    # 컬럼 헤더
    col_headers = ["No.", "Part Number", "Description", "Quantity", "Unit", "Remarks"]
    for col_idx, header in enumerate(col_headers, start=1):
        cell = ws.cell(row=3, column=col_idx, value=header)
        cell.font = Font(bold=True)
        cell.fill = PatternFill("solid", fgColor="D9E1F2")
        cell.border = _border()
        cell.alignment = Alignment(horizontal="center")

    # 데이터 행
    ws.cell(row=4, column=1, value=1).border = _border()
    ws.cell(row=4, column=2, value=data.get("part_number", "")).border = _border()
    ws.cell(row=4, column=3, value="").border = _border()
    ws.cell(row=4, column=4, value=data.get("quantity", "")).border = _border()
    ws.cell(row=4, column=5, value=data.get("unit", "")).border = _border()
    ws.cell(row=4, column=6, value="").border = _border()

    for col in ["A", "B", "C", "D", "E", "F"]:
        ws.column_dimensions[col].width = 18

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
