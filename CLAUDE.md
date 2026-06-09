# CLAUDE.md — 자동차 부품사 발주 자동화 SaaS

> Claude Code 세션 시작 시 이 파일을 반드시 먼저 읽고 전체 구조를 파악한 후 작업을 시작하라.
> 코드 작성 전에 관련 섹션을 재확인하라. 이 파일에 명시된 규칙은 절대 임의로 변경하지 않는다.

\---

## 1\. 프로젝트 개요

**프로젝트명:** 고객발주 기반 내부생산의뢰서 \& 선적서류 자동생성 SaaS
**타겟 고객:** 자동차 2·3차 부품사 (직원 30\~200명 규모)
**핵심 가치:** 고객사 발주서(PDF — Phase 1 / Excel — Phase 2) → AI 파싱 → 생산의뢰서 + Invoice + Packing List 자동생성
**배포 형태:** SaaS (멀티테넌트) + 향후 설치형(Docker) 옵션

\---

## 2\. 확정 기술 스택

### 백엔드

* **언어/프레임워크:** Python 3.11+ / FastAPI
* **AI 파싱:** 멀티 프로바이더 지원 (벤더 독립 구조)

  * 기본값: Anthropic Claude (claude-sonnet-4-5 / haiku)
  * 전환 가능: OpenAI GPT-4o / Google Gemini / Ollama(로컬)
  * **프로바이더 전환은 `.env` 1줄 변경으로만 가능하도록 설계**
* **Excel 생성:** `openpyxl`
* **PDF 텍스트 추출:** `pdfplumber` (텍스트 PDF 전용, 스캔 PDF는 Phase 2)
* **DB:** PostgreSQL (멀티테넌트 RLS 적용)
* **스케줄러:** APScheduler (미납 체크 크론잡)
* **알림:** Solapi API (카카오 알림톡 + SMS)

### 프론트엔드

* **프레임워크:** React 18 + Vite + TypeScript
* **스타일:** Tailwind CSS
* **상태관리:** React Query (서버 상태) + Zustand (로컬 상태)

### 인프라

* **백엔드 호스팅:** Railway.app (PostgreSQL 번들)
* **프론트엔드 호스팅:** Vercel
* **컨테이너:** Docker (설치형 패키징용 대비)
* **CI/CD:** GitHub Actions
* **에러 모니터링:** Sentry

### 과금 방식 (중요)

* **자동결제 없음** — PG/Stripe 연동 불필요
* **방식:** 월말 인보이스 발행 → 고객사 계좌이체 수금
* **미납 처리:** 자동 서비스 중단 (아래 섹션 참조)
* **관리자 기능:** 월별 고객사 사용량 리포트 화면에서 건수 확인 후 수동 세금계산서 발행

\---

## 3\. 디렉토리 구조

```
order-automation/
├── backend/
│   ├── main.py                    # FastAPI 앱 진입점
│   ├── config.py                  # 환경변수 로딩 (pydantic-settings)
│   ├── database.py                # DB 연결, 세션 관리
│   ├── middleware/
│   │   ├── auth.py                # JWT 인증 미들웨어
│   │   └── tenant\_guard.py        # 테넌트 활성 상태 체크 (서비스 중단 처리)
│   ├── models/                    # SQLAlchemy ORM 모델
│   │   ├── tenant.py              # Tenant (고객사)
│   │   ├── user.py                # User
│   │   ├── order.py               # Order (발주서)
│   │   ├── production\_request.py  # ProductionRequest (생산의뢰서)
│   │   ├── shipment\_doc.py        # ShipmentDoc (Invoice/Packing List)
│   │   ├── invoice.py             # Invoice (수금용 청구서)
│   │   └── parsing\_template.py    # ParsingTemplate (발주서 양식 템플릿)
│   ├── routers/
│   │   ├── auth.py                # 로그인/토큰
│   │   ├── orders.py              # 발주서 업로드·파싱·조회
│   │   ├── production.py          # 생산의뢰서 생성·수정·다운로드
│   │   ├── shipment.py            # Invoice/Packing List 생성·다운로드
│   │   ├── admin.py               # 관리자 전용 (사용량, 미납관리, 양식등록)
│   │   └── health.py              # 헬스체크
│   ├── services/
│   │   ├── ai\_service.py          # AI 호출 진입점 — 외부에서 이것만 import
│   │   ├── providers/
│   │   │   ├── base\_provider.py       # 추상 베이스 클래스
│   │   │   ├── anthropic\_provider.py  # Claude (기본값)
│   │   │   ├── openai\_provider.py     # GPT-4o
│   │   │   ├── gemini\_provider.py     # Google Gemini
│   │   │   └── ollama\_provider.py     # 로컬 모델 (설치형 대응)
│   │   ├── pdf\_service.py         # pdfplumber 텍스트 추출
│   │   ├── excel\_builder.py       # openpyxl Excel 생성 전담
│   │   ├── schedule\_service.py    # APScheduler 크론잡 (미납 체크)
│   │   └── notification\_service.py # Solapi 알림톡/SMS 발송
│   ├── schemas/                   # Pydantic 요청/응답 스키마
│   └── tests/
│       ├── test\_parsing.py
│       └── test\_excel.py
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx      # 발주 현황 대시보드
│   │   │   ├── OrderUpload.tsx    # 발주서 업로드
│   │   │   ├── ParseReview.tsx    # 파싱 결과 확인·수정 (핵심 UI)
│   │   │   ├── ProductionList.tsx # 생산의뢰서 목록
│   │   │   ├── ShipmentDocs.tsx   # 선적서류 목록
│   │   │   └── Admin.tsx          # 관리자 페이지
│   │   ├── components/
│   │   │   ├── ConfidenceScore.tsx # 신뢰도 점수 시각화 컴포넌트
│   │   │   └── FieldEditor.tsx    # 파싱 필드 수정 폼
│   │   └── api/                   # API 클라이언트 (React Query)
│   └── vite.config.ts
├── CLAUDE.md                      # 이 파일
├── .env.example
├── docker-compose.yml
└── .github/
    └── workflows/
        └── deploy.yml
```

