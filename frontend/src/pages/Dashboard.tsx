import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ordersApi } from '../api/orders'
import { productionApi } from '../api/production'
import { shipmentApi } from '../api/shipment'
import type { Order } from '../types'

const PARSE_STATUS_STYLE: Record<string, string> = {
  pending:    'bg-gray-100 text-gray-600',
  processing: 'bg-blue-100 text-blue-700',
  done:       'bg-green-100 text-green-700',
  failed:     'bg-red-100 text-red-700',
}
const PARSE_STATUS_LABEL: Record<string, string> = {
  pending: '대기', processing: '파싱 중', done: '완료', failed: '실패',
}

function thisMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const PROD_STATUS: Array<{
  key: 'draft' | 'confirmed' | 'in_production' | 'done'
  label: string
  bar: string
  text: string
}> = [
  { key: 'draft',         label: '초안',    bar: 'bg-gray-300',   text: 'text-gray-600'  },
  { key: 'confirmed',     label: '확정',    bar: 'bg-blue-400',   text: 'text-blue-700'  },
  { key: 'in_production', label: '생산 중', bar: 'bg-yellow-400', text: 'text-yellow-700' },
  { key: 'done',          label: '완료',    bar: 'bg-green-400',  text: 'text-green-700' },
]

export default function Dashboard() {
  const navigate = useNavigate()

  const { data: orders = [] } = useQuery({
    queryKey: ['orders-all'],
    queryFn: () => ordersApi.list({ limit: 200 }),
    refetchInterval: (query) => {
      const data = query.state.data as Order[] | undefined
      return data?.some((o) => o.parse_status === 'processing') ? 3000 : false
    },
  })
  const { data: productionItems = [] } = useQuery({
    queryKey: ['production'],
    queryFn: () => productionApi.list({ limit: 200 }),
  })
  const { data: shipmentItems = [] } = useQuery({
    queryKey: ['shipment'],
    queryFn: () => shipmentApi.list({ limit: 200 }),
  })

  const ym = thisMonth()
  const thisMonthOrders = orders.filter((o) => o.created_at.startsWith(ym))
  const processingOrders = orders.filter((o) => o.parse_status === 'processing')
  const pendingConfirm = orders.filter((o) => o.parse_status === 'done' && !o.confirmed_at)
  const parseFailed = orders.filter((o) => o.parse_status === 'failed')
  const recentOrders: Order[] = orders.slice(0, 5)

  const invoiceCount = shipmentItems.filter((d) => d.doc_type === 'invoice').length
  const pklCount = shipmentItems.filter((d) => d.doc_type === 'packing_list').length
  const inProductionCount = productionItems.filter((p) => p.status === 'in_production').length

  const stats = [
    {
      label: '이번 달 처리',
      value: thisMonthOrders.length,
      icon: '📋',
      color: 'text-brand-700',
      sub: `전체 ${orders.length}건`,
    },
    {
      label: '확인 대기',
      value: pendingConfirm.length,
      icon: '⏳',
      color: pendingConfirm.length > 0 ? 'text-yellow-600' : 'text-green-700',
      sub: pendingConfirm.length > 0 ? '검토 필요' : '모두 확인 완료',
    },
    {
      label: '생산의뢰서',
      value: productionItems.length,
      icon: '🏭',
      color: 'text-purple-700',
      sub: inProductionCount > 0 ? `생산 중 ${inProductionCount}건` : '—',
    },
    {
      label: '선적서류',
      value: shipmentItems.length,
      icon: '🚢',
      color: 'text-blue-700',
      sub: shipmentItems.length > 0 ? `Invoice ${invoiceCount} / PKL ${pklCount}` : '—',
    },
  ]

  const pipeline = [
    { label: '업로드',   count: orders.length,                                            bg: 'bg-gray-100',   text: 'text-gray-700'   },
    { label: '파싱완료', count: orders.filter((o) => o.parse_status === 'done').length,    bg: 'bg-blue-100',   text: 'text-blue-700'   },
    { label: '확인완료', count: orders.filter((o) => !!o.confirmed_at).length,             bg: 'bg-indigo-100', text: 'text-indigo-700' },
    { label: '생산의뢰', count: productionItems.length,                                    bg: 'bg-purple-100', text: 'text-purple-700' },
    { label: '선적서류', count: shipmentItems.length,                                      bg: 'bg-teal-100',   text: 'text-teal-700'   },
  ]

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
          <p className="text-gray-500 text-sm mt-1">발주 처리 현황을 확인합니다</p>
        </div>
        <button onClick={() => navigate('/orders/upload')} className="btn-primary">
          + 발주서 업로드
        </button>
      </div>

      {/* 알림 배너: 파싱 중 */}
      {processingOrders.length > 0 && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-5 py-3.5 flex items-center gap-3">
          <svg className="animate-spin h-4 w-4 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
          </svg>
          <p className="text-sm font-medium text-blue-800">
            발주서 {processingOrders.length}건 파싱 중 — 완료되면 자동으로 업데이트됩니다
          </p>
        </div>
      )}

      {/* 알림 배너: 확인 대기 */}
      {pendingConfirm.length > 0 && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-semibold text-yellow-800 text-sm">
                파싱 완료 발주서 {pendingConfirm.length}건이 확인을 기다리고 있습니다
              </p>
              <p className="text-yellow-600 text-xs mt-0.5">신뢰도를 검토하고 내용을 확정해주세요</p>
            </div>
          </div>
          <button
            onClick={() => navigate(`/orders/${pendingConfirm[0].id}/review`)}
            className="text-sm font-medium text-yellow-700 hover:underline shrink-0 ml-4"
          >
            검토하기 →
          </button>
        </div>
      )}

      {/* 알림 배너: 파싱 실패 */}
      {parseFailed.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">❌</span>
            <p className="font-semibold text-red-700 text-sm">
              파싱 실패 {parseFailed.length}건 — 재업로드가 필요합니다
            </p>
          </div>
          <button
            onClick={() => navigate('/orders/upload')}
            className="text-sm font-medium text-red-600 hover:underline shrink-0 ml-4"
          >
            재업로드 →
          </button>
        </div>
      )}

      {/* 현황 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <div className="text-2xl mb-3">{s.icon}</div>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs font-medium text-gray-700 mt-1">{s.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* 처리 파이프라인 */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">처리 파이프라인</h2>
        <div className="flex items-stretch gap-1">
          {pipeline.map((step, i) => (
            <div key={step.label} className="flex items-center flex-1 min-w-0">
              <div className={`flex-1 rounded-lg px-2 py-3 ${step.bg} text-center min-w-0`}>
                <p className={`text-2xl font-bold leading-none ${step.text}`}>{step.count}</p>
                <p className={`text-xs font-medium mt-1 ${step.text} opacity-80`}>{step.label}</p>
              </div>
              {i < pipeline.length - 1 && (
                <span className="text-gray-300 text-base mx-0.5 flex-shrink-0">›</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 하단 2열 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 최근 발주서 */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">최근 발주서</h2>
            {orders.length > 5 && (
              <span className="text-xs text-gray-400">최근 5건</span>
            )}
          </div>
          {recentOrders.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-400 text-sm">발주서가 없습니다</p>
              <button
                onClick={() => navigate('/orders/upload')}
                className="text-sm text-brand-600 hover:underline mt-2"
              >
                첫 발주서 업로드 →
              </button>
            </div>
          ) : (
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
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PARSE_STATUS_STYLE[order.parse_status]}`}>
                      {PARSE_STATUS_LABEL[order.parse_status]}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(order.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 생산의뢰서 현황 */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">생산의뢰서 현황</h2>
            <button
              onClick={() => navigate('/production')}
              className="text-xs text-brand-600 hover:underline"
            >
              전체 보기 →
            </button>
          </div>
          {productionItems.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-400 text-sm">생산의뢰서가 없습니다</p>
              <p className="text-xs text-gray-400 mt-1">발주서 확인 완료 후 생성할 수 있습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {PROD_STATUS.map(({ key, label, bar, text }) => {
                const count = productionItems.filter((p) => p.status === key).length
                const pct = Math.round((count / productionItems.length) * 100)
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className={`text-xs w-14 shrink-0 font-medium ${text}`}>{label}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${bar} transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-8 text-right">{count}건</span>
                  </div>
                )
              })}
              <p className="text-xs text-gray-400 pt-1">총 {productionItems.length}건</p>
            </div>
          )}
        </div>
      </div>

      {/* 빠른 액션 */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4">빠른 액션</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { icon: '📤', title: '발주서 업로드',  desc: 'PDF 파싱 시작',           to: '/orders/upload' },
            { icon: '🏭', title: '생산의뢰서 목록', desc: 'Excel 다운로드',          to: '/production'   },
            { icon: '🚢', title: '선적서류 목록',   desc: 'Invoice / Packing List', to: '/shipment'     },
          ].map((a) => (
            <button
              key={a.to}
              onClick={() => navigate(a.to)}
              className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-colors text-left"
            >
              <span className="text-2xl">{a.icon}</span>
              <div>
                <p className="font-medium text-gray-900 text-sm">{a.title}</p>
                <p className="text-xs text-gray-500">{a.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
