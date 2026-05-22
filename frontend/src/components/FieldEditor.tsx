import { useState } from 'react'
import ConfidenceScore, { getConfidenceStyle } from './ConfidenceScore'
import type { FieldValue } from '../types'

const FIELD_LABELS: Record<string, string> = {
  customer_code:     '발주처 코드',
  part_number:       '품번',
  quantity:          '수량',
  unit:              '단위',
  delivery_date:     '납기일',
  delivery_location: '납품처',
}

interface Props {
  fieldName: string
  field: FieldValue
  editedValue: string | undefined
  onChange: (value: string) => void
}

export default function FieldEditor({ fieldName, field, editedValue, onChange }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const confidence = field.confidence
  const style = getConfidenceStyle(confidence)
  const isLow = confidence < 0.7
  const raw = field.value
  const normalizedValue = Array.isArray(raw)
    ? raw.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ')
    : typeof raw === 'object' && raw !== null
    ? JSON.stringify(raw)
    : String(raw ?? '')
  const displayValue = editedValue ?? normalizedValue
  const isEdited = editedValue !== undefined

  return (
    <div className={`rounded-lg border-2 p-4 transition-colors ${isEdited ? 'border-brand-400 bg-brand-50' : `${style.border} ${style.bg}`}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {FIELD_LABELS[fieldName] ?? fieldName}
          </span>
          {isLow && !isEdited && (
            <span className="ml-2 text-xs font-bold text-red-600">* 수정 필수</span>
          )}
        </div>
        <ConfidenceScore confidence={confidence} />
      </div>

      {isEditing ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            defaultValue={displayValue}
            autoFocus
            className="input flex-1"
            onBlur={(e) => {
              onChange(e.target.value)
              setIsEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onChange(e.currentTarget.value)
                setIsEditing(false)
              }
              if (e.key === 'Escape') setIsEditing(false)
            }}
          />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className={`text-base font-medium ${isEdited ? 'text-brand-700' : 'text-gray-900'}`}>
            {displayValue || <span className="text-gray-400 italic">값 없음</span>}
            {isEdited && <span className="ml-1 text-xs text-brand-500">(수정됨)</span>}
          </span>
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs text-gray-400 hover:text-brand-600 underline shrink-0"
          >
            수정
          </button>
        </div>
      )}

      {field.raw_text && !isEditing && (
        <p className="mt-1.5 text-xs text-gray-400 truncate">원문: {field.raw_text}</p>
      )}
    </div>
  )
}