\---

## 4\. 데이터베이스 스키마 (필수 준수)

### 멀티테넌트 원칙

* **모든 비즈니스 테이블에 `tenant\_id` 컬럼 필수**
* PostgreSQL Row-Level Security(RLS) 적용으로 테넌트 간 데이터 격리
* RLS 없이 테이블을 생성하지 말 것

### 핵심 테이블 구조

```sql
-- 고객사 (테넌트)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
    name VARCHAR(200) NOT NULL,           -- 회사명
    business\_number VARCHAR(20),           -- 사업자번호
    contact\_email VARCHAR(200) NOT NULL,   -- 담당자 이메일
    contact\_phone VARCHAR(50),             -- 담당자 연락처
    is\_active BOOLEAN DEFAULT TRUE,        -- 서비스 활성 여부 (미납 시 FALSE)
    suspended\_at TIMESTAMP,                -- 서비스 중단 일시
    plan\_type VARCHAR(50) DEFAULT 'per\_unit', -- 과금 유형
    created\_at TIMESTAMP DEFAULT NOW()
);

-- 청구서 (수금 관리)
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
    tenant\_id UUID NOT NULL REFERENCES tenants(id),
    billing\_month VARCHAR(7) NOT NULL,     -- 'YYYY-MM' 형식
    unit\_count INTEGER NOT NULL DEFAULT 0, -- 해당 월 처리 건수
    amount DECIMAL(12,2),                  -- 청구 금액
    issued\_at TIMESTAMP,                   -- 인보이스 발행일
    due\_date DATE NOT NULL,                -- 납부 기한
    paid\_at TIMESTAMP,                     -- 실제 납부일 (NULL = 미납)
    status VARCHAR(20) DEFAULT 'pending',  -- pending / paid / overdue / suspended
    warning\_1\_sent\_at TIMESTAMP,           -- 1차 경고 발송일 (D+30)
    warning\_2\_sent\_at TIMESTAMP,           -- 2차 경고 발송일 (D+37)
    warning\_3\_sent\_at TIMESTAMP,           -- 중단 예고 발송일 (D+44)
    created\_at TIMESTAMP DEFAULT NOW()
);

-- 발주서
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
    tenant\_id UUID NOT NULL REFERENCES tenants(id),
    customer\_name VARCHAR(200),            -- 발주 고객사명
    file\_name VARCHAR(500),                -- 업로드 파일명
    file\_path VARCHAR(1000),               -- 저장 경로
    parse\_status VARCHAR(20) DEFAULT 'pending', -- pending/processing/done/failed
    raw\_text TEXT,                         -- pdfplumber 추출 원문
    parsed\_data JSONB,                     -- AI 파싱 결과 (필드별 값+신뢰도, 프로바이더 무관 동일 형식)
    confirmed\_data JSONB,                  -- 담당자 최종 확인 데이터
    confirmed\_by UUID,                     -- 확인한 사용자 ID
    confirmed\_at TIMESTAMP,
    created\_at TIMESTAMP DEFAULT NOW()
);

-- 파싱 결과 구조 (parsed\_data JSONB 내부 형식 — §5 AI 응답과 동일 구조로 저장)
-- {
--   "fields": {
--     "customer\_code":     {"value": "HMC-001",     "confidence": 0.97, "raw\_text": "발주처: HMC-001"},
--     "part\_number":       {"value": "85310-AA000",  "confidence": 0.95, "raw\_text": "품번 85310-AA000"},
--     "quantity":          {"value": 500,            "confidence": 0.88, "raw\_text": "수량 500EA"},
--     "unit":              {"value": "EA",           "confidence": 0.99, "raw\_text": "EA"},
--     "delivery\_date":     {"value": "2026-06-30",   "confidence": 0.72, "raw\_text": "납기 6/30"},
--     "delivery\_location": {"value": "울산 1공장",   "confidence": 0.81, "raw\_text": "납품처: 울산1"}
--   },
--   "parse\_notes": "납기일 표기가 월/일 형식으로 연도 추정 필요"
-- }

-- 생산의뢰서
CREATE TABLE production\_requests (
    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
    tenant\_id UUID NOT NULL REFERENCES tenants(id),
    order\_id UUID NOT NULL REFERENCES orders(id),
    request\_number VARCHAR(100),           -- 의뢰서 번호 (자동생성)
    production\_start\_date DATE,            -- 생산 시작일 (납기 역산)
    production\_end\_date DATE,              -- 생산 완료일
    quantity INTEGER,
    adjusted\_quantity INTEGER,             -- 수량 변경 시
    adjusted\_delivery\_date DATE,           -- 납기 변경 시
    change\_history JSONB DEFAULT '\[]',     -- 변경이력 배열
    excel\_path VARCHAR(1000),              -- 생성된 Excel 파일 경로
    status VARCHAR(20) DEFAULT 'draft',    -- draft/confirmed/in\_production/done
    created\_at TIMESTAMP DEFAULT NOW(),
    updated\_at TIMESTAMP DEFAULT NOW()
);

-- 선적서류 (Invoice + Packing List)
CREATE TABLE shipment\_docs (
    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
    tenant\_id UUID NOT NULL REFERENCES tenants(id),
    production\_request\_id UUID NOT NULL REFERENCES production\_requests(id),
    doc\_type VARCHAR(20) NOT NULL,         -- 'invoice' / 'packing\_list'
    doc\_number VARCHAR(100),               -- 서류 번호
    excel\_path VARCHAR(1000),
    issued\_at TIMESTAMP,
    created\_at TIMESTAMP DEFAULT NOW()
);

-- 발주서 양식 템플릿 (고객사별 파싱 규칙)
CREATE TABLE parsing\_templates (
    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),
    tenant\_id UUID NOT NULL REFERENCES tenants(id),
    customer\_name VARCHAR(200) NOT NULL,   -- 이 양식의 발주 고객사
    template\_description TEXT,             -- 양식 특징 설명
    field\_mapping JSONB,                   -- 필드 위치·표기 힌트
    sample\_text TEXT,                      -- 샘플 발주서 원문 (프롬프트 참조용)
    is\_active BOOLEAN DEFAULT TRUE,
    created\_at TIMESTAMP DEFAULT NOW()
);
```

