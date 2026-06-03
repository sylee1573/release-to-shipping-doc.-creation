import io

import openpyxl


def extract_text_from_excel(file_bytes: bytes, filename: str = "") -> str:
    """xlsx/xls 파일을 읽어 AI 파싱용 텍스트로 변환."""
    if filename.lower().endswith(".xls"):
        return _extract_xls(file_bytes)
    return _extract_xlsx(file_bytes)


def _extract_xlsx(file_bytes: bytes) -> str:
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    sections = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows_text = []
        for row in ws.iter_rows(values_only=True):
            if not any(cell is not None for cell in row):
                continue
            cells = [str(cell).strip() if cell is not None else "" for cell in row]
            while cells and cells[-1] == "":
                cells.pop()
            if cells:
                rows_text.append(" | ".join(cells))
        if rows_text:
            sections.append(f"=== Sheet: {sheet_name} ===\n" + "\n".join(rows_text))
    return "\n\n".join(sections)


def _extract_xls(file_bytes: bytes) -> str:
    import xlrd  # xlrd 2.x: .xls 전용 (xlrd==2.0.1 required)
    wb = xlrd.open_workbook(file_contents=file_bytes)
    sections = []
    for sheet_name in wb.sheet_names():
        ws = wb.sheet_by_name(sheet_name)
        rows_text = []
        for row_idx in range(ws.nrows):
            row = ws.row_values(row_idx)
            if not any(cell is not None and cell != "" for cell in row):
                continue
            cells = [str(cell).strip() if cell != "" and cell is not None else "" for cell in row]
            while cells and cells[-1] == "":
                cells.pop()
            if cells:
                rows_text.append(" | ".join(cells))
        if rows_text:
            sections.append(f"=== Sheet: {sheet_name} ===\n" + "\n".join(rows_text))
    return "\n\n".join(sections)
