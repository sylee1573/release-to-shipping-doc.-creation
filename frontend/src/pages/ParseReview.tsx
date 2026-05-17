import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ordersApi } from '../api/orders'
import FieldEditor from '../components/FieldEditor'
import type { FieldValue } from '../types'

const FIELD_ORDER = [
  'customer_code',
  'part_number',
  'quantity',
  'unit',
  'delivery_date',
  'delivery_location',
]

export default function ParseReview() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.getParseResult(id!),
    enabled: !!id,
  })

  const confirmMutation = useMutation({
    mutationFn: (confirmedData: Record<string, string | number>) =>
      ordersApi.confirm(id!, confirmedData),
    onSuccess: () => navigate('/production'),
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
        <button onClick={() => navigate('/orders/upload')} className="btn-primary mt-4">
          다시 업로드
        </button>
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

  // 빨간 필드 중 아직 수정하지 않은 것이 있으면 저장 불가
  const unresolvedRedFields = Object.entries(fields).filter(
    ([name, field]) => field.confidence < 0.7 && editedValues[name] === undefined
  )
  const canSave = unresolvedRedFields.length === 0

  // 저장 시 최종 데이터 조합 (수정된 값 우선)
  const buildConfirmedData = () => {
    const result: Record<string, string | number> = {}
    for (const [name, field] of Object.entries(fields)) {
      result[name] = editedValues[name] ?? String(field.value ?? '')
    }
    return result
  }

  // 신뢰도 분포 요약
  const highCount = Object.values(fields).filter((f) => f.confidence >= 0.9).length
  const midCount = Object.values(fields).filter((f) => f.confidence >= 0.7 && f.confidence < 0.9).length
  const lowCount = Object.values(fields).filter((f) => f.confidence < 0.7).length

  // 표시 순서: FIELD_ORDER에 있는 것 먼저, 나머지는 뒤에
  const orderedFields = [
    ...FIELD_ORDER.filter((k) => k in fields).map((k) => [k, fields[k]] as [string, FieldValue]),
    ...Object.entries(fields).filter(([k]) => !FIELD_ORDER.includes(k)),
  ]

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
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />
            <span className="text-gray-600">정상 <strong className="text-gray-900">{highCount}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />
            <span className="text-gray-600">확인 권장 <strong className="text-gray-900">{midCount}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-400 inline-block" />
            <span className="text-gray-600">수정 필수 <strong className="text-gray-900">{lowCount}</strong></span>
          </div>
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
          {canSave ? (
            <span className="text-green-600 font-medium">모든 항목 확인 완료 — 저장 가능</span>
          ) : (
            <span className="text-red-600">
              빨간 항목을 모두 수정해야 저장할 수 있습니다
            </span>
          )}
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
    </div>
  )
}