\---

## 5\. AI 서비스 레이어 — 벤더 독립 구조 (절대 준수)

### 설계 원칙

* **특정 AI 벤더에 종속되지 않는다**
* 프로바이더 전환은 `.env` 파일 1줄 변경으로만 가능해야 한다
* 비즈니스 로직(라우터, 모델)은 어떤 AI를 쓰는지 알 수 없어야 한다

### 파일 구조

```
services/
├── ai\_service.py          # 외부에서 호출하는 유일한 진입점 (인터페이스)
└── providers/
    ├── base\_provider.py   # 추상 베이스 클래스
    ├── anthropic\_provider.py  # Claude (기본값)
    ├── openai\_provider.py     # GPT-4o
    ├── gemini\_provider.py     # Google Gemini
    └── ollama\_provider.py     # 로컬 모델 (설치형 고객사 대응)
```

### 추상 베이스 클래스 (모든 프로바이더가 반드시 구현)

```python
# services/providers/base\_provider.py
from abc import ABC, abstractmethod

class BaseAIProvider(ABC):

    @abstractmethod
    async def parse\_document(self, text: str, template\_hint: str = "") -> dict:
        """
        발주서 텍스트 파싱 (복잡, 고정확도 모델 사용)
        반환 형식:
        {
          "fields": {
            "필드명": {"value": "추출값", "confidence": 0.0\~1.0, "raw\_text": "원문"}
          },
          "parse\_notes": "파싱 중 특이사항"
        }
        """
        pass

    @abstractmethod
    async def classify\_simple(self, text: str, instruction: str) -> str:
        """
        단순 분류·정규화 (경량 모델 사용, 비용 절감)
        예: 날짜 형식 통일, 단위 정규화
        """
        pass

    @abstractmethod
    def get\_provider\_name(self) -> str:
        """프로바이더 이름 반환 (로그·모니터링용)"""
        pass
```

### AI 서비스 진입점 (라우터에서 이것만 import)

```python
# services/ai\_service.py
import os
from services.providers.base\_provider import BaseAIProvider

def get\_ai\_provider() -> BaseAIProvider:
    """
    AI\_PROVIDER 환경변수에 따라 프로바이더 자동 선택
    변경 시 .env의 AI\_PROVIDER 값만 수정하면 됨
    """
    provider = os.getenv("AI\_PROVIDER", "anthropic").lower()

    if provider == "anthropic":
        from services.providers.anthropic\_provider import AnthropicProvider
        return AnthropicProvider()
    elif provider == "openai":
        from services.providers.openai\_provider import OpenAIProvider
        return OpenAIProvider()
    elif provider == "gemini":
        from services.providers.gemini\_provider import GeminiProvider
        return GeminiProvider()
    elif provider == "ollama":
        from services.providers.ollama\_provider import OllamaProvider
        return OllamaProvider()
    else:
        raise ValueError(f"지원하지 않는 AI\_PROVIDER: {provider}")

# 전역 싱글턴 (앱 시작 시 1회 초기화 — 프로바이더 변경 시 앱 재시작 필요)
ai\_provider: BaseAIProvider = get\_ai\_provider()
```

