import io

import pdfplumber


def extract_text(file_bytes: bytes) -> str:
    """
    pdfplumber로 텍스트 PDF에서 텍스트 추출.
    스캔 PDF(텍스트 없음) 감지 시 빈 문자열 반환.
    """
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        pages_text = [page.extract_text() or "" for page in pdf.pages]
    return "\n".join(pages_text).strip()


def is_scan_pdf(text: str) -> bool:
    """추출된 텍스트가 너무 짧으면 스캔 PDF로 판단."""
    return len(text) < 50
