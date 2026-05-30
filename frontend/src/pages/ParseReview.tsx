import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ordersApi } from '../api/orders'
import { productionApi } from '../api/production'
import FieldEditor from '../components/FieldEditor'
import type { FieldValue } from '../types'

// 우선 표시 필드 순서
const FIELD_ORDER = [
  'customer_code',
  'part_number',
  'description',
  'quantity',
  'unit',
  'delivery_date',
  'po_number',
  'delivery_location',
  'ship_to_name',
  'unit_price',
]

// 내부에서 자동 관리하므로 화면에 표시하지 않는 필드
const HIDDEN_FIELDS = new Set(['ran_number'])

// ── 4주 생산계획 생성 모달 ──────────────────────────────────
function CreatePRModal({
  orderId,
  deliverySchedule,
  onClose,
}: {
  orderId: string
  deliverySchedule: Array<{ date: string; quantity: number }>
  onClose: () => void
}) {
  const navigate = useNavigate()

  const createMutation = useMutation({
    mutationFn: () => productionApi.generateWeekly({ order_id: orderId }),
    onSuccess: () => navigate('/production'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-lg font-bold text-gray-900">4주 생산계획 생성</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            SA 납품 스케줄 기준으로 4주 롤링 생산의뢰서를 생성합니다
          </p>
        </div>

        <div className="px-6 py-4 space-y-3">
          <div className="bg-blue-50 rounded-lg px-4 py-3 text-sm text-blue-700">
            고객사 프로필의 해상운송일수·출하준비일수·리드타임을 자동 적용해 선적일·생산완료일을 역산합니다
          </div>

          {deliverySchedule.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">감지된 납품 스케줄</p>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                {deliverySchedule.slice(0, 6).map((s, i) => (
                  <div key={i} className="flex justify-between px-3 py-2 text-sm">
                    <span className="text-gray-700">{s.date}</span>
                    <span className="font-medium text-gray-900">{s.quantity.toLocaleString()} EA</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">이 중 미래 납품일 기준 최대 4주분을 생성합니다</p>
            </div>
          ) : (
            <div className="bg-yellow-50 rounded-lg px-4 py-3 text-sm text-yellow-700">
              납품 스케줄이 감지되지 않았습니다. 생성 시 확인 데이터의 납기일·수량으로 1주분만 생성됩니다.
            </div>
          )}
        </div>

        {createMutation.isError && (
          <p className="px-6 text-sm text-red-600">
            {(createMutation.error as Error).message}
          </p>
        )}

        <div className="px-6 py-4 flex justify-between items-center border-t border-gray-100">
          <button onClick={() => navigate('/production')} className="text-sm text-gray-500 hover:text-gray-700">
            나중에 생성
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">취소</button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="btn-primary text-sm"
            >
              {createMutation.isPending ? '생성 중...' : '4주 생산계획 생성'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 메인 ───────────────────────────────────────────────────
export default function ParseReview() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})
  const [showPRModal, setShowPRModal] = useState(false)

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.getParseResult(id!),
    enabled: !!id,
  })

  const confirmMutation = useMutation({
    mutationFn: (confirmedData: Record<string, string | number>) =>
      ordersApi.confirm(id!, confirmedData),
    onSuccess: () => setShowPRModal(true),  // 확인 완료 후 생산의뢰서 생성 모달
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-brand-600 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <p className="text-gray-500">파싱 결과 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (isError || !order) {
    return (
      <div className="card text-center py-12">
        <p className="text-red-600 font-medium">발주서를 불러올 수 없습니다</p>
        <button onClick={() => navigate(-1)} className="btn-secondary mt-4">뒤로</button>
      </div>
    )
  }

  if (order.parse_status === 'failed') {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-red-600 font-medium">파싱에 실패했습니다</p>
        <p className="text-gray-500 text-sm mt-2">PDF 형식을 확인하거나 다시 시도해 주세요</p>
        <button onClick={() => navigate('/orders/upload')} className="btn-primary mt-4">다시 업로드</button>
      </div>
    )
  }

  if (order.parse_status !== 'done' || !order.parsed_data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">AI 파싱 중입니다. 잠시 기다려 주세요...</p>
      </div>
    )
  }

  const fields = order.parsed_data.fields
  const parseNotes = order.parsed_data.parse_notes

  const unresolvedRedFields = Object.entries(fields).filter(
    ([name, field]) => !HIDDEN_FIELDS.has(name) && field.confidence < 0.7 && editedValues[name] === undefined
  )
  const canSave = unresolvedRedFields.length === 0

  const buildConfirmedData = () => {
    const result: Record<string, string | number> = {}
    for (const [name, field] of Object.entries(fields)) {
      if (HIDDEN_FIELDS.has(name)) continue   // 내부 자동관리 필드 제외
      result[name] = editedValues[name] ?? String(field.value ?? '')
    }
    return result
  }

  const visibleFields = Object.entries(fields).filter(([k]) => !HIDDEN_FIELDS.has(k))
  const highCount = visibleFields.filter(([, f]) => f.confidence >= 0.9).length
  const midCount  = visibleFields.filter(([, f]) => f.confidence >= 0.7 && f.confidence < 0.9).length
  const lowCount  = visibleFields.filter(([, f]) => f.confidence < 0.7).length

  const orderedFields = [
    ...FIELD_ORDER.filter((k) => k in fields && !HIDDEN_FIELDS.has(k)).map((k) => [k, fields[k]] as [string, FieldValue]),
    ...Object.entries(fields).filter(([k]) => !FIELD_ORDER.includes(k) && !HIDDEN_FIELDS.has(k)),
  ]

  // 4주 생산계획 모달: AI 파싱된 delivery_schedule 전달
  const deliverySchedule: Array<{ date: string; quantity: number }> =
    (order.parsed_data as any)?.delivery_schedule ?? []

  return (
    <div className="max-w-2xl">
      {/* 헤더 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <button onClick={() => navigate('/orders/upload')} className="hover:text-gray-600">발주서 업로드</button>
          <span>/</span>
          <span className="text-gray-600">파싱 결과 확인</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">파싱 결과 확인</h1>
        <p className="text-gray-500 text-sm mt-1">{order.file_name}</p>
        {order.confirmed_at && (
          <span className="inline-block mt-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            확인 완료 — {new Date(order.confirmed_at).toLocaleDateString('ko-KR')}
          </span>
        )}
      </div>

      {/* 신뢰도 요약 */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800">신뢰도 요약</h2>
          {!canSave && (
            <span className="text-xs font-medium text-red-600 bg-red-50 px-3 py-1 rounded-full">
              빨간 항목 {unresolvedRedFields.length}개 수정 필요
            </span>
          )}
        </div>
        <div className="flex gap-4 text-sm">
          {[
            { color: 'bg-green-400', label: '정상', count: highCount },
            { color: 'bg-yellow-400', label: '확인 권장', count: midCount },
            { color: 'bg-red-400', label: '수정 필수', count: lowCount },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-full ${s.color} inline-block`} />
              <span className="text-gray-600">{s.label} <strong className="text-gray-900">{s.count}</strong></span>
            </div>
          ))}
        </div>
        {parseNotes && (
          <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2">
            <span className="font-medium">AI 메모: </span>{parseNotes}
          </div>
        )}
      </div>

      {/* 필드 목록 */}
      <div className="space-y-3 mb-8">
        {orderedFields.map(([name, field]) => (
          <FieldEditor
            key={name}
            fieldName={name}
            field={field}
            editedValue={editedValues[name]}
            onChange={(val) => setEditedValues((prev) => ({ ...prev, [name]: val }))}
          />
        ))}
      </div>

      {/* 저장 버튼 */}
      <div className="sticky bottom-0 bg-white border-t border-gray-100 -mx-8 px-8 py-4 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {canSave
            ? <span className="text-green-600 font-medium">모든 항목 확인 완료 — 저장 가능</span>
            : <span className="text-red-600">빨간 항목을 모두 수정해야 저장할 수 있습니다</span>
          }
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate(-1)} className="btn-secondary">취소</button>
          <button
            onClick={() => confirmMutation.mutate(buildConfirmedData())}
            disabled={!canSave || confirmMutation.isPending}
            className="btn-primary"
          >
            {confirmMutation.isPending ? '저장 중...' : '확인 및 저장'}
          </button>
        </div>
      </div>

      {confirmMutation.isError && (
        <p className="text-sm text-red-600 mt-2 text-right">
          {(confirmMutation.error as Error).message}
        </p>
      )}

      {/* 생산의뢰서 생성 모달 */}
      {showPRModal && (
        <CreatePRModal
          orderId={id!}
          deliverySchedule={deliverySchedule}
          onClose={() => setShowPRModal(false)}
        />
      )}
    </div>
  )
}