### 각 프로바이더 구현 예시

```python
# services/providers/anthropic\_provider.py
import anthropic
from .base\_provider import BaseAIProvider

class AnthropicProvider(BaseAIProvider):
    def \_\_init\_\_(self):
        self.client = anthropic.Anthropic(api\_key=os.getenv("ANTHROPIC\_API\_KEY"))
        self.model\_heavy = os.getenv("ANTHROPIC\_MODEL\_HEAVY", "claude-sonnet-4-5")
        self.model\_light = os.getenv("ANTHROPIC\_MODEL\_LIGHT", "claude-haiku-4-5-20251001")

    async def parse\_document(self, text: str, template\_hint: str = "") -> dict:
        # Sonnet으로 고정확도 파싱
        ...

    async def classify\_simple(self, text: str, instruction: str) -> str:
        # Haiku로 비용 절감
        ...

    def get\_provider\_name(self) -> str:
        return "anthropic"

# services/providers/openai\_provider.py
# services/providers/gemini\_provider.py
# → 동일한 인터페이스로 구현, 내부 SDK만 다름
```

### 라우터에서 사용 방법 (벤더 이름 노출 금지)

```python
# routers/orders.py — 올바른 사용
from services.ai\_service import ai\_provider

result = await ai\_provider.parse\_document(extracted\_text, template\_hint)

# ❌ 금지 — 라우터에서 특정 벤더 직접 import
import anthropic  # 절대 금지
```

### 파싱 파이프라인 (2단계 — 반드시 이 순서)

```
1단계: pdfplumber → 텍스트 추출 (무료, 빠름, AI 불필요)
2단계: 추출된 텍스트만 ai\_provider.parse\_document()로 전달 (토큰 최소화)
※ PDF 원본 파일을 AI에 직접 전달하지 말 것 (토큰 폭발)
```

### 파싱 응답 형식 (모든 프로바이더 공통 — JSON 강제)

어떤 프로바이더를 쓰든 반드시 아래 형식으로 반환:

```json
{
  "fields": {
    "customer\_code":     {"value": "HMC-001",      "confidence": 0.97, "raw\_text": "발주처: HMC-001"},
    "part\_number":       {"value": "85310-AA000",   "confidence": 0.95, "raw\_text": "품번 85310-AA000"},
    "quantity":          {"value": 500,             "confidence": 0.88, "raw\_text": "수량 500EA"},
    "unit":              {"value": "EA",            "confidence": 0.99, "raw\_text": "EA"},
    "delivery\_date":     {"value": "2026-06-30",    "confidence": 0.72, "raw\_text": "납기 6/30"},
    "delivery\_location": {"value": "울산 1공장",    "confidence": 0.81, "raw\_text": "납품처: 울산1"}
  },
  "parse\_notes": "납기일 표기가 월/일 형식으로 연도 추정 필요"
}
```

### 신뢰도 임계값 (UI 색상 기준 — 프로바이더 무관 동일 적용)

* `confidence >= 0.90` → 초록색 (정상)
* `0.70 <= confidence < 0.90` → 노란색 (확인 권장)
* `confidence < 0.70` → 빨간색 (수정 필수, 저장 버튼 비활성화)

### 비용 목표

* 발주서 1건당 AI API 비용: **$0.02 이하** (프로바이더 무관)
* 초과 시 경량 모델 전환 또는 프로바이더 교체 검토

\---

## 6\. 미납 자동 서비스 중단 로직

### 타임라인

```
인보이스 due\_date 기준:
  D+0  : 납부 기한
  D+30 : 1차 경고 — 이메일 + 카카오 알림톡 (담당자)
  D+37 : 2차 경고 — 이메일 + 카카오 알림톡 (담당자 + 대표)
  D+44 : 중단 예고 알림 — "내일 서비스가 중단됩니다"
  D+45 : 서비스 자동 중단 (tenants.is\_active = FALSE)
         로그인은 가능, 모든 기능 잠금, 미납 안내 화면 표시
  입금확인 후: 관리자가 수동으로 is\_active = TRUE 복구
```

### 크론잡 구현 (APScheduler)

```python
# schedule\_service.py
# 매일 자정 실행
@scheduler.scheduled\_job('cron', hour=0, minute=0)
async def check\_overdue\_invoices():
    # 1. due\_date 기준 D+30, D+37, D+44, D+45 해당 건 조회
    # 2. 각 단계별 알림 발송 (notification\_service 호출)
    # 3. D+45: tenants.is\_active = FALSE, suspended\_at = NOW()
    # 4. 처리 결과 로그 기록
```

### 미들웨어 처리

