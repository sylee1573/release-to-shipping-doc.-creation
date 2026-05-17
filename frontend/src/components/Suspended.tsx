import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function Suspended() {
  const { logout } = useAuthStore()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-red-700 mb-2">서비스가 일시 중단되었습니다</h1>
        <p className="text-gray-600 text-sm mb-6 leading-relaxed">
          미납 청구금이 확인되어 서비스가 중단되었습니다.
          납부 완료 후 담당자에게 연락해 주시면 즉시 복구해 드립니다.
          <br />
          <strong>기존 데이터는 안전하게 보관됩니다.</strong>
        </p>
        <div className="bg-gray-50 rounded-lg p-4 text-left text-sm text-gray-700 mb-6">
          <p className="font-semibold mb-1">납부 안내</p>
          <p>계좌: 000-0000-0000 (담당자 문의)</p>
          <p>문의: support@orderauto.co.kr</p>
        </div>
        <button
          onClick={() => {
            logout()
            navigate('/login')
          }}
          className="btn-secondary w-full"
        >
          로그인 화면으로
        </button>
      </div>
    </div>
  )
}
