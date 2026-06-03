import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ordersApi } from '../api/orders'
import { productionApi } from '../api/production'

type Step = 'idle' | 'uploading' | 'confirming' | 'generating' | 'done' | 'error'
type Warning = { field: string; label: string; confidence: number; value: string }

const STEP_LABELS: Record<Step, string> = {
  idle:       '',
  uploading:  'AI 파싱 중...',
  confirming: '자동 확인 중...',
  generating: '생산의뢰서 생성 중...',
  done:       '완료',
  error:      '오류',
}

export default function OrderUpload() {
  const navigate = useNavigate()
  const [isDragOver, setIsDragOver]   = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError]     = useState('')
  const [step, setStep]               = useState<Step>('idle')
  const [warnings, setWarnings]       = useState<Warning[]>([])
  const [errorMsg, setErrorMsg]       = useState('')
  const [, setPrId]                   = useState<string | null>(null)

  const isPending = ['uploading', 'confirming', 'generating'].includes(step)

  const isValidFileType = (name: string) => {
    const n = name.toLowerCase()
    return n.endsWith('.pdf') || n.endsWith('.xlsx') || n.endsWith('.xls')
  }

  const validateAndSet = (file: File) => {
    setFileError('')
    if (!isValidFileType(file.name)) {
      setFileError('PDF 또는 Excel(.xlsx, .xls) 파일만 업로드할 수 있습니다.')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setFileError('파일 크기는 20MB 이하여야 합니다.')
      return
    }
    setSelectedFile(file)
    setStep('idle')
    setWarnings([])
    setErrorMsg('')
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) validateAndSet(file)
  }, [])

  const handleUpload = async () => {
    if (!selectedFile) return
    setWarnings([])
    setErrorMsg('')
    setPrId(null)

    try {
      // ① 업로드 + AI 파싱
      setStep('uploading')
      const order = await ordersApi.upload(selectedFile)

      // ② 자동 확인 (신뢰도 무관, 경고만 수집)
      setStep('confirming')
      const { warnings: w } = await ordersApi.autoConfirm(order.id)
      setWarnings(w)

      // ③ 생산의뢰서 자동 생성
      setStep('generating')
      try {
        const pr = await productionApi.generateWeekly({ order_id: order.id })
        setPrId(pr.id)
      } catch {
        // 생산의뢰서 생성 실패는 경고로만 처리 (확인 자체는 완료)
        setWarnings((prev) => [
          ...prev,
          {
            field:      'production',
            label:      '생산의뢰서 생성',
            confidence: 0,
            value:      '4주 범위 내 선적 일정이 없거나 생성에 실패했습니다. 수동으로 생성해주세요.',
          },
        ])
      }

      setStep('done')
    } catch (e: any) {
      setStep('error')
      setErrorMsg(e?.message ?? '알 수 없는 오류가 발생했습니다.')
    }
  }

  // 완료 화면
  if (step === 'done') {
    return (
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">업로드 완료</h1>
        </div>

        {/* 성공 배너 */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 text-green-700 font-semibold mb-1">
            <span>✅</span> 생산의뢰서가 생성되었습니다
          </div>
          <p className="text-sm text-green-600">
            {selectedFile?.name} 파싱 완료 · 생산의뢰서 목록에서 확인하세요.
          </p>
        </div>

        {/* 경고 목록 */}
        {warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 text-yellow-700 font-semibold mb-3">
              <span>⚠️</span> 다음 항목을 확인해주세요
            </div>
            <ul className="space-y-2">
              {warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className={`mt-0.5 shrink-0 text-xs font-mono px-1.5 py-0.5 rounded ${
                    w.confidence === 0
                      ? 'bg-red-100 text-red-600'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {w.confidence === 0 ? '오류' : `${Math.round(w.confidence * 100)}%`}
                  </span>
                  <div>
                    <span className="font-medium text-gray-700">{w.label}</span>
                    <span className="text-gray-500 ml-2">→ {w.value}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => navigate('/production')}
            className="btn-primary flex-1"
          >
            생산의뢰서 목록 보기
          </button>
          <button
            onClick={() => {
              setSelectedFile(null)
              setStep('idle')
              setWarnings([])
            }}
            className="btn-secondary"
          >
            추가 업로드
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">발주서 업로드</h1>
        <p className="text-gray-500 text-sm mt-1">SA(PDF/Excel)를 업로드하면 자동으로 생산의뢰서까지 생성됩니다</p>
      </div>

      {/* 드래그앤드롭 영역 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
          isPending
            ? 'border-brand-300 bg-brand-50 cursor-not-allowed'
            : isDragOver
            ? 'border-brand-500 bg-brand-50'
            : selectedFile
            ? 'border-green-400 bg-green-50'
            : 'border-gray-300 bg-white hover:border-brand-400 hover:bg-brand-50'
        }`}
        onClick={() => !isPending && document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".pdf,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) validateAndSet(file)
          }}
        />

        {isPending ? (
          <div>
            <svg className="animate-spin h-10 w-10 mx-auto mb-3 text-brand-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="font-medium text-brand-700">{STEP_LABELS[step]}</p>
            <p className="text-sm text-gray-400 mt-1">{selectedFile?.name}</p>
          </div>
        ) : selectedFile ? (
          <div>
            <div className="text-4xl mb-3">📄</div>
            <p className="font-medium text-gray-900">{selectedFile.name}</p>
            <p className="text-sm text-gray-500 mt-1">{(selectedFile.size / 1024).toFixed(0)} KB</p>
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setStep('idle') }}
              className="mt-2 text-xs text-red-500 hover:underline"
            >
              다른 파일 선택
            </button>
          </div>
        ) : (
          <div>
            <div className="text-5xl mb-3">📤</div>
            <p className="font-medium text-gray-700">PDF 또는 Excel 파일을 여기에 끌어다 놓거나</p>
            <p className="text-sm text-brand-600 font-medium mt-1">클릭하여 파일 선택</p>
            <p className="text-xs text-gray-400 mt-3">PDF · Excel(.xlsx, .xls) · 최대 20MB</p>
          </div>
        )}
      </div>

      {fileError && (
        <p className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{fileError}</p>
      )}

      {step === 'error' && (
        <div className="mt-3 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
          <p className="font-medium">처리 실패</p>
          <p className="mt-0.5">{errorMsg}</p>
        </div>
      )}

      {/* 진행 단계 표시 */}
      {isPending && (
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
          {(['uploading', 'confirming', 'generating'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <span>→</span>}
              <span className={step === s ? 'text-brand-600 font-semibold' : step > s ? 'text-green-500' : ''}>
                {STEP_LABELS[s]}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleUpload}
          disabled={!selectedFile || isPending}
          className="btn-primary px-8"
        >
          업로드 및 생산의뢰서 생성
        </button>
      </div>

      <div className="mt-8 bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
        <p className="font-medium mb-1">처리 순서</p>
        <ol className="space-y-1 text-blue-600 list-decimal list-inside">
          <li>SA PDF/Excel 업로드 → AI 파싱 (약 5~10초)</li>
          <li>파싱 결과 자동 확인 (신뢰도 낮은 항목은 경고 표시)</li>
          <li>생산의뢰서 자동 생성 → 목록에서 Excel 다운로드</li>
        </ol>
      </div>
    </div>
  )
}
