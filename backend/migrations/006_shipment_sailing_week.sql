-- 선적서류 생성 시 기준 선적주(월요일) 저장
-- NULL = 기존 데이터(슬롯1 기준 폴백)
ALTER TABLE shipment_docs ADD COLUMN IF NOT EXISTS sailing_week_monday DATE;
