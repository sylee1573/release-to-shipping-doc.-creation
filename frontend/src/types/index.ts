export interface FieldValue {
  value: string | number | null
  confidence: number
  raw_text?: string | null
}

export interface ParsedData {
  fields: Record<string, FieldValue>
  parse_notes?: string | null
}

export interface Order {
  id: string
  tenant_id: string
  customer_name: string | null
  file_name: string | null
  parse_status: 'pending' | 'processing' | 'done' | 'failed'
  parsed_data: ParsedData | null
  confirmed_data: Record<string, string | number> | null
  confirmed_at: string | null
  created_at: string
}

export interface WeeklySlot {
  slot: number
  week_start: string
  sailing_week_monday: string
  delivery_date: string
  quantity: number
  sailing_date: string
  production_end: string
  is_holiday: boolean
  holiday_reason?: string | null
}

export interface ProductionRequest {
  id: string
  tenant_id: string
  order_id: string
  request_number: string | null
  customer_name: string | null
  sailing_date: string | null
  part_number: string | null
  production_start_date: string | null
  production_end_date: string | null
  quantity: number | null
  adjusted_quantity: number | null
  adjusted_delivery_date: string | null
  ran_number: number | null
  weekly_schedule: WeeklySlot[] | null
  change_history: ChangeHistory[]
  excel_path: string | null
  status: 'draft' | 'confirmed' | 'in_production' | 'done'
  created_at: string
  updated_at: string
}

export interface ChangeHistory {
  changed_at: string
  changed_by: string
  field: string
  before: string | number
  after: string | number
  reason: string
}

export interface ShipmentDoc {
  id: string
  tenant_id: string
  production_request_id: string
  pr_ids: string[] | null
  doc_type: 'invoice' | 'packing_list'
  doc_number: string | null
  excel_path: string | null
  issued_at: string | null
  created_at: string
}

export interface User {
  id: string
  tenant_id: string
  email: string
  full_name: string | null
  role: string
  is_active: boolean
  is_superadmin?: boolean
}

export interface UsageReport {
  tenant_id: string
  tenant_name: string
  billing_month: string
  unit_count: number
  amount: number | null
  status: string
}

export interface Tenant {
  id: string
  name: string
  business_number: string | null
  contact_email: string
  contact_phone: string | null
  is_active: boolean
  suspended_at: string | null
  plan_type: string
  created_at: string
}

export interface ParsingTemplate {
  id: string
  tenant_id: string
  customer_name: string
  template_description: string | null
  is_active: boolean
  created_at: string
}

export interface CustomerProfile {
  id: string
  tenant_id: string
  customer_name: string
  date_type: 'arrival' | 'completion'
  ship_to_name: string | null
  ship_to_address: string | null
  final_destination: string | null
  sea_transit_days: number
  shipping_prep_days: number
  production_lead_days: number
  boxes_per_pallet: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ItemMaster {
  id: string
  tenant_id: string
  customer_name: string
  part_number: string
  description: string | null
  unit_price: number | null
  net_weight_per_pc: number | null
  pcs_per_box: number | null
  boxes_per_pallet: number | null
  ran_last: number
  is_active: boolean
  created_at: string
  updated_at: string
}