```python
# tenant\_guard.py
# 모든 API 요청에서 tenant.is\_active 체크
# is\_active == False → 423 Locked 응답
# 프론트엔드: 423 수신 시 미납 안내 페이지로 리다이렉트
```

### 데이터 보호 원칙

* 서비스 중단 = 기능 잠금 (데이터 삭제 절대 금지)
* 복구 즉시 기존 데이터 그대로 사용 가능

\---

## 7\. 핵심 비즈니스 로직

### 납기 역산 계산

```
생산 완료일 = 고객 납기일 - 출하 준비일수(기본 2일)
생산 시작일 = 생산 완료일 - 생산 리드타임(기본 7일)
※ 리드타임은 테넌트별 설정 가능
```

### 생산의뢰서 번호 자동생성

```
형식: PR-{YYYYMM}-{4자리 순번}
예시: PR-202606-0001
```

### 선적서류 번호 자동생성

```
Invoice:      INV-{YYYYMM}-{4자리 순번}
Packing List: PKL-{YYYYMM}-{4자리 순번}
```

### 수량/납기 변경 이력

```python
# production\_requests.change\_history JSONB 배열에 추가
{
  "changed\_at": "2026-06-01T10:30:00",
  "changed\_by": "user\_id",
  "field": "quantity",
  "before": 500,
  "after": 450,
  "reason": "고객 요청 수량 조정"
}
```

\---

## 8\. API 엔드포인트 규칙

* 모든 엔드포인트는 `/api/v1/` prefix 필수
* 인증: JWT Bearer Token (Authorization 헤더)
* 테넌트 격리: JWT에서 tenant\_id 추출, 모든 쿼리에 자동 적용
* 관리자 전용 엔드포인트: `/api/v1/admin/` prefix

### 주요 엔드포인트 목록

```
POST   /api/v1/orders/upload          # 발주서 파일 업로드 + 파싱 시작
GET    /api/v1/orders/{id}/parse-result # 파싱 결과 조회 (신뢰도 포함)
POST   /api/v1/orders/{id}/confirm    # 파싱 결과 담당자 확인·확정
POST   /api/v1/production/            # 생산의뢰서 생성
PATCH  /api/v1/production/{id}        # 수량/납기 수정
GET    /api/v1/production/{id}/download # Excel 다운로드
POST   /api/v1/shipment/              # Invoice/Packing List 생성
GET    /api/v1/shipment/{id}/download # Excel 다운로드
GET    /api/v1/admin/usage            # 고객사별 월별 사용량
PATCH  /api/v1/admin/tenants/{id}/restore # 서비스 복구 (입금 확인 후)
POST   /api/v1/admin/templates/       # 발주서 양식 등록
GET    /api/v1/health                 # 헬스체크 (인증 불필요)
```

\---

## 9\. 환경변수 (.env)

```bash
# AI 프로바이더 설정 (1줄만 바꾸면 전체 전환)
AI\_PROVIDER=anthropic        # anthropic | openai | gemini | ollama

# Anthropic (기본값)
ANTHROPIC\_API\_KEY=sk-ant-...
ANTHROPIC\_MODEL\_HEAVY=claude-sonnet-4-5
ANTHROPIC\_MODEL\_LIGHT=claude-haiku-4-5-20251001

# OpenAI (전환 시 사용)
# OPENAI\_API\_KEY=sk-...
# OPENAI\_MODEL\_HEAVY=gpt-4o
# OPENAI\_MODEL\_LIGHT=gpt-4o-mini

# Google Gemini (전환 시 사용)
# GEMINI\_API\_KEY=...
# GEMINI\_MODEL\_HEAVY=gemini-1.5-pro
# GEMINI\_MODEL\_LIGHT=gemini-1.5-flash

# Ollama 로컬 (설치형 고객사 — 인터넷 차단 환경 대응)
# OLLAMA\_BASE\_URL=http://localhost:11434
# OLLAMA\_MODEL\_HEAVY=llama3.1:70b
# OLLAMA\_MODEL\_LIGHT=llama3.1:8b

# Database
DATABASE\_URL=postgresql://user:pass@host:5432/order\_automation

# JWT
JWT\_SECRET\_KEY=...
JWT\_ALGORITHM=HS256
JWT\_EXPIRE\_MINUTES=1440

# Solapi (알림톡/SMS)
SOLAPI\_API\_KEY=...
SOLAPI\_API\_SECRET=...
SOLAPI\_SENDER\_PHONE=...
SOLAPI\_KAKAO\_PFID=...    # 카카오 비즈니스 채널 ID

# 파일 저장
UPLOAD\_DIR=/data/uploads
EXCEL\_OUTPUT\_DIR=/data/outputs

# 환경
ENVIRONMENT=development  # development / production
SENTRY\_DSN=...
```

\---

## 10\. 개발 우선순위 (Phase별)

### Phase 1 — MVP (6주 목표)

**1주차:** 프로젝트 초기화

* FastAPI 기본 구조 세팅
* PostgreSQL 스키마 생성 (RLS 포함)
* Railway 배포 + `/api/v1/health` 200 응답 확인

