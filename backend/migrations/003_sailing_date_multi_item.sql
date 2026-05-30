-- Migration 003: 선적일자, 4주 롤링, 다품번, 휴무캘린더

-- customer_profiles: 해상운송일수 추가
ALTER TABLE customer_profiles
    ADD COLUMN IF NOT EXISTS sea_transit_days INTEGER NOT NULL DEFAULT 21;

-- production_requests: 선적일, 4주 스케줄
ALTER TABLE production_requests
    ADD COLUMN IF NOT EXISTS sailing_date DATE;

ALTER TABLE production_requests
    ADD COLUMN IF NOT EXISTS weekly_schedule JSONB;

-- shipment_docs: 다품번 묶음
ALTER TABLE shipment_docs
    ADD COLUMN IF NOT EXISTS pr_ids JSONB;

-- holiday_calendar: 고객사별 휴무 주 관리
CREATE TABLE IF NOT EXISTS holiday_calendar (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id),
    week_start_date  DATE NOT NULL,
    reason           VARCHAR(200),
    customer_name    VARCHAR(200),   -- NULL = 전체 고객사 적용
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holiday_calendar_tenant_week
    ON holiday_calendar (tenant_id, week_start_date);

ALTER TABLE holiday_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS holiday_calendar_tenant_isolation
    ON holiday_calendar
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);
