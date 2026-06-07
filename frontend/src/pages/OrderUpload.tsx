import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ordersApi } from '../api/orders'
import { productionApi } from '../api/production'

type FileStatus = 'pending' | 'uploading' | 'confirming' | 'generating' | 'done' | 'error'

interface FileItem {
  file: File
  status: FileStatus
  error?: string
  warnings?: { field: string; label: string; confidence: number; value: string }[]
}

const STATUS_LABEL: Record<FileStatus, string> = {
  pending:    '대기',
  uploading:  'AI 파싱 중',
  confirming: '자동 확인 중',
  generating: '생산의뢰서 생성 중',
  done:       '완료',
  error:      '실패',
}

const STATUS_COLOR: Record<FileStatus, string> = {
  pending:    'text-gray-400',
  uploading:  'text-brand-600',
  confirming: 'text-brand-600',
  generating: 'text-brand-600',
  done:       'text-green-600',
  error:      'text-red-600',
}

const VALID_EXTS = ['.pdf', '.xlsx', '.xls']

function isValidFile(name: string) {
  return VALID_EXTS.some((ext) => name.toLowerCase().endsWith(ext))
}

export default function OrderUpload() {
  const navigate = useNavigate()
  const [isDragOver, setIsDragOver] = useState(false)
  const [fileItems, setFileItems]   = useState<FileItem[]>([])
  const [isRunning, setIsRunning]   = useState(false)
  const [allDone, setAllDone]       = useState(false)

  // 파일 목록에 추가 (중복 제거)
  const addFiles = useCallback((incoming: File[]) => {
    const valid = incoming.filter((f) => {
      if (!isValidFile(f.name)) return false
      if (f.size > 20 * 1024 * 1024) return false
      return true
    })
    setFileItems((prev) => {
      const existingNames = new Set(prev.map((x) => x.file.name))
      const newOnes = valid
        .filter((f) => !existingNames.has(f.name))
        .map((f): FileItem => ({ file: f, status: 'pending' }))
      return [...prev, ...newOnes]
    })
    setAllDone(false)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [addFiles])

  const removeFile = (idx: number) => {
    setFileItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const setStatus = (idx: number, status: FileStatus, extra?: Partial<FileItem>) =>
    setFileItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, status, ...extra } : item))
    )

  const handleUpload = async () => {
    const targets = fileItems.filter((x) => x.status === 'pending' || x.status === 'error')
    if (targets.length === 0) return

    setIsRunning(true)

    for (let i = 0; i < fileItems.length; i++) {
      const item = fileItems[i]
      if (item.status !== 'pending' && item.status !== 'error') continue

      try {
        // ① 업로드 + AI 파싱
        setStatus(i, 'uploading')
        const order = await ordersApi.upload(item.file)

        // ② 자동 확인
        setStatus(i, 'confirming')
        const { warnings } = await ordersApi.autoConfirm(order.id)

        // ③ 생산의뢰서 생성
        setStatus(i, 'generating')
        try {
          await productionApi.generateWeekly({ order_id: order.id })
        } catch {
          warnings.push({
            field:      'production',
            label:      '생산의뢰서 생성',
            confidence: 0,
            value:      '4주 범위 내 선적 일정 없음 — 수동 생성 필요',
          })
        }

        setStatus(i, 'done', { warnings })
      } catch (e: any) {
        setStatus(i, 'error', { error: e?.message ?? '알 수 없는 오류' })
      }
    }

    setIsRunning(false)
    setAllDone(true)
  }

  const pendingCount = fileItems.filter((x) => x.status === 'pending' || x.status === 'error').length
  const doneCount    = fileItems.filter((x) => x.status === 'done').length
  const errorCount   = fileItems.filter((x) => x.status === 'error').length

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">발주서 업로드</h1>
        <p className="text-gray-500 text-sm mt-1">
          SA(PDF/Excel)를 업로드하면 자동으로 생산의뢰서까지 생성됩니다 — 여러 파일을 한 번에 끌어다 놓을 수 있습니다
        </p>
      </div>

      {/* 드래그앤드롭 영역 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
          isRunning
            ? 'border-brand-300 bg-brand-50 cursor-not-allowed'
            : isDragOver
            ? 'border-brand-500 bg-brand-50'
            : 'border-gray-300 bg-white hover:border-brand-400 hover:bg-brand-50'
        }`}
        onClick={() => !isRunning && document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".pdf,.xlsx,.xls"
          multiple
          className="hidden"
          onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
        />
        <div className="text-4xl mb-2">📤</div>
        <p className="font-medium text-gray-700">PDF 또는 Excel 파일을 여기에 끌어다 놓거나</p>
        <p className="text-sm text-brand-600 font-medium mt-1">클릭하여 파일 선택 (다중 선택 가능)</p>
        <p className="text-xs text-gray-400 mt-2">PDF · Excel(.xlsx, .xls) · 최대 20MB · 여러 파일 동시 업로드</p>
      </div>

      {/* 파일 목록 */}
      {fileItems.length > 0 && (
        <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">
              파일 {fileItems.length}개
              {isRunning && (
                <span className="ml-2 text-brand-600">
                  처리 중… ({doneCount}/{fileItems.length})
                </span>
              )}
              {allDone && !isRunning && (
                <span className="ml-2 text-green-600">
                  완료 {doneCount}건
                  {errorCount > 0 && <span className="text-red-500 ml-1">/ 실패 {errorCount}건</span>}
                </span>
              )}
            </span>
            {!isRunning && (
              <button
                onClick={() => { setFileItems([]); setAllDone(false) }}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                전체 삭제
              </button>
            )}
          </div>

          <ul className="divide-y divide-gray-100">
            {fileItems.map((item, idx) => (
              <li key={idx} className="px-4 py-3 flex items-center gap-3">
                {/* 상태 아이콘 */}
                <span className="text-lg shrink-0">
                  {item.status === 'done'    ? '✅' :
                   item.status === 'error'   ? '❌' :
                   ['uploading','confirming','generating'].includes(item.status)
                     ? <span className="inline-block animate-spin">⏳</span>
                     : '📄'}
                </span>

                {/* 파일명 + 상태 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.file.name}</p>
                  <p className={`text-xs mt-0.5 ${STATUS_COLOR[item.status]}`}>
                    {STATUS_LABEL[item.status]}
                    {item.status === 'error' && item.error && (
                      <span className="ml-1 text-red-500">— {item.error}</span>
                    )}
                  </p>
                  {/* 경고 */}
                  {item.status === 'done' && item.warnings && item.warnings.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {item.warnings.map((w, wi) => (
                        <li key={wi} className="text-xs text-yellow-600">
                          ⚠ {w.label}: {w.value}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* 크기 */}
                <span className="text-xs text-gray-400 shrink-0">
                  {(item.file.size / 1024).toFixed(0)} KB
                </span>

                {/* 삭제 버튼 (대기/실패 상태만) */}
                {!isRunning && (item.status === 'pending' || item.status === 'error') && (
                  <button
                    onClick={() => removeFile(idx)}
                    className="text-gray-300 hover:text-red-400 text-lg leading-none shrink-0"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="mt-6 flex gap-3 justify-end">
        {allDone && doneCount > 0 && (
          <button
            onClick={() => navigate('/production')}
            className="btn-secondary"
          >
            생산의뢰서 목록 보기
          </button>
        )}
        <button
          onClick={handleUpload}
          disabled={pendingCount === 0 || isRunning}
          className="btn-primary px-8"
        >
          {isRunning
            ? `처리 중… (${doneCount + errorCount}/${fileItems.length})`
            : pendingCount > 0
            ? `${pendingCount}건 업로드 및 생산의뢰서 생성`
            : '업로드 및 생산의뢰서 생성'}
        </button>
      </div>

      {/* 처리 안내 */}
      {!allDone && fileItems.length === 0 && (
        <div className="mt-8 bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
          <p className="font-medium mb-1">처리 순서</p>
          <ol className="space-y-1 text-blue-600 list-decimal list-inside">
            <li>SA PDF/Excel 업로드 → AI 파싱 (약 5~10초/건)</li>
            <li>파싱 결과 자동 확인 (신뢰도 낮은 항목은 경고 표시)</li>
            <li>생산의뢰서 자동 생성 → 목록에서 Excel 다운로드</li>
          </ol>
        </div>
      )}
    </div>
  )
}
