-- 품목마스터: Gross 중량, 파레트당 박스 수, 파레트당 CBM 추가
ALTER TABLE item_master ADD COLUMN IF NOT EXISTS gross_weight_per_pc NUMERIC(12,6);
ALTER TABLE item_master ADD COLUMN IF NOT EXISTS boxes_per_pallet    INTEGER;
ALTER TABLE item_master ADD COLUMN IF NOT EXISTS cbm_per_pallet      NUMERIC(10,6);
