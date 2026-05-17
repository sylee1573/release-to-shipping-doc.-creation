/**
 * 파싱 신뢰도 점수 시각화.
 * CLAUDE.md 기준: ≥0.90 초록 / 0.70~0.89 노랑 / <0.70 빨강
 */

interface Props {
  confidence: number
  showLabel?: boolean
}

export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.9) return 'high'
  if (confidence >= 0.7) return 'medium'
  return 'low'
}

export function getConfidenceStyle(confidence: number) {
  const level = getConfidenceLevel(confidence)
  return {
    high: {
      border: 'border-green-400',
      bg: 'bg-green-50',
      badge: 'bg-green-100 text-green-700',
      label: '정상',
    },
    medium: {
      border: 'border-yellow-400',
      bg: 'bg-yellow-50',
      badge: 'bg-yellow-100 text-yellow-700',
      label: '확인 권장',
    },
    low: {
      border: 'border-red-400',
      bg: 'bg-red-50',
      badge: 'bg-red-100 text-red-700',
      label: '수정 필요',
    },
  }[level]
}

export default function ConfidenceScore({ confidence, showLabel = true }: Props) {
  const style = getConfidenceStyle(confidence)
  const pct = Math.round(confidence * 100)

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${style.badge}`}>
      {pct}%{showLabel && ` · ${style.label}`}
    </span>
  )
}
