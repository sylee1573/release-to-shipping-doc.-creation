import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { shipmentApi } from '../api/shipment'
import { productionApi } from '../api/production'
import { useAuthStore } from '../store/authStore'
import type { ShipmentDoc } from '../types'

const DOC_LABEL: Record<string, string> = {
  invoice:      'Invoice',
  packing_list: 'Packing List',
}
const DOC_STYLE: Record<string, string> = {
  invoice:      'bg-blue-100 text-blue-700',
  packing_list: 'bg-purple-100 text-purple-700',
}

function DownloadButton({ doc }: { doc: ShipmentDoc }) {
  const token = useAuthStore((s) => s.token)
  const handleDownload = async () => {
    const res = await fetch(shipmentApi.downloadUrl(doc.id), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.doc_number ?? doc.id}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <button onClick={handleDownload} className="btn-secondary text-xs py-1 px-3">
      Excel 다운로드
    </button>
  )
}

function CreateDocModal({ onClose }: { onClose: () => void }) {
  const [prId, setPrId] = useState('')
  const [docType, setDocType] = useState<'invoice' | 'packing_list'>('invoice')
  const qc = useQueryClient()

  const { data: productions = [] } = useQuery({
    queryKey: ['production', 'confirmed'],
    queryFn: () => productionApi.list({ status: 'confirmed' }),
  })

  const mutation = useMutation({
    mutationFn: () => shipmentApi.create({ production_request_id: prId, doc_type: docType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipment'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="font-bold text-gray-900 mb-4">선적서류 생성</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">생산의뢰서 선택</label>
            <select
              className="input"
              value={prId}
              onChange={(e) => setPrId(e.target.value)}
            >
              <option value="">-- 선택하세요 --</option>
              {productions.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.request_number} {pr.customer_name ? `(${pr.customer_name})` : ''}
                </option>
              ))}
            </select>
            {productions.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">'확정' 상태의 생산의뢰서가 없습니다</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">서류 종류</label>
            <div className="flex gap-3">
              {(['invoice', 'packing_list'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={t}
                    checked={docType === t}
                    onChange={() => setDocType(t)}
                    className="accent-brand-600"
                  />
                  <span className="text-sm">{DOC_LABEL[t]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn-secondary">취소</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!prId || mutation.isPending}
            className="btn-primary"
          >
            생성
          </button>
        </div>
      </div>
    </div>
  )
}

const TYPE_FILTERS = [
  { value: '', label: '전체' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'packing_list', label: 'Packing List' },
]

export default function ShipmentDocs() {
  const [typeFilter, setTypeFilter] = useState('')
  const [creating, setCreating] = useState(false)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['shipment', typeFilter],
    queryFn: () => shipmentApi.list({ doc_type: typeFilter || undefined }),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">선적서류</h1>
          <p className="text-gray-500 text-sm mt-1">Invoice 및 Packing List 목록입니다</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary text-sm">
          + 서류 생성
        </button>
      </div>

      {/* 종류 필터 탭 */}
      <div className="flex gap-1 mb-4">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setTypeFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              typeFilter === f.value
                ? 'bg-brand-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card text-center py-16 text-gray-400">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-4xl mb-3">🚢</div>
          <p className="text-gray-500 font-medium">아직 선적서류가 없습니다</p>
          <p className="text-gray-400 text-sm mt-1">
            확정된 생산의뢰서에서 Invoice와 Packing List를 생성할 수 있습니다
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((doc) => (
            <div key={doc.id} className="card flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm font-semibold text-gray-900">
                    {doc.doc_number}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DOC_STYLE[doc.doc_type]}`}>
                    {DOC_LABEL[doc.doc_type]}
                  </span>
                </div>
                <p className="text-sm text-gray-500">
                  발행일: {doc.issued_at ? new Date(doc.issued_at).toLocaleDateString('ko-KR') : '—'}
                </p>
              </div>
              <DownloadButton doc={doc} />
            </div>
          ))}
        </div>
      )}

      {creating && <CreateDocModal onClose={() => setCreating(false)} />}
    </div>
  )
}
