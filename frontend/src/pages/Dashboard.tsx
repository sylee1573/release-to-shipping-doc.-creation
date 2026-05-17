import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ordersApi } from '../api/orders'
import { productionApi } from '../api/production'
import type { Order } from '../types'

const ORDER_STATUS_STYLE: Record<string, string> = {
  pending:    'bg-gray-100 text-gray-600',
  processing: 'bg-blue-100 text-blue-700',
  done:       'bg-green-100 text-green-700',
  failed:     'bg-red-100 text-red-700',
}
const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: '대기', processing: '파싱 중', done: '완료', failed: '실패',
}

function thisMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function Dashboard() {
  const navigate = useNavigate()

  const { data: orders = [] } = useQuery({
    queryKey: ['orders-all'],
    queryFn: () => ordersApi.list({ limit: 200 }),
  })

  const { data: productionItems = [] } = useQuery({
    queryKey: ['production', ''],
    queryFn: () => productionApi.list(),
  })

  const ym = thisMonth()
  const thisMonthOrders = orders.filter((o) => o.created_at.startsWith(ym))
  const parsedDone = orders.filter((o) => o.parse_status === 'done')

  const stats = [
    { label: '이번 달 처리', value: thisMonthOrders.length, icon: '📋', color: 'text-brand-700' },
    { label: '파싱 완료',   value: parsedDone.length,       icon: '✅', color: 'text-green-700' },
    { label: '생산의뢰서',  value: productionItems.length,  icon: '🏭', color: 'text-purple-700' },
    { label: '선적서류',    value: '—',                     icon: '🚢', color: 'text-blue-700' },
  ]

  // 최근 5건
  const recentOrders: Order[] = orders.slice(0, 5)

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
          <p className="text-gray-500 text-sm mt-1">발주 처리 현황을 확인합니다</p>
        </div>
        <button onClick={() => navigate('/orders/upload')} className="btn-primary">
          + 발주서 업로드
        </button>
      </div>

      {/* 현황 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{stat.icon}</span>
            </div>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* 최근 발주 */}
      {recentOrders.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-800 mb-4">최근 발주서</h2>
          <div className="divide-y divide-gray-50">
            {recentOrders.map((order) => (
              <button
                key={order.id}
                onClick={() => navigate(`/orders/${order.id}/review`)}
                className="w-full flex items-center justify-between py-3 text-left hover:bg-gray-50 -mx-1 px-1 rounded transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {order.file_name ?? order.id}
                  </p>
                  {order.customer_name && (
                    <p className="text-xs text-gray-500">{order.customer_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ORDER_STATUS_STYLE[order.parse_status]}`}>
                    {ORDER_STATUS_LABEL[order.parse_status]}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(order.created_at).toLocaleDateString('ko-KR')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 빠른 액션 */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4">빠른 액션</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => navigate('/orders/upload')}
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-colors text-left"
          >
            <span className="text-2xl">📤</span>
            <div>
              <p className="font-medium text-gray-900 text-sm">발주서 업로드</p>
              <p className="text-xs text-gray-500">PDF 파싱 시작</p>
            </div>
          </button>
          <button
            onClick={() => navigate('/production')}
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-colors text-left"
          >
            <span className="text-2xl">🏭</span>
            <div>
              <p className="font-medium text-gray-900 text-sm">생산의뢰서 목록</p>
              <p className="text-xs text-gray-500">Excel 다운로드</p>
            </div>
          </button>
          <button
            onClick={() => navigate('/shipment')}
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-colors text-left"
          >
            <span className="text-2xl">🚢</span>
            <div>
              <p className="font-medium text-gray-900 text-sm">선적서류 목록</p>
              <p className="text-xs text-gray-500">Invoice / Packing List</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
