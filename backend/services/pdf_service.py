import io

import pdfplumber


def _normalize_pua(text: str) -> str:
    """깨진 ToUnicode CMap PDF 대응.

    일부 PDF는 심볼릭 폰트를 써서 pdfplumber가 실제 문자 대신 글리프 코드를
    사용자 영역(PUA) 0xF000~0xF0FF로 뽑는다 ("for" → '\\uf066\\uf06f\\uf072').
    이 영역은 정상 텍스트가 거의 안 쓰므로 codepoint-0xF000으로 안전하게 복원한다.
    """
    if not text:
        return text
    return "".join(
        chr(c - 0xF000) if 0xF000 <= (c := ord(ch)) <= 0xF0FF else ch
        for ch in text
    )


def extract_text(file_bytes: bytes) -> str:
    """
    pdfplumber로 텍스트 PDF에서 텍스트 추출.
    스캔 PDF(텍스트 없음) 감지 시 빈 문자열 반환.
    """
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        pages_text = [page.extract_text() or "" for page in pdf.pages]
    return _normalize_pua("\n".join(pages_text)).strip()


def is_scan_pdf(text: str) -> bool:
    """추출된 텍스트가 너무 짧으면 스캔 PDF로 판단."""
    return len(text) < 50
