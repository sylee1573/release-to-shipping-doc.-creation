import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { productionApi } from '../api/production'
import { shipmentApi } from '../api/shipment'
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
const NEXT_STATUS: Record<string, { status: string; label: string } | null> = {
  draft:         { status: 'confirmed',     label: '확정' },
  confirmed:     { status: 'in_production', label: '생산 시작' },
  in_production: { status: 'done',          label: '완료' },
  done:          null,
}

// ── 주간 스케줄 미니 표 ─────────────────────────────────────
function WeeklySchedule({ schedule }: { schedule: ProductionRequest['weekly_schedule'] }) {
  if (!schedule || schedule.length === 0) return null
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="text-xs border-collapse min-w-max">
        <thead>
          <tr className="bg-gray-50">
            {['주차', '납품일', '수량(EA)', '선적일', '생산완료'].map((h) => (
              <th key={h} className="px-2 py-1 border border-gray-200 text-gray-500 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(schedule as any[]).map((s, i) => (
            <tr key={i} className={s.is_holiday ? 'bg-yellow-50' : 'hover:bg-gray-50'}>
              <td className="px-2 py-1 border border-gray-200 text-center font-medium text-gray-700">{s.slot}주</td>
              <td className="px-2 py-1 border border-gray-200 text-gray-600 whitespace-nowrap">{s.delivery_date || '—'}</td>
              <td className="px-2 py-1 border border-gray-200 text-right font-mono">
                {s.is_holiday ? (
                  <span className="text-yellow-600">{s.holiday_reason || '휴무'}</span>
                ) : (
                  <span className="text-gray-900">{(s.quantity ?? 0).toLocaleString()}</span>
                )}
              </td>
              <td className="px-2 py-1 border border-gray-200 text-gray-600 whitespace-nowrap">{s.is_holiday ? '—' : s.sailing_date || '—'}</td>
              <td className="px-2 py-1 border border-gray-200 text-gray-600 whitespace-nowrap">{s.is_holiday ? '—' : s.production_end || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── 다운로드 버튼 ───────────────────────────────────────────
function DownloadButton({ prId, label }: { prId: string; label: string }) {
  const token = useAuthStore((s) => s.token)
  const handleDownload = async () => {
    const res = await fetch(productionApi.downloadUrl(prId), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `${label}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <button onClick={handleDownload} className="btn-secondary text-xs py-1 px-3">
      Excel
    </button>
  )
}

// ── 상태 전환 버튼 ──────────────────────────────────────────
function StatusButton({ pr }: { pr: ProductionRequest }) {
  const qc = useQueryClient()
  const next = NEXT_STATUS[pr.status]
  const mutation = useMutation({
    mutationFn: () => productionApi.updateStatus(pr.id, next!.status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['production'] }),
  })
  if (!next) return null
  return (
    <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
      className="btn-primary text-xs py-1 px-3">
      {next.label}
    </button>
  )
}

// ── 수정 모달 ───────────────────────────────────────────────
function EditModal({ pr, onClose }: { pr: ProductionRequest; onClose: () => void }) {
  const [qty, setQty] = useState(String(pr.adjusted_quantity ?? pr.quantity ?? ''))
  const [deliveryDate, setDeliveryDate] = useState(pr.adjusted_delivery_date ?? pr.production_end_date ?? '')
  const [reason, setReason] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => productionApi.update(pr.id, {
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
            <label className="block text-sm font-medium text-gray-700 mb-1">변경 사유 *</label>
            <input type="text" className="input" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="예: 고객 요청 수량 조정" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary">취소</button>
          <button onClick={() => mutation.mutate()} disabled={!reason || mutation.isPending} className="btn-primary">저장</button>
        </div>
      </div>
    </div>
  )
}

// ── 변경이력 패널 ───────────────────────────────────────────
function ChangeHistoryPanel({ history }: { history: ProductionRequest['change_history'] }) {
  if (!history || history.length === 0) return null
  return (
    <div className="mt-2 pt-2 border-t border-gray-50">
      <p className="text-xs font-medium text-gray-400 mb-1">변경이력</p>
      <div className="space-y-0.5">
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

// ── 서류 생성 확인 모달 ─────────────────────────────────────
function GenerateDocsModal({
  selectedPRs,
  onClose,
}: {
  selectedPRs: ProductionRequest[]
  onClose: () => void
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()

  // 고객사별 그룹핑
  const grouped = selectedPRs.reduce<Record<string, ProductionRequest[]>>((acc, pr) => {
    const key = pr.customer_name ?? '(고객사 미상)'
    if (!acc[key]) acc[key] = []
    acc[key].push(pr)
    return acc
  }, {})

  const createMutation = useMutation({
    mutationFn: async () => {
      for (const [, prs] of Object.entries(grouped)) {
        const ids = prs.map((p) => p.id)
        await shipmentApi.create({ production_request_ids: ids, doc_type: 'invoice' })
        await shipmentApi.create({ production_request_ids: ids, doc_type: 'packing_list' })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipment'] })
      navigate('/shipment')
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-lg font-bold text-gray-900">Invoice / Packing List 생성</h2>
          <p className="text-sm text-gray-500 mt-0.5">고객사별로 자동 분류하여 생성합니다</p>
        </div>

        <div className="px-6 py-4 space-y-3">
          {Object.entries(grouped).map(([customer, prs]) => (
            <div key={customer} className="border border-gray-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-gray-800 mb-2">{customer}</p>
              <div className="space-y-1">
                {prs.map((pr) => {
                  const slot1 = (pr as any).weekly_schedule?.[0]
                  return (
                    <div key={pr.id} className="flex justify-between text-xs text-gray-600">
                      <span className="font-mono">{pr.request_number}</span>
                      <span>{(slot1?.quantity ?? pr.quantity ?? 0).toLocaleString()} EA</span>
                      <span>{slot1?.sailing_date ?? pr.sailing_date ?? '—'} 선적</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                → Invoice 1건 + Packing List 1건 생성
              </p>
            </div>
          ))}
        </div>

        {createMutation.isError && (
          <p className="px-6 text-sm text-red-600">{(createMutation.error as Error).message}</p>
        )}

        <div className="px-6 py-4 flex justify-end gap-2 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">취소</button>
          <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="btn-primary">
            {createMutation.isPending ? '생성 중...' : '생성 확인'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 메인 ───────────────────────────────────────────────────
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
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [showGenModal, setShowGenModal] = useState(false)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['production', statusFilter],
    queryFn: () => productionApi.list({ status: statusFilter || undefined }),
  })

  const toggleCheck = (id: string) =>
    setCheckedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const checkedPRs = items.filter((p) => checkedIds.has(p.id))

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">생산의뢰서</h1>
          <p className="text-gray-500 text-sm mt-0.5">4주 롤링 생산계획 — SA 업로드 후 자동 갱신</p>
        </div>
        {checkedIds.size > 0 && (
          <button
            onClick={() => setShowGenModal(true)}
            className="btn-primary text-sm flex items-center gap-2"
          >
            <span>Invoice / Packing 생성</span>
            <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs">{checkedIds.size}건</span>
          </button>
        )}
      </div>

      {/* 상태 필터 */}
      <div className="flex gap-1 mb-4">
        {STATUS_FILTERS.map((f) => (
          <button key={f.value} onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-brand-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* 안내 배너 (체크 시) */}
      {checkedIds.size > 0 && (
        <div className="mb-3 bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <p className="text-sm text-brand-700">
            {checkedIds.size}건 선택됨 — 고객사별로 자동 분류하여 Invoice + Packing을 생성합니다
          </p>
          <button onClick={() => setCheckedIds(new Set())} className="text-xs text-brand-500 hover:underline ml-4">
            선택 해제
          </button>
        </div>
      )}

      {/* 목록 */}
      {isLoading ? (
        <div className="card text-center py-16 text-gray-400">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-4xl mb-3">🏭</div>
          <p className="text-gray-500 font-medium">
            {statusFilter ? `'${STATUS_LABEL[statusFilter]}' 상태의 생산의뢰서가 없습니다` : '아직 생산의뢰서가 없습니다'}
          </p>
          <p className="text-gray-400 text-sm mt-1">발주서를 파싱·확인하면 4주 생산계획이 자동 생성됩니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((pr) => {
            const isChecked = checkedIds.has(pr.id)
            const slot1 = (pr as any).weekly_schedule?.[0]

            return (
              <div key={pr.id} className={`card transition-colors ${isChecked ? 'ring-2 ring-brand-400 bg-brand-50/30' : ''}`}>
                <div className="flex items-start gap-3">
                  {/* 체크박스 */}
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCheck(pr.id)}
                    className="mt-1 w-4 h-4 accent-brand-600 shrink-0 cursor-pointer"
                  />

                  <div className="flex-1 min-w-0">
                    {/* 상단 정보 */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-gray-900">{pr.request_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[pr.status]}`}>
                        {STATUS_LABEL[pr.status]}
                      </span>
                      {pr.ran_number && (
                        <span className="text-xs text-purple-600 font-mono">RAN#{pr.ran_number}</span>
                      )}
                    </div>

                    {pr.customer_name && (
                      <p className="text-sm font-medium text-gray-700 mb-1">{pr.customer_name}</p>
                    )}

                    {/* 슬롯1 요약 (즉시 출하 기준) */}
                    <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                      <span className="font-medium text-gray-700">
                        1주차: {(slot1?.quantity ?? pr.adjusted_quantity ?? pr.quantity ?? 0).toLocaleString()} EA
                      </span>
                      {slot1?.sailing_date && <span>선적 {slot1.sailing_date}</span>}
                      {slot1?.production_end && <span>생산완료 {slot1.production_end}</span>}
                    </div>

                    {/* 4주 스케줄 테이블 */}
                    <WeeklySchedule schedule={(pr as any).weekly_schedule} />
                    <ChangeHistoryPanel history={pr.change_history} />
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                    {pr.status === 'draft' && (
                      <button onClick={() => setEditing(pr)} className="btn-secondary text-xs py-1 px-3">수정</button>
                    )}
                    <StatusButton pr={pr} />
                    <DownloadButton prId={pr.id} label={pr.request_number ?? pr.id} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && <EditModal pr={editing} onClose={() => setEditing(null)} />}
      {showGenModal && checkedPRs.length > 0 && (
        <GenerateDocsModal selectedPRs={checkedPRs} onClose={() => setShowGenModal(false)} />
      )}
    </div>
  )
}
