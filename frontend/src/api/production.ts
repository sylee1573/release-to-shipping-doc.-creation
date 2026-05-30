import { api } from './client'
import type { ProductionRequest } from '../types'

export const productionApi = {
  list: (params?: { status?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return api.get<ProductionRequest[]>(`/api/v1/production/${query ? `?${query}` : ''}`)
  },

  get: (id: string) =>
    api.get<ProductionRequest>(`/api/v1/production/${id}`),

  create: (body: { order_id: string; quantity?: number; delivery_date?: string }) =>
    api.post<ProductionRequest>('/api/v1/production/', body),

  update: (id: string, body: { adjusted_quantity?: number; adjusted_delivery_date?: string; reason: string }) =>
    api.patch<ProductionRequest>(`/api/v1/production/${id}`, body),

  updateStatus: (id: string, status: string) =>
    api.patch<ProductionRequest>(`/api/v1/production/${id}/status`, { status }),

  downloadUrl: (id: string) => `/api/v1/production/${id}/download`,
}
