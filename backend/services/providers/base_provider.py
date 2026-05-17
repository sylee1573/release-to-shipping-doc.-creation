from abc import ABC, abstractmethod


class BaseAIProvider(ABC):

    @abstractmethod
    async def parse_document(self, text: str, template_hint: str = "") -> dict:
        """
        발주서 텍스트 파싱 (복잡, 고정확도 모델 사용)
        반환 형식:
        {
          "fields": {
            "필드명": {"value": "추출값", "confidence": 0.0~1.0, "raw_text": "원문"}
          },
          "parse_notes": "파싱 중 특이사항"
        }
        """

    @abstractmethod
    async def classify_simple(self, text: str, instruction: str) -> str:
        """
        단순 분류·정규화 (경량 모델 사용, 비용 절감)
        예: 날짜 형식 통일, 단위 정규화
        """

    @abstractmethod
    def get_provider_name(self) -> str:
        """프로바이더 이름 반환 (로그·모니터링용)"""