**2주차:** 파싱 엔진

* pdfplumber PDF 텍스트 추출
* Claude API 파싱 + 신뢰도 점수 반환
* orders 테이블 저장

**3주차:** 파싱 확인 UI

* React 발주서 업로드 페이지
* 파싱 결과 확인 화면 (신뢰도 색상 표시)
* 저신뢰 필드 강제 수정 로직 + 저장

**4주차:** 생산의뢰서 생성

* 납기 역산 계산 로직
* openpyxl 생산의뢰서 Excel 생성
* 수량/납기 수정 + 변경이력 기록

**5주차:** 선적서류 생성

* Invoice Excel 생성 (생산의뢰서 데이터 연동)
* Packing List Excel 생성
* 관리자 양식 등록 페이지

**6주차:** 상품화 기초

* 월별 사용량 리포트 (관리자)
* APScheduler 미납 체크 크론잡
* Solapi 알림톡 연동
* Vercel 프론트엔드 배포
* 파일럿 고객사 온보딩

### Phase 2 (2\~3개월)

* 스캔 PDF OCR 지원
* Excel 발주서 파싱 지원 (openpyxl 읽기)
* ERP 연동 API (요청 시)
* 수량/납기 변경 대시보드 고도화

\---

## 11\. 코딩 규칙

1. **AI 호출은 `services/ai\_service.py`의 `ai\_provider`만 사용** — 라우터·모델에서 특정 AI SDK 직접 import 절대 금지
2. **프로바이더별 구현은 `services/providers/` 안에만** — `ai\_service.py` 밖으로 벤더 코드 노출 금지
3. **환경변수는 `.env`에서만** — 코드에 API 키·비밀값 하드코딩 절대 금지
4. **모든 DB 쿼리에 `tenant\_id` 필터 포함** — 없으면 반드시 이유를 주석으로 명시
5. **파일 업로드는 `/data/uploads/{tenant\_id}/` 경로에 저장** — 테넌트 디렉토리 분리
6. **응답 시간 목표: PDF 업로드 후 파싱 완료까지 10초 이내** — 초과 시 비동기 처리 + 진행 상태 폴링
7. **스캔 PDF 감지 시** — 오류 대신 "수동 입력 폼으로 안내" 메시지 반환

\---

## 12\. 테스트 기준

* 파싱 정확도: 실제 발주서 샘플 10건 기준 **85% 이상**
* 신뢰도 0.70 미만 필드: 반드시 UI에서 수정 강제
* Excel 생성: 생산의뢰서·Invoice·Packing List 각 양식 검증
* 미납 크론잡: 단계별 알림 발송 + 중단 처리 통합 테스트

\---

## 13\. gstack UI 검증 규칙 (필수)

### 언제 실행하는가

프론트엔드 코드를 작성하거나 수정한 직후 **반드시** `/gstack` 또는 `/browse`로 실제 브라우저 검증을 수행한다.
테스트 기준을 통과하지 않으면 작업 완료로 간주하지 않는다.

### 검증 대상 및 체크리스트

#### 1\. 발주서 업로드 (`OrderUpload.tsx`)

```
[ ] PDF 파일 드래그앤드롭 → 업로드 진행 표시 확인
[ ] 업로드 완료 후 ParseReview 페이지로 자동 이동
[ ] 비허용 파일(jpg, docx 등) 업로드 시 오류 메시지 표시
[ ] 스캔 PDF 업로드 시 "수동 입력 폼으로 안내" 메시지 표시
```

#### 2\. 파싱 결과 확인 (`ParseReview.tsx`) — 핵심 화면

```
[ ] confidence >= 0.90 필드: 배경색 초록색 확인
[ ] 0.70 <= confidence < 0.90 필드: 배경색 노란색 확인
[ ] confidence < 0.70 필드: 배경색 빨간색 확인
[ ] 빨간색 필드가 1개라도 존재하면 저장 버튼 비활성화(disabled) 확인
[ ] 빨간색 필드 수정 후 → 저장 버튼 활성화 확인
[ ] 저장 완료 후 성공 토스트 또는 다음 단계 이동 확인
```

#### 3\. 대시보드 (`Dashboard.tsx`)

```
[ ] 발주 건수·상태별 현황 수치 렌더링 확인
[ ] 최근 발주 목록 테이블 표시 확인
[ ] 각 행 클릭 시 상세 페이지 이동 확인
```

#### 4\. 생산의뢰서 목록 (`ProductionList.tsx`)

```
[ ] 목록 정상 렌더링 확인
[ ] Excel 다운로드 버튼 클릭 → 파일 다운로드 트리거 확인
[ ] 수량·납기 수정 폼 저장 후 변경 내용 반영 확인
```

#### 5\. 미납 서비스 중단 화면

```
[ ] 중단된 테넌트 로그인 시 기능 잠금 화면 표시 확인
[ ] 미납 안내 문구·납부 방법 표시 확인
[ ] 다른 API 호출 시 423 수신 → 안내 화면 유지 확인
```

