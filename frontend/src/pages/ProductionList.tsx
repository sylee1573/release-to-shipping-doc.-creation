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

// isoDate에 days를 더한 YYYY-MM-DD 반환 (UTC 기준)
function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// 해당 날짜가 속한 주의 월요일 반환 (YYYY-MM-DD, UTC 기준)
function weekMondayISO(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00Z')
  const dow = d.getUTCDay()  // 0=일, 1=월…6=토
  const daysToMon = dow === 0 ? -6 : 1 - dow
  return addDaysISO(isoDate, daysToMon)
}

// 업로드(오늘)의 "다음 주 월요일"부터 4주 (백엔드 anchor 로직과 동일).
function getFourWeekMondays(): string[] {
  const todayISO = new Date().toISOString().slice(0, 10)
  const thisMon  = weekMondayISO(todayISO)
  const nextMon  = addDaysISO(thisMon, 7)   // 업로드 다음 주 = 1주차
  return [0, 1, 2, 3].map((i) => addDaysISO(nextMon, i * 7))
}

function formatWeekHeader(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00Z')
  return `${d.getUTCMonth() + 1}/${String(d.getUTCDate()).padStart(2, '0')}(월)`
}

function prDateLabel(isoString: string | null | undefined): string {
  if (!isoString) return ''
  return isoString.slice(0, 10)   // 'YYYY-MM-DD'
}

