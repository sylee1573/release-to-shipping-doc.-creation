import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ordersApi } from '../api/orders'

export default function OrderUpload() {
  const navigate = useNavigate()
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')

  const mutation = useMutation({
    mutationFn: (file: File) => ordersApi.upload(file),
    onSuccess: (order) => navigate(`/orders/${order.id}/review`),
  })

  const validateAndSet = (file: File) => {
    setFileError('')
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setFileError('PDF 파일만 업로드할 수 있습니다.')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setFileError('파일 크기는 20MB 이하여야 합니다.')
      return
    }
    setSelectedFile(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) validateAndSet(file)
  }, [])

  const handleUpload = () => {
    if (selectedFile) mutation.mutate(selectedFile)
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">발주서 업로드</h1>
        <p className="text-gray-500 text-sm mt-1">PDF 발주서를 업로드하면 AI가 자동으로 내용을 파싱합니다</p>
      </div>

      {/* 드래그앤드롭 영역 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
          isDragOver
            ? 'border-brand-500 bg-brand-50'
            : selectedFile
            ? 'border-green-400 bg-green-50'
            : 'border-gray-300 bg-white hover:border-brand-400 hover:bg-brand-50'
        }`}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) validateAndSet(file)
          }}
        />

        {selectedFile ? (
          <div>
            <div className="text-4xl mb-3">📄</div>
            <p className="font-medium text-gray-900">{selectedFile.name}</p>
            <p className="text-sm text-gray-500 mt-1">
              {(selectedFile.size / 1024).toFixed(0)} KB
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedFile(null) }}
              className="mt-2 text-xs text-red-500 hover:underline"
            >
              다른 파일 선택
            </button>
          </div>
        ) : (
          <div>
            <div className="text-5xl mb-3">📤</div>
            <p className="font-medium text-gray-700">PDF 파일을 여기에 끌어다 놓거나</p>
            <p className="text-sm text-brand-600 font-medium mt-1">클릭하여 파일 선택</p>
            <p className="text-xs text-gray-400 mt-3">PDF 형식 · 최대 20MB</p>
          </div>
        )}
      </div>

      {fileError && (
        <p className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{fileError}</p>
      )}

      {mutation.isError && (
        <div className="mt-3 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
          <p className="font-medium">업로드 실패</p>
          <p className="mt-0.5">{(mutation.error as Error).message}</p>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleUpload}
          disabled={!selectedFile || mutation.isPending}
          className="btn-primary px-8"
        >
          {mutation.isPending ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              AI 파싱 중...
            </span>
          ) : (
            '업로드 및 파싱 시작'
          )}
        </button>
      </div>

      <div className="mt-8 bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
        <p className="font-medium mb-1">안내</p>
        <ul className="space-y-1 text-blue-600 list-disc list-inside">
          <li>텍스트 PDF만 지원합니다 (스캔 PDF 미지원)</li>
          <li>파싱 완료까지 약 5~10초 소요됩니다</li>
          <li>파싱 후 결과를 확인하고 수정할 수 있습니다</li>
        </ul>
      </div>
    </div>
  )
}