#### 6\. 관리자 페이지 (`Admin.tsx`)

```
[ ] 고객사별 월별 사용량 테이블 렌더링 확인
[ ] 서비스 복구 버튼 동작 확인
[ ] 발주서 양식(템플릿) 등록 폼 제출 확인
```

### gstack 실행 방법

```
# 로컬 개발 서버 기준 (Vite 기본 포트)
/browse http://localhost:5173

# 특정 페이지 직접 검증
/browse http://localhost:5173/orders/upload
/browse http://localhost:5173/orders/{id}/review

# Vercel 배포 후 검증
/browse https://{배포 URL}
```

### 스크린샷 기록 기준

다음 상황에서는 반드시 스크린샷을 캡처하여 결과를 기록한다:

* 신뢰도 색상(초록/노랑/빨강)이 올바르게 렌더링되는 화면
* 저장 버튼 비활성화 상태 (빨간 필드 존재 시)
* 미납 서비스 중단 안내 화면
* 버그 발견 시 (재현 증거로 첨부)

### 응답 시간 검증

* PDF 업로드 → 파싱 결과 화면 전환: **10초 이내** (섹션 11-6 참조)
* 10초 초과 시 비동기 처리 + 폴링 방식으로 전환하고 재검증

\---

## 14\. 에이전트 개발 운영 계획

> Claude Code 에이전트를 역할별로 분리해 개발을 진행할 때의 구조, 게이트 기반 검증, 완료 조건을 정의한다.

### 에이전트 구조 (총 4개)

| # | 에이전트 | 역할 |
|---|---------|------|
| 1 | **코디네이터** | 스펙 확정, 게이트 판정, 통합 검증 |
| 2 | **백엔드** | FastAPI, DB, AI 파싱, Excel, 크론잡 |
| 3 | **프론트엔드** | React UI, 신뢰도 시각화, 미납 화면 |
| 4 | **DevOps** | Railway, Vercel, GitHub Actions, Docker |

> AI/ML 전문 에이전트는 별도로 두지 않는다. 프롬프트 최적화·비용 관리는 백엔드 에이전트가 담당. 파싱 정확도 85% 미달 시에만 분리 검토.

### 전체 게이트 흐름

```
[코디네이터: GATE-0 스펙 확정]
        ↓
[백엔드 1~2단계] ──병렬── [프론트 1단계]
        ↓ GATE-1: health 200 + JWT 인증
[백엔드 3단계] ──병렬── [프론트 2~3단계]
        ↓ GATE-2: 파싱 E2E + 신뢰도 색상
[백엔드 4단계] ──병렬── [프론트 4단계] ──병렬── [DevOps 1~2단계]
        ↓ GATE-3: 전체 기능 완료
[DevOps 3~4단계: CI/CD + 환경변수]
        ↓ GATE-4: 배포 완료
[코디네이터: GATE-5 파일럿 E2E 최종 검증]
```

### 게이트 통과 판정 기준

| 게이트 | 판정자 | 판정 기준 |
|--------|--------|-----------|
| GATE-0 | 코디네이터 | API 스펙 문서 + DB 스키마 확정 |
| GATE-1 | 코디네이터 | `/api/v1/health` 200 + JWT 인증 동작 |
| GATE-2 | 코디네이터 | 파싱 결과 E2E + `/gstack` 신뢰도 색상 체크리스트 |
| GATE-3 | 코디네이터 | 전체 백엔드 `pytest` + 프론트 gstack 체크리스트 전 항목 |
| GATE-4 | 코디네이터 | 외부 URL 전체 플로우 10초 이내 + Sentry 수집 확인 |
| GATE-5 | 사람 (최종) | 파일럿 고객사 실제 발주서 파싱 정확도 **85% 이상** |

### 백엔드 에이전트 — 단계별 계획

| 게이트 | 작업 | 검증 방법 | 이동 조건 |
|--------|------|-----------|-----------|
| GATE-0→1 | DB 스키마(RLS), JWT 미들웨어 | RLS 격리 확인, health 200 | 외부 URL health 응답 |
| GATE-1→2 | pdfplumber + AI 파싱 + `parsed_data` 저장 | 샘플 발주서 1건 → JSONB 반환, 비용 $0.02↓ | `/orders/{id}/parse-result` 스펙 확정 |
| GATE-2→3 | 생산의뢰서 Excel, 납기 역산, 변경이력 | PR-202606-0001 번호 자동생성, 수량 변경 이력 배열 | 다운로드 엔드포인트 200 |
| GATE-3→4 | APScheduler 미납 크론잡, tenant\_guard | 날짜 mock D+30/37/44/45 트리거, 423 응답 | 전체 `pytest` 통과 |

**최종 완료 조건:**
* 샘플 발주서 10건 파싱 정확도 **85% 이상**
* 모든 DB 쿼리 `tenant_id` 필터 포함
* `pytest` 전체 통과

### 프론트엔드 에이전트 — 단계별 계획

