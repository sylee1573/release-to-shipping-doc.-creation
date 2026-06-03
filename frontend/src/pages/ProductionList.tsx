import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { productionApi } from '../api/production'
import { shipmentApi } from '../api/shipment'
import { useAuthStore } from '../store/authStore'
import type { ProductionRequest } from '../types'

const STATUS_LABEL: Record<string, string> = {
  draft: '초안', confirmed: '확정', in_production: '생산중', done: '완료',
}

const STATUS_BADGE: Record<string, string> = {
  draft:         'bg-gray-100 text-gray-700',
  confirmed:     'bg-blue-100 text-blue-700',
  in_production: 'bg-yellow-100 text-yellow-700',
  done:          'bg-green-100 text-green-700',
}

const NEXT_STATUS: Record<string, string> = {
  draft: 'confirmed', confirmed: 'in_production', in_production: 'done',
}

const NEXT_STATUS_LABEL: Record<string, string> = {
  draft: '확정', confirmed: '생산시작', in_production: '완료',
}

function sailingWeekMonday(sailingDate: string): string {
  const d = new Date(sailingDate + 'T00:00:00Z')
  const dow = d.getUTCDay()
  const toMonday = dow === 0 ? -6 : 1 - dow
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + toMonday)
  return `${monday.getUTCMonth() + 1}/${String(monday.getUTCDate()).padStart(2, '0')}(월)`
}

