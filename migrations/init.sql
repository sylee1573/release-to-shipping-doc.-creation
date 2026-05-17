-- ═══════════════════════════════════════════════════════════
-- 초기 스키마 생성 + Row-Level Security (RLS) 설정
-- ═══════════════════════════════════════════════════════════

-- 확장 기능
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ───────────────────────────────────────────────────────────
-- 테이블 생성
-- ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    business_number VARCHAR(20),
    contact_email VARCHAR(200) NOT NULL,
    contact_phone VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    suspended_at TIMESTAMPTZ,
    plan_type VARCHAR(50) DEFAULT 'per_unit',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    email VARCHAR(200) NOT NULL UNIQUE,
    password_hash VARCHAR(200) NOT NULL,
    full_name VARCHAR(200),
    role VARCHAR(50) DEFAULT 'member',
    is_active BOOLEAN DEFAULT TRUE,
    is_superadmin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    billing_month VARCHAR(7) NOT NULL,
    unit_count INTEGER NOT NULL DEFAULT 0,
    amount DECIMAL(12,2),
    issued_at TIMESTAMPTZ,
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending',
    warning_1_sent_at TIMESTAMPTZ,
    warning_2_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parsing_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    customer_name VARCHAR(200) NOT NULL,
    template_description TEXT,
    field_mapping JSONB,
    sample_text TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    customer_name VARCHAR(200),
    file_name VARCHAR(500),
    file_path VARCHAR(1000),
    parse_status VARCHAR(20) DEFAULT 'pending',
    raw_text TEXT,
    parsed_data JSONB,
    confirmed_data JSONB,
    confirmed_by UUID REFERENCES users(id),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    request_number VARCHAR(100),
    production_start_date DATE,
    production_end_date DATE,
    quantity INTEGER,
    adjusted_quantity INTEGER,
    adjusted_delivery_date DATE,
    change_history JSONB DEFAULT '[]',
    excel_path VARCHAR(1000),
    status VARCHAR(20) DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipment_docs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    production_request_id UUID NOT NULL REFERENCES production_requests(id),
    doc_type VARCHAR(20) NOT NULL,
    doc_number VARCHAR(100),
    excel_path VARCHAR(1000),
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────
-- 인덱스
-- ───────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_id ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_parse_status ON orders(parse_status);
CREATE INDEX IF NOT EXISTS idx_production_requests_tenant_id ON production_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_production_requests_order_id ON production_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_shipment_docs_tenant_id ON shipment_docs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- ───────────────────────────────────────────────────────────
-- Row-Level Security (RLS) — 테넌트 간 데이터 격리
-- ───────────────────────────────────────────────────────────

-- 세션 변수: 앱에서 SET app.current_tenant_id = '{uuid}' 로 설정
-- superadmin은 RLS 우회 (BYPASSRLS 역할 부여 또는 정책에서 제외)

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE parsing_templates ENABLE ROW LEVEL SECURITY;

-- orders RLS 정책
CREATE POLICY orders_tenant_isolation ON orders
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- production_requests RLS 정책
CREATE POLICY production_requests_tenant_isolation ON production_requests
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- shipment_docs RLS 정책
CREATE POLICY shipment_docs_tenant_isolation ON shipment_docs
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- invoices RLS 정책
CREATE POLICY invoices_tenant_isolation ON invoices
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- parsing_templates RLS 정책
CREATE POLICY parsing_templates_tenant_isolation ON parsing_templates
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- ───────────────────────────────────────────────────────────
-- updated_at 자동 갱신 트리거
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER production_requests_updated_at
    BEFORE UPDATE ON production_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
