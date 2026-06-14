import { api } from './client'
import type {
  CustomerProfile,
  ItemMaster,
  ItemMasterBulkResult,
  ParsingTemplate,
  Tenant,
  UsageReport,
  User,
} from '../types'

export const adminApi = {
  // ── 계정 관리 ────────────────────────────────────────────────
  listUsers: (tenantId?: string) => {
    const qs = tenantId ? `?tenant_id=${tenantId}` : ''
    return api.get<User[]>(`/api/v1/admin/users${qs}`)
  },

  createUser: (body: {
    email: string
    password: string
    full_name?: string
    role?: string
    tenant_id?: string
  }) => api.post<User>('/api/v1/admin/users', body),

  setUserActive: (userId: string, isActive: boolean) =>
    api.patch<User>(`/api/v1/admin/users/${userId}/active`, { is_active: isActive }),

  // ── 플랫폼 관리 ──────────────────────────────────────────────
  getUsage: (billingMonth?: string) => {
    const qs = billingMonth ? `?billing_month=${billingMonth}` : ''
    return api.get<UsageReport[]>(`/api/v1/admin/usage${qs}`)
  },

  restoreTenant: (tenantId: string) =>
    api.patch<{ message: string }>(`/api/v1/admin/tenants/${tenantId}/restore`),

  listTenants: () =>
    api.get<Tenant[]>('/api/v1/admin/tenants'),

  createTenant: (body: {
    name: string
    business_number?: string
    contact_email: string
    contact_phone?: string
  }) => api.post<Tenant>('/api/v1/admin/tenants', body),

  listTemplates: (tenantId?: string) => {
    const qs = tenantId ? `?tenant_id=${tenantId}` : ''
    return api.get<ParsingTemplate[]>(`/api/v1/admin/templates${qs}`)
  },

  createTemplate: (body: {
    tenant_id: string
    customer_name: string
    template_description?: string
    sample_text?: string
  }) => api.post<ParsingTemplate>('/api/v1/admin/templates', body),

  deleteTemplate: (templateId: string) =>
    api.delete<{ message: string }>(`/api/v1/admin/templates/${templateId}`),

  // ── 고객사 프로필 ─────────────────────────────────────────────
  listCustomerProfiles: () =>
    api.get<CustomerProfile[]>('/api/v1/admin/customer-profiles'),

  createCustomerProfile: (body: {
    customer_name: string
    date_type: 'arrival' | 'completion'
    ship_to_name?: string
    ship_to_address?: string
    final_destination?: string
    sea_transit_days: number
    shipping_prep_days: number
    production_lead_days: number
    boxes_per_pallet?: number
  }) => api.post<CustomerProfile>('/api/v1/admin/customer-profiles', body),

  updateCustomerProfile: (id: string, body: {
    date_type?: 'arrival' | 'completion'
    ship_to_name?: string
    ship_to_address?: string
    final_destination?: string
    sea_transit_days?: number
    shipping_prep_days?: number
    production_lead_days?: number
    boxes_per_pallet?: number
  }) => api.put<CustomerProfile>(`/api/v1/admin/customer-profiles/${id}`, body),

  deleteCustomerProfile: (id: string) =>
    api.delete<{ message: string }>(`/api/v1/admin/customer-profiles/${id}`),

  // ── 품목마스터 ────────────────────────────────────────────────
  listItemMaster: (customerName?: string) => {
    const qs = customerName ? `?customer_name=${encodeURIComponent(customerName)}` : ''
    return api.get<ItemMaster[]>(`/api/v1/admin/item-master${qs}`)
  },

  createItemMaster: (body: {
    customer_name: string
    part_number: string
    description?: string
    unit_price?: number
    net_weight_per_pc?: number
    pcs_per_box?: number
    boxes_per_pallet?: number
  }) => api.post<ItemMaster>('/api/v1/admin/item-master', body),

  updateItemMaster: (id: string, body: {
    description?: string
    unit_price?: number
    net_weight_per_pc?: number
    pcs_per_box?: number
    boxes_per_pallet?: number
  }) => api.put<ItemMaster>(`/api/v1/admin/item-master/${id}`, body),

  deleteItemMaster: (id: string) =>
    api.delete<{ message: string }>(`/api/v1/admin/item-master/${id}`),

  bulkUploadItemMaster: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.upload<ItemMasterBulkResult>('/api/v1/admin/item-master/bulk-upload', fd)
  },
}
