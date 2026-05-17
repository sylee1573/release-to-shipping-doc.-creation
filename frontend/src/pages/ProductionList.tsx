import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { productionApi } from '../api/production'
import { useAuthStore } from '../store/authStore'
import type { ProductionRequest } from '../types'

const STATUS_STYLE: Record<string, string> = {
  draft:         'bg-gray-100 text-gray-600',
  confirmed:     'bg-blue-100 text-blue-700',
  in_production: 'bg-yellow-100 text-yellow-700',
  done:          'bg-green-100 text-green-700',
}
const STATUS_LABEL: Record<string, string> = {
  draft: '초안', confirmed: '확정', in_production: '생산 중', done: '완료',
}

// 다음 진행 가능한 상태 (버튼에 표시)
const NEXT_STATUS: Record<string, { status: string; label: string } | null> = {
  draft:         { status: 'confirmed',     label: '확정' },
  confirmed:     { status: 'in_production', label: '생산 시작' },
  in_production: { status: 'done',          label: '완료' },
  done:          null,
}

function DownloadButton({ prId, label }: { prId: string; label: string }) {
  const token = useAuthStore((s) => s.token)
  const handleDownload = async () => {
    const res = await fetch(productionApi.downloadUrl(prId), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${label}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <button onClick={handleDownload} className="btn-secondary text-xs py-1 px-3">
      Excel 다운로드
    </button>
  )
}

function StatusButton({ pr }: { pr: ProductionRequest }) {
  const qc = useQueryClient()
  const next = NEXT_STATUS[pr.status]
  const mutation = useMutation({
    mutationFn: () => productionApi.updateStatus(pr.id, next!.status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['production'] }),
  })
  if (!next) return null
  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="btn-primary text-xs py-1 px-3"
    >
      {next.label}
    </button>
  )
}

function EditModal({ pr, onClose }: { pr: ProductionRequest; onClose: () => void }) {
  const [qty, setQty] = useState(String(pr.adjusted_quantity ?? pr.quantity ?? ''))
  const [deliveryDate, setDeliveryDate] = useState(pr.adjusted_delivery_date ?? pr.production_end_date ?? '')
  const [reason, setReason] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () =>
      productionApi.update(pr.id, {
        adjusted_quantity: qty ? Number(qty) : undefined,
        adjusted_delivery_date: deliveryDate || undefined,
        reason,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production'] }); onClose() },
  })

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="font-bold text-gray-900 mb-4">수량 / 납기 수정</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">수량</label>
            <input type="number" className="input" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">납기일</label>
            <input type="date" className="input" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              변경 사유 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 고객 요청 수량 조정"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary">취소</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!reason || mutation.isPending}
            className="btn-primary"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

function ChangeHistoryPanel({ history }: { history: ProductionRequest['change_history'] }) {
  if (!history || history.length === 0) return null
  return (
    <div className="mt-3 pt-3 border-t border-gray-50">
      <p className="text-xs font-medium text-gray-400 mb-1.5">변경이력</p>
      <div className="space-y-1">
        {history.map((h, i) => (
          <p key={i} className="text-xs text-gray-500">
            {new Date(h.changed_at).toLocaleDateString('ko-KR')} —{' '}
            {h.field === 'quantity' ? `수량 ${h.before} → ${h.after}` : `납기 ${h.before} → ${h.after}`}
            {h.reason && ` (${h.reason})`}
          </p>
        ))}
      </div>
    </div>
  )
}

const STATUS_FILTERS = [
  { value: '', label: '전체' },
  { value: 'draft', label: '초안' },
  { value: 'confirmed', label: '확정' },
  { value: 'in_production', label: '생산 중' },
  { value: 'done', label: '완료' },
]

export default function ProductionList() {
  const [editing, setEditing] = useState<ProductionRequest | null>(null)
  const [statusFilter, setStatusFilter] = useState('')

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['production', statusFilter],
    queryFn: () => productionApi.list({ status: statusFilter || undefined }),
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">생산의뢰서</h1>
        <p className="text-gray-500 text-sm mt-1">생성된 생산의뢰서 목록입니다</p>
      </div>

      {/* 상태 필터 탭 */}
      <div className="flex gap-1 mb-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === f.value
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
          <div className="text-4xl mb-3">🏭</div>
          <p className="text-gray-500 font-medium">
            {statusFilter ? `'${STATUS_LABEL[statusFilter]}' 상태의 생산의뢰서가 없습니다` : '아직 생산의뢰서가 없습니다'}
          </p>
          <p className="text-gray-400 text-sm mt-1">발주서를 파싱·확인하면 생산의뢰서를 생성할 수 있습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((pr) => (
            <div key={pr.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-semibold text-gray-900">
                      {pr.request_number}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[pr.status]}`}>
                      {STATUS_LABEL[pr.status]}
                    </span>
                  </div>
                  {pr.customer_name && (
                    <p className="text-sm font-medium text-gray-700 mb-1">{pr.customer_name}</p>
                  )}
                  <div className="text-sm text-gray-500 flex flex-wrap gap-x-4 gap-y-0.5">
                    <span>수량: {(pr.adjusted_quantity ?? pr.quantity)?.toLocaleString()}</span>
                    <span>
                      생산: {pr.production_start_date} ~ {pr.production_end_date}
                    </span>
                    {pr.adjusted_delivery_date && (
                      <span className="text-orange-600">
                        수정납기: {pr.adjusted_delivery_date}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                  {pr.status === 'draft' && (
                    <button
                      onClick={() => setEditing(pr)}
                      className="btn-secondary text-xs py-1 px-3"
                    >
                      수정
                    </button>
                  )}
                  <StatusButton pr={pr} />
                  <DownloadButton prId={pr.id} label={pr.request_number ?? pr.id} />
                </div>
              </div>
              <ChangeHistoryPanel history={pr.change_history} />
            </div>
          ))}
        </div>
      )}

      {editing && <EditModal pr={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