export default function ProductionList() {
  const [editing, setEditing]         = useState<ProductionRequest | null>(null)
  const [statusFilter]                = useState('')
  const [checkedIds, setCheckedIds]   = useState<Set<string>>(new Set())
  const [showGenModal, setShowGenModal] = useState(false)
  const qc    = useQueryClient()
  const token = useAuthStore((s) => s.token)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['production', statusFilter],
    queryFn:  () => productionApi.list({ status: statusFilter || undefined }),
  })

  const toggleCheck = (id: string) =>
    setCheckedIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const toggleAll = () =>
    setCheckedIds(checkedIds.size === items.length ? new Set() : new Set(items.map((p) => p.id)))

  const checkedPRs = items.filter((p) => checkedIds.has(p.id))

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      productionApi.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['production'] }),
  })

  const downloadShipmentDoc = async (docId: string, docNumber: string) => {
    try {
      const res = await fetch(shipmentApi.downloadUrl(docId), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(await res.blob())
      a.download = `${docNumber}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch { /* 다운로드 실패 무시 */ }
  }

  const createDocsMutation = useMutation({
    mutationFn: async () => {
      const grouped = checkedPRs.reduce<Record<string, ProductionRequest[]>>((acc, pr) => {
        const key = pr.customer_name ?? '(고객사 미상)'
        if (!acc[key]) acc[key] = []
        acc[key].push(pr)
        return acc
      }, {})
      const created: Array<{ id: string; doc_number: string | null }> = []
      for (const [, prs] of Object.entries(grouped)) {
        const ids = prs.map((p) => p.id)
        const inv = await shipmentApi.create({ production_request_ids: ids, doc_type: 'invoice' })
        const pkl = await shipmentApi.create({ production_request_ids: ids, doc_type: 'packing_list' })
        created.push(inv, pkl)
      }
      return created
    },
    onSuccess: async (docs) => {
      for (const doc of docs) {
        await downloadShipmentDoc(doc.id, doc.doc_number ?? doc.id)
      }
      qc.invalidateQueries({ queryKey: ['shipment'] })
      setCheckedIds(new Set())
      setShowGenModal(false)
    },
  })

  const downloadXl = async (prId: string, filename?: string) => {
    const res = await fetch(productionApi.downloadUrl(prId), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(await res.blob())
    a.download = filename ?? 'PR.xlsx'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const QtyCell = ({ pr, slotNum }: { pr: ProductionRequest; slotNum: number }) => {
    const slots   = pr.weekly_schedule ?? []
    const slotMap = Object.fromEntries(slots.map((s) => [s.slot, s]))
    const slot    = slotMap[slotNum]
    if (!slot) return <span className="text-gray-300">—</span>
    if (slot.is_holiday) return (
      <span className="text-amber-600 text-[10px] font-medium">
        {slot.holiday_reason || '휴무'}
      </span>
    )
    const dateLabel = slot.sailing_date ? sailingWeekMonday(slot.sailing_date) : ''
    return (
      <div className="leading-snug">
        {dateLabel && (
          <div className="text-[9px] text-indigo-600 font-semibold">{dateLabel}</div>
        )}
        <div className="text-xs font-bold text-gray-900">
          {(slot.quantity ?? 0).toLocaleString()}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">생산의뢰서</h1>
          <p className="text-sm text-gray-500 mt-1">4주 롤링 계획 (선적주 기준)</p>
        </div>
        {checkedIds.size > 0 && (
          <button onClick={() => setShowGenModal(true)} className="btn-primary">
            Invoice/Packing 생성 ({checkedIds.size}건)
          </button>
        )}
      </div>

      {/* 테이블 */}
      {isLoading ? (
        <div className="card py-16 text-center text-gray-400">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="card py-16 text-center">
          <p className="text-gray-400">생산의뢰서가 없습니다</p>
          <p className="text-xs text-gray-400 mt-1">발주서를 업로드하면 자동으로 생성됩니다</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-200">
                  <th className="w-9 px-2 py-2.5 text-center">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded accent-indigo-600"
                      checked={checkedIds.size === items.length && items.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600">고객사</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600">품번</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600">의뢰서#</th>
                  {['선적주 1', '선적주 2', '선적주 3', '선적주 4'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-center text-[11px] font-semibold text-indigo-600 bg-indigo-50 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600">RAN#</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600">상태</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((pr) => {
                  const isChecked = checkedIds.has(pr.id)
                  return (
                    <tr key={pr.id} className={isChecked ? 'bg-blue-50' : 'bg-white hover:bg-gray-50 transition-colors'}>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded accent-indigo-600"
                          checked={isChecked}
                          onChange={() => toggleCheck(pr.id)}
                        />
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-900 max-w-[80px] truncate">
                        {pr.customer_name?.split(' ')[0] || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-gray-900 font-medium">
                        {pr.part_number || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-gray-500">
                        {pr.request_number || '—'}
                      </td>
                      {[1, 2, 3, 4].map((slot) => (
                        <td key={slot} className="px-2 py-2 text-center bg-indigo-50/40">
                          <QtyCell pr={pr} slotNum={slot} />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-mono text-[10px] font-semibold text-gray-700">
                        {pr.ran_number || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[pr.status] ?? 'bg-gray-100 text-gray-700'}`}>
                          {STATUS_LABEL[pr.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 justify-end">
                          {pr.status === 'draft' && (
                            <button
                              onClick={() => setEditing(pr)}
                              className="text-[10px] text-gray-500 hover:text-gray-800 hover:underline"
                            >
                              수정
                            </button>
                          )}
                          {pr.status !== 'done' && (
                            <button
                              onClick={() => statusMutation.mutate({ id: pr.id, status: NEXT_STATUS[pr.status] })}
                              className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
                            >
                              {NEXT_STATUS_LABEL[pr.status]}
                            </button>
                          )}
                          <button
                            onClick={() => downloadXl(pr.id, `${pr.request_number ?? pr.id}.xlsx`)}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800"
                            title="Excel 다운로드"
                          >
                            📥
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoice / Packing List 생성 모달 */}
      {showGenModal && checkedPRs.length > 0 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Invoice / Packing List 생성</h2>
              <p className="text-xs text-gray-500 mt-0.5">고객사별 자동 분류</p>
            </div>
            <div className="px-6 py-4 max-h-52 overflow-y-auto space-y-2">
              {Object.entries(
                checkedPRs.reduce<Record<string, ProductionRequest[]>>((acc, pr) => {
                  const key = pr.customer_name ?? '(미상)'
                  if (!acc[key]) acc[key] = []
                  acc[key].push(pr)
                  return acc
                }, {})
              ).map(([customer, prs]) => (
                <div key={customer} className="border border-gray-200 rounded-lg px-3 py-2.5">
                  <p className="text-xs font-semibold text-gray-900 mb-1">{customer}</p>
                  {prs.map((pr) => (
                    <p key={pr.id} className="text-xs text-gray-500">
                      {pr.part_number} · {pr.weekly_schedule?.[0]?.quantity ?? 0}EA · RAN#{pr.ran_number}
                    </p>
                  ))}
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button
                onClick={() => setShowGenModal(false)}
                disabled={createDocsMutation.isPending}
                className="btn-secondary text-sm"
              >
                취소
              </button>
              <button
                onClick={() => createDocsMutation.mutate()}
                disabled={createDocsMutation.isPending}
                className="btn-primary text-sm min-w-[96px]"
              >
                {createDocsMutation.isPending ? '생성 중...' : 'Invoice/PL 생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-2xl p-6">
            <h2 className="text-base font-bold text-gray-900 mb-2">수정</h2>
            <p className="text-sm text-gray-500 mb-4">수량/납기 수정 폼</p>
            <button onClick={() => setEditing(null)} className="btn-secondary text-sm">닫기</button>
          </div>
        </div>
      )}
    </div>
  )
}
