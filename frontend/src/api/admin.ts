import { api } from './client'
import type { Tenant, ParsingTemplate, UsageReport } from '../types'

export const adminApi = {
  getUsage: (billingMonth?: string) => {
    const qs = billingMonth ? `?billing_month=${billingMonth}` : ''
    return api.get<UsageReport[]>(`/api/v1/admin/usage${qs}`)
  },

  restoreTenant: (tenantId: string) =>
    api.patch<{ message: string }>(`/api/v1/admin/tenants/${tenantId}/restore`),

  listTenants: () =>
    api.get<Tenant[]>('/api/v1/admin/tenants'),

  createTenant: (body: { name: string; business_number?: string; contact_email: string; contact_phone?: string }) =>
    api.post<Tenant>('/api/v1/admin/tenants', body),

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
}