export default function ProductionList() {
  const [editing, setEditing]         = useState<ProductionRequest | null>(null)
  const [statusFilter]                = useState('')
  const [checkedIds, setCheckedIds]   = useState<Set<string>>(new Set())
  const [showGenModal, setShowGenModal] = useState(false)
  const [genWeekIdx, setGenWeekIdx]   = useState(0)  // 선적서류 생성 기준 선적주 (0~3)
  const qc    = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const todayStr = new Date().toISOString().slice(0, 10)

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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productionApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['production'] }),
    onError: (e) => alert(e instanceof Error ? e.message : '삭제에 실패했습니다'),
  })

  const handleDelete = (pr: ProductionRequest) => {
    if (window.confirm(`${pr.request_number ?? '생산의뢰서'}를 삭제할까요? 되돌릴 수 없습니다.`)) {
      deleteMutation.mutate(pr.id)
    }
  }

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

  // 고객사명 정규화: 대소문자·공백 차이로 같은 고객이 다르게 묶이는 것 방지
  const normalizeCustomer = (name: string | null | undefined) =>
    (name ?? '').trim().toUpperCase() || '(고객사 미상)'

  // fourMondays는 return 안에서도 동일하게 참조하므로 여기서 미리 계산
  const fourMondays = getFourWeekMondays()

  // 해당 선적주(인덱스)에 선택된 PR 중 선적 있는지
  const weekHasShipment = (idx: number) =>
    checkedPRs.some((pr) => (pr.weekly_schedule ?? []).some((s) => s.sailing_week_monday === fourMondays[idx]))

  const targetMonday = fourMondays[genWeekIdx]

  // 선택 선적주에 선적 있는 PR (생성 대상)
  const targetPRs = checkedPRs.filter((pr) =>
    (pr.weekly_schedule ?? []).some((s) => s.sailing_week_monday === targetMonday)
  )

  // 선택됐으나 해당 선적주에 선적 없는 PR (모달 안내용)
  const excludedPRs = checkedPRs.filter((pr) =>
    !(pr.weekly_schedule ?? []).some((s) => s.sailing_week_monday === targetMonday)
  )

  // 모달 열 때 선적 있는 가장 가까운 주를 기본 선택 (없으면 1주)
  const openGenModal = () => {
    const firstWithShipment = [0, 1, 2, 3].find((i) => weekHasShipment(i)) ?? 0
    setGenWeekIdx(firstWithShipment)
    setShowGenModal(true)
  }

  const createDocsMutation = useMutation({
    mutationFn: async () => {
      // 선택 선적주 기준으로 그룹핑
      const grouped = targetPRs.reduce<Record<string, ProductionRequest[]>>((acc, pr) => {
        const key = normalizeCustomer(pr.customer_name)
        if (!acc[key]) acc[key] = []
        acc[key].push(pr)
        return acc
      }, {})
      const created: Array<{ id: string; doc_number: string | null }> = []
      for (const [, prs] of Object.entries(grouped)) {
        const ids = prs.map((p) => p.id)
        const inv = await shipmentApi.create({ production_request_ids: ids, doc_type: 'invoice', sailing_week_monday: targetMonday })
        const pkl = await shipmentApi.create({ production_request_ids: ids, doc_type: 'packing_list', sailing_week_monday: targetMonday })
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

  // 해당 주(sailing_week_monday)에 선적 있을 때만 수량 표시 — 없으면 빈 셀
  const QtyCell = ({ pr, weekMonday }: { pr: ProductionRequest; weekMonday: string }) => {
    const slot = (pr.weekly_schedule ?? []).find((s) => s.sailing_week_monday === weekMonday)
    if (!slot) return null
    if (slot.is_holiday) return (
      <span className="text-amber-600 text-[10px] font-medium">
        {slot.holiday_reason || '휴무'}
      </span>
    )
    return (
      <div className="text-xs font-bold text-gray-900">
        {(slot.quantity ?? 0).toLocaleString()}
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
          <button onClick={openGenModal} className="btn-primary">
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
                  {fourMondays.map((mon, i) => (
                    <th key={mon} className="px-3 py-2.5 text-center text-[11px] font-semibold text-indigo-600 bg-indigo-50 whitespace-nowrap">
                      <div className="text-[9px] text-indigo-400 font-normal">{`선적주 ${i + 1}`}</div>
                      <div>{formatWeekHeader(mon)}</div>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600">RAN#</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600">상태</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.reduce<React.ReactNode[]>((rows, pr, idx) => {
                  const dateLabel = prDateLabel(pr.created_at)
                  const prevDate  = idx > 0 ? prDateLabel(items[idx - 1].created_at) : null
                  const isToday   = dateLabel === todayStr

                  // 날짜가 바뀌면 구분 헤더 삽입
                  if (dateLabel !== prevDate) {
                    rows.push(
                      <tr key={`date-${dateLabel}`} className="bg-gray-100 border-t-2 border-gray-300">
                        <td colSpan={10} className="px-3 py-1.5">
                          <span className={`text-[11px] font-semibold ${isToday ? 'text-indigo-700' : 'text-gray-500'}`}>
                            {isToday ? `오늘 (${dateLabel})` : dateLabel}
                          </span>
                          {isToday && (
                            <span className="ml-2 text-[9px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-bold">NEW</span>
                          )}
                        </td>
                      </tr>
                    )
                  }

                  const isChecked = checkedIds.has(pr.id)
                  rows.push(
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
                      {fourMondays.map((mon) => (
                        <td key={mon} className="px-2 py-2 text-center bg-indigo-50/40">
                          <QtyCell pr={pr} weekMonday={mon} />
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
                          <button
                            onClick={() => handleDelete(pr)}
                            disabled={deleteMutation.isPending}
                            className="text-[10px] text-red-500 hover:text-red-700 hover:underline"
                            title="삭제"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                  return rows
                }, [])}
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
              <p className="text-xs text-gray-500 mt-0.5">
                선적주를 선택하면 해당 주 선적분으로 생성됩니다 · 고객사별 분류
              </p>
            </div>
            {/* 선적주 선택 */}
            <div className="px-6 pt-4">
              <div className="grid grid-cols-4 gap-1.5">
                {fourMondays.map((mon, i) => {
                  const has = weekHasShipment(i)
                  const active = i === genWeekIdx
                  return (
                    <button
                      key={mon}
                      onClick={() => setGenWeekIdx(i)}
                      disabled={!has}
                      className={
                        'rounded-lg px-2 py-1.5 text-center border transition ' +
                        (active
                          ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300'
                          : has
                            ? 'border-gray-200 bg-white hover:border-indigo-300'
                            : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed')
                      }
                    >
                      <div className={'text-[9px] font-normal ' + (active ? 'text-indigo-500' : 'text-gray-400')}>{`선적주 ${i + 1}`}</div>
                      <div className={'text-[11px] font-semibold ' + (active ? 'text-indigo-700' : 'text-gray-700')}>{formatWeekHeader(mon)}</div>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="px-6 py-4 max-h-64 overflow-y-auto space-y-2">
              {/* 선택 선적주 포함 PR — 생성 대상 */}
              {targetPRs.length === 0 ? (
                <p className="text-xs text-red-500 text-center py-2">
                  선택한 선적주에 해당하는 제품이 없습니다. 다른 주를 선택하세요.
                </p>
              ) : (
                Object.entries(
                  targetPRs.reduce<Record<string, ProductionRequest[]>>((acc, pr) => {
                    const key = normalizeCustomer(pr.customer_name)
                    if (!acc[key]) acc[key] = []
                    acc[key].push(pr)
                    return acc
                  }, {})
                ).map(([customer, prs]) => (
                  <div key={customer} className="border border-indigo-200 rounded-lg px-3 py-2.5 bg-indigo-50/40">
                    <p className="text-xs font-semibold text-gray-900 mb-1">{customer}</p>
                    {prs.map((pr) => {
                      const slot = (pr.weekly_schedule ?? []).find((s) => s.sailing_week_monday === targetMonday)
                      return (
                        <p key={pr.id} className="text-xs text-gray-600">
                          {pr.part_number} · {(slot?.quantity ?? 0).toLocaleString()}EA · RAN#{pr.ran_number}
                        </p>
                      )
                    })}
                  </div>
                ))
              )}
              {/* 해당 주 선적 없는 PR — 제외 안내 */}
              {excludedPRs.length > 0 && (
                <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                  <p className="text-[10px] text-gray-400 font-semibold mb-1">이 선적주에 선적 없음 — 제외됨</p>
                  {excludedPRs.map((pr) => (
                    <p key={pr.id} className="text-[10px] text-gray-400 line-through">
                      {pr.part_number} ({normalizeCustomer(pr.customer_name)})
                    </p>
                  ))}
                </div>
              )}
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
                disabled={createDocsMutation.isPending || targetPRs.length === 0}
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
