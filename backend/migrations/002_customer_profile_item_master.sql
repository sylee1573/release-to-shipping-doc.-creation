-- Migration 002: customer_profiles + item_master 테이블 추가
--                production_requests에 ran_number 컬럼 추가
-- Railway PostgreSQL에서 실행

-- ── customer_profiles ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_profiles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    customer_name       VARCHAR(200) NOT NULL,
    date_type           VARCHAR(20) NOT NULL DEFAULT 'arrival',  -- 'arrival' | 'completion'
    ship_to_name        VARCHAR(500),
    ship_to_address     TEXT,
    final_destination   VARCHAR(500),
    shipping_prep_days  INTEGER NOT NULL DEFAULT 2,
    production_lead_days INTEGER NOT NULL DEFAULT 7,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_tenant_name
    ON customer_profiles (tenant_id, customer_name);

-- RLS
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS customer_profiles_tenant_isolation
    ON customer_profiles
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);

-- ── item_master ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_master (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    customer_name       VARCHAR(200) NOT NULL,
    part_number         VARCHAR(200) NOT NULL,
    description         VARCHAR(500),
    unit_price          NUMERIC(14, 6),
    net_weight_per_pc   NUMERIC(12, 6),
    pcs_per_box         INTEGER,
    ran_last            INTEGER NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_item_master_tenant_part
    ON item_master (tenant_id, part_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_master_unique
    ON item_master (tenant_id, customer_name, part_number)
    WHERE is_active = TRUE;

-- RLS
ALTER TABLE item_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS item_master_tenant_isolation
    ON item_master
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);

-- ── production_requests: ran_number 컬럼 추가 ─────────────────────────
ALTER TABLE production_requests
    ADD COLUMN IF NOT EXISTS ran_number INTEGER;
