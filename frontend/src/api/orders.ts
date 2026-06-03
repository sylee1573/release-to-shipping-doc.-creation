import { api } from './client'
import type { Order } from '../types'

export const ordersApi = {
  list: (params?: { parse_status?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.parse_status) qs.set('parse_status', params.parse_status)
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return api.get<Order[]>(`/api/v1/orders/${query ? `?${query}` : ''}`)
  },

  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.upload<Order>('/api/v1/orders/upload', form)
  },

  getParseResult: (id: string) => api.get<Order>(`/api/v1/orders/${id}/parse-result`),

  confirm: (id: string, confirmedData: Record<string, string | number>) =>
    api.post<Order>(`/api/v1/orders/${id}/confirm`, { confirmed_data: confirmedData }),

  autoConfirm: (id: string) =>
    api.post<{ order_id: string; warnings: Array<{ field: string; label: string; confidence: number; value: string }> }>(
      `/api/v1/orders/${id}/auto-confirm`,
      {}
    ),
}