| 게이트 | 작업 | 검증 방법 | 이동 조건 |
|--------|------|-----------|-----------|
| GATE-0→1 | Vite + Tailwind + React Query + Zustand, 로그인 | `npm run build` 에러 0 | 백엔드 JWT 연동 성공 |
| GATE-1→2 | `OrderUpload.tsx` 드래그앤드롭, 비허용 파일 오류 | `/gstack` 업로드 → ParseReview 자동 이동 | 업로드 → 대기 화면 전환 |
| GATE-2→3 | `ParseReview.tsx` 신뢰도 3색, 저장 버튼 조건 | 빨간 필드 → 저장 비활성화, 수정 후 → 활성화 | gstack 색상 체크리스트 전 항목 |
| GATE-3→4 | `ProductionList.tsx`, `Admin.tsx`, 423 리다이렉트 | 423 수신 → 미납 안내 화면, 사용량 테이블 | TypeScript 에러 0 |

**최종 완료 조건:**
* `/gstack` 체크리스트 **전 항목** 통과 (섹션 13 기준)
* 업로드 → 파싱 결과 전환 **10초 이내**
* TypeScript 컴파일 에러 0

### DevOps 에이전트 — 단계별 계획

| 게이트 | 작업 | 검증 방법 | 이동 조건 |
|--------|------|-----------|-----------|
| GATE-0→1 | Railway PostgreSQL + FastAPI 배포 | 외부 URL `/api/v1/health` 200 | 백엔드 에이전트에 `DATABASE_URL` 전달 |
| GATE-3→4 | Vercel 배포, 시크릿 등록 | 배포 URL 로그인 → 파싱 플로우 동작 | Sentry 수집 확인 |
| GATE-4→5 | GitHub Actions CI/CD, `docker-compose` 설치형 | PR 머지 → 자동 배포 → health 200 | main 브랜치 자동화 완료 |

**최종 완료 조건:**
* `.env` 1줄 변경으로 AI 프로바이더 전환 동작 확인
* 코드 내 API 키 하드코딩 0건
* `docker-compose up` 설치형 로컬 전체 플로우 동작

---

## 15\. 현재 작업 상태 (2026-06-09 기준)

### 배포 상태

| 환경 | URL | 상태 |
|------|-----|------|
| 백엔드 (Railway) | `https://backend-production-9aaf.up.railway.app` | ✅ RUNNING |
| 프론트엔드 (Vercel) | `https://release-to-shipping-doc-creation.vercel.app` | ✅ READY |
| GitHub Actions CI/CD | `.github/workflows/deploy.yml` | ✅ 설정 완료 |

### 미커밋 변경사항 (로컬 작업 중)

다음 변경사항이 커밋되지 않은 상태로 로컬에 있음:

| 파일 | 변경 내용 |
|------|-----------|
| `backend/routers/orders.py` | `_extract_schedule_from_text()` 정규식 보완 — AI가 납품 일정 15건 미만 반환 시 정규식으로 자동 보완 |
| `backend/routers/production.py` | 4주 슬롯 기준 `next_monday` → `this_monday` 변경, 동일 선적주 수량 합산 |
| `backend/services/providers/anthropic_provider.py` | 납품 건수 제한 없음 (기존 최대 8건 → 무제한), `max_tokens` 2048→4096 |
| `frontend/src/pages/ProductionList.tsx` | `getFourWeekMondays()` this\_monday 기준으로 동기화 |

### 최근 커밋 이력 (직전 세션)

```
2395c38  fix: Excel 스타일 개선 및 RAN# 숫자 추출 함수 추가
7cd0d01  fix: 생산의뢰서 4주 슬롯 — 선적일 기준 절대 주차 복원 + 해상운송 기본값 21일→0일
dc45a01  fix: 생산의뢰서 4주 슬롯 — 선적일 기준 창 → 납품일 순번 기준으로 변경
c2b2790  fix: 다중 파일 업로드·파싱 프롬프트·Excel 테두리 개선
2cf15d1  fix: Invoice/PL 생성 시 선적주 1 기준 필터링
```

### 다음 할 일 (우선순위 순)

1. **미커밋 변경사항 커밋** — 로컬 작업 내용을 main 브랜치에 반영
2. **다른 고객사 SA 테스트** — BorgWarner 외 다른 발주서 파일로 파싱 정확도 검증
3. **관리자 고객사 프로필 등록** — BorgWarner 프로필 등록 (납기역산·Invoice 데이터 정확도 향상)
4. **파싱 정확도 검증** — 실제 SA 파일 10건 기준 85% 달성 여부 확인 (GATE-5 조건)

### 알려진 문제

1. **고객사명 오파싱** — AI가 ship\_to\_name 대신 우리 회사명을 파싱하는 케이스 있음 (관리자 프로필 등록으로 완화)
2. **기존 생산의뢰서** — 코드 변경 전 생성된 PR은 "선적주 1~4"로 표시됨 (신규 생성분만 실제 날짜 표시)
3. **정규식 보완 미커밋** — `_extract_schedule_from_text()` 아직 배포 안 됨

