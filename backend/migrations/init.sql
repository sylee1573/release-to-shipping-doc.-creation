-- 전체 스키마 초기화 (docker-compose 최초 실행 시 1회 적용)
-- 모든 구문은 IF NOT EXISTS로 멱등성 보장

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── tenants ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(200) NOT NULL,
    business_number  VARCHAR(20),
    contact_email    VARCHAR(200) NOT NULL,
    contact_phone    VARCHAR(50),
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    suspended_at     TIMESTAMP WITH TIME ZONE,
    plan_type        VARCHAR(50) NOT NULL DEFAULT 'per_unit',
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── users ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    email         VARCHAR(200) NOT NULL UNIQUE,
    password_hash VARCHAR(200) NOT NULL,
    full_name     VARCHAR(200),
    role          VARCHAR(50) NOT NULL DEFAULT 'member',
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    is_superadmin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── orders ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id),
    customer_name  VARCHAR(200),
    file_name      VARCHAR(500),
    file_path      VARCHAR(1000),
    parse_status   VARCHAR(20) NOT NULL DEFAULT 'pending',
    raw_text       TEXT,
    parsed_data    JSONB,
    confirmed_data JSONB,
    confirmed_by   UUID REFERENCES users(id),
    confirmed_at   TIMESTAMP WITH TIME ZONE,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders (tenant_id);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS orders_tenant_isolation ON orders
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);

-- ── production_requests ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_requests (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              UUID NOT NULL REFERENCES tenants(id),
    order_id               UUID NOT NULL REFERENCES orders(id),
    request_number         VARCHAR(100),
    sailing_date           DATE,
    production_start_date  DATE,
    production_end_date    DATE,
    weekly_schedule        JSONB DEFAULT '[]',
    quantity               INTEGER,
    adjusted_quantity      INTEGER,
    adjusted_delivery_date DATE,
    change_history         JSONB NOT NULL DEFAULT '[]',
    ran_number             INTEGER,
    excel_path             VARCHAR(1000),
    status                 VARCHAR(20) NOT NULL DEFAULT 'draft',
    created_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_requests_tenant ON production_requests (tenant_id);
CREATE INDEX IF NOT EXISTS idx_production_requests_order  ON production_requests (order_id);

ALTER TABLE production_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS production_requests_tenant_isolation ON production_requests
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);

-- ── shipment_docs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipment_docs (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    production_request_id UUID NOT NULL REFERENCES production_requests(id),
    doc_type              VARCHAR(20) NOT NULL,
    pr_ids                JSONB,
    doc_number            VARCHAR(100),
    excel_path            VARCHAR(1000),
    issued_at             TIMESTAMP WITH TIME ZONE,
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipment_docs_tenant ON shipment_docs (tenant_id);

ALTER TABLE shipment_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS shipment_docs_tenant_isolation ON shipment_docs
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);

-- ── invoices ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES tenants(id),
    billing_month      VARCHAR(7) NOT NULL,
    unit_count         INTEGER NOT NULL DEFAULT 0,
    amount             DECIMAL(12,2),
    issued_at          TIMESTAMP WITH TIME ZONE,
    due_date           DATE NOT NULL,
    paid_at            TIMESTAMP WITH TIME ZONE,
    status             VARCHAR(20) NOT NULL DEFAULT 'pending',
    warning_1_sent_at  TIMESTAMP WITH TIME ZONE,
    warning_2_sent_at  TIMESTAMP WITH TIME ZONE,
    warning_3_sent_at  TIMESTAMP WITH TIME ZONE,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices (tenant_id);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS invoices_tenant_isolation ON invoices
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);

-- ── parsing_templates ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parsing_templates (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL REFERENCES tenants(id),
    customer_name        VARCHAR(200) NOT NULL,
    template_description TEXT,
    field_mapping        JSONB,
    sample_text          TEXT,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE parsing_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS parsing_templates_tenant_isolation ON parsing_templates
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);

-- ── customer_profiles ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_profiles (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL REFERENCES tenants(id),
    customer_name        VARCHAR(200) NOT NULL,
    date_type            VARCHAR(20) NOT NULL DEFAULT 'arrival',
    ship_to_name         VARCHAR(500),
    ship_to_address      TEXT,
    final_destination    VARCHAR(500),
    sea_transit_days     INTEGER NOT NULL DEFAULT 21,
    shipping_prep_days   INTEGER NOT NULL DEFAULT 2,
    production_lead_days INTEGER NOT NULL DEFAULT 7,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_tenant_name
    ON customer_profiles (tenant_id, customer_name);

ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS customer_profiles_tenant_isolation ON customer_profiles
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);

-- ── item_master ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_master (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    customer_name       VARCHAR(200) NOT NULL,
    part_number         VARCHAR(200) NOT NULL,
    description         VARCHAR(500),
    unit_price          NUMERIC(14,6),
    net_weight_per_pc   NUMERIC(12,6),
    gross_weight_per_pc NUMERIC(12,6),
    pcs_per_box         INTEGER,
    boxes_per_pallet    INTEGER,
    cbm_per_pallet      NUMERIC(10,6),
    ran_last            INTEGER NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_item_master_tenant_part ON item_master (tenant_id, part_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_master_unique
    ON item_master (tenant_id, customer_name, part_number) WHERE is_active = TRUE;

ALTER TABLE item_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS item_master_tenant_isolation ON item_master
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);

-- ── holiday_calendar ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holiday_calendar (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    week_start_date DATE NOT NULL,
    reason          VARCHAR(200),
    customer_name   VARCHAR(200),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holiday_calendar_tenant_week
    ON holiday_calendar (tenant_id, week_start_date);

ALTER TABLE holiday_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS holiday_calendar_tenant_isolation ON holiday_calendar
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);
