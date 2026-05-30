import { api } from './client'
import type { ShipmentDoc } from '../types'

export const shipmentApi = {
  list: (params?: { doc_type?: string; production_request_id?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.doc_type) qs.set('doc_type', params.doc_type)
    if (params?.production_request_id) qs.set('production_request_id', params.production_request_id)
    if (params?.limit != null) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return api.get<ShipmentDoc[]>(`/api/v1/shipment/${query ? `?${query}` : ''}`)
  },

  // 단일 또는 복수 PR로 선적서류 생성
  create: (body: {
    production_request_ids?: string[]  // 다품번 복수 선택
    production_request_id?: string     // 단일 (하위 호환)
    doc_type: 'invoice' | 'packing_list'
  }) => api.post<ShipmentDoc>('/api/v1/shipment/', body),

  downloadUrl: (id: string) => `/api/v1/shipment/${id}/download`,
}
