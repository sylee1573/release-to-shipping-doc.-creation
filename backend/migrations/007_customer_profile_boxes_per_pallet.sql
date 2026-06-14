-- 고객사 프로필: 파레트당 박스 수 추가 (Packing List CBM 계산 폴백값)
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS boxes_per_pallet INTEGER;
