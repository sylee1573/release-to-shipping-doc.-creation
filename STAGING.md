# STAGING 검증 환경

운영(production)을 건드리지 않고 배포 전 검증하는 Railway 상시 스테이징 환경.

## 구성

| 항목 | 값 |
|------|-----|
| Railway 프로젝트 | `jubilant-dedication` |
| staging 환경 | production 복제 (backend + 별도 빈 Postgres) |
| staging 백엔드 URL | `https://backend-staging-bb3a.up.railway.app` |
| staging DB | `DATABASE_URL = ${{Postgres.DATABASE_URL}}` → **staging 전용 Postgres** (운영 DB와 완전 격리) |
| ENVIRONMENT | `production` (CORS·쿠키 동작을 운영과 동일하게 = 인증 버그 검출용) |
| 마이그레이션 | 백엔드 부팅 시 `main.py`의 `_run_migrations()` 자동 실행 → 빈 staging DB도 스스로 스키마 생성 |

> 백엔드 staging 설정은 **Railway 환경변수**에 있다(로컬 `.env` 아님). 백엔드가 Railway에서 돌기 때문.

## 기본 루프 — 로컬 프론트 → staging 백엔드 (빠른 반복)

```bash
# 1. 지금 작업 중인 백엔드 코드를 staging에 배포 (커밋 불필요)
railway up --service backend --environment staging --detach

# 2. 로컬 프론트엔드를 staging 백엔드에 붙여 검증
cd frontend && npm run dev:staging   # → http://localhost:5173, API는 staging 백엔드

# 3. 통과하면 평소대로 커밋 → push → main 자동배포(production)
```

일반 로직·UI·API 계약 검증은 이 루프로 충분.

## 머지 직전 1회 — Vercel 프리뷰 (인증/쿠키/CORS 충실도)

계정발급·로그인처럼 **환경 경계(쿠키 Secure/SameSite, CORS origin)가 결과를 바꾸는 플로우**는
로컬 프론트가 못 잡는 버그가 있다. 머지 직전 한 번 실제 배포본 형태로 확인:

1. `staging` 브랜치 push → Vercel 프리뷰 URL 자동 발급
2. 프리뷰 스코프 env에 `VITE_API_URL = https://backend-staging-bb3a.up.railway.app` 지정
3. 프리뷰 URL은 staging 백엔드 CORS 정규식(`release-to-shipping-doc-creation*.vercel.app`)에 자동 매칭됨

## 주의

- staging DB는 **빈 상태로 시작**. 테스트 계정/데이터는 staging에서 직접 생성한다.
- staging은 운영과 **같은 ANTHROPIC_API_KEY**를 공유한다(복제됨). AI 호출 비용이 같은 키에 합산됨.
- `JWT_SECRET_KEY` 미설정 → config 기본값 사용. staging 토큰은 운영과 호환 안 됨(의도된 격리).
- `railway up`은 `.railwayignore` 기준으로 업로드(프론트/.git/테스트산출물 제외 → 가벼움).
