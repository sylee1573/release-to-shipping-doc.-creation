-- Migration 008: 정액제 과금 — tenants에 월정액(monthly_fee) 추가
-- 인보이스 발행 시 이 금액으로 청구. NULL/0 이면 발행 대상 제외.
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS monthly_fee DECIMAL(12,2);
