import { api } from './client'
import type {
  CustomerProfile,
  ItemMaster,
  ParsingTemplate,
  Tenant,
  UsageReport,
} from '../types'

export const adminApi = {
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
    shipping_prep_days: number
    production_lead_days: number
  }) => api.post<CustomerProfile>('/api/v1/admin/customer-profiles', body),

  updateCustomerProfile: (id: string, body: {
    date_type?: 'arrival' | 'completion'
    ship_to_name?: string
    ship_to_address?: string
    final_destination?: string
    shipping_prep_days?: number
    production_lead_days?: number
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
  }) => api.post<ItemMaster>('/api/v1/admin/item-master', body),

  updateItemMaster: (id: string, body: {
    description?: string
    unit_price?: number
    net_weight_per_pc?: number
    pcs_per_box?: number
  }) => api.put<ItemMaster>(`/api/v1/admin/item-master/${id}`, body),

  deleteItemMaster: (id: string) =>
    api.delete<{ message: string }>(`/api/v1/admin/item-master/${id}`),
}
