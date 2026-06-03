-- Migration 005: invoices 테이블에 warning_3_sent_at 추가 (D+44 중단예고)
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS warning_3_sent_at TIMESTAMP WITH TIME ZONE;
