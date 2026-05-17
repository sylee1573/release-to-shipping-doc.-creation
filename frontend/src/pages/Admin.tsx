import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../api/admin'

type Tab = 'usage' | 'tenants' | 'templates'

// ── 사용량 탭 ──────────────────────────────────────────────
function UsageTab() {
  const [month, setMonth] = useState('')
  const qc = useQueryClient()

  const { data: usage = [], isLoading } = useQuery({
    queryKey: ['admin-usage', month],
    queryFn: () => adminApi.getUsage(month || undefined),
  })

  const restoreMutation = useMutation({
    mutationFn: (tenantId: string) => adminApi.restoreTenant(tenantId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-usage'] }),
  })

  return (
    <>
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-800 mb-3">사용량 리포트</h2>
        <div className="flex items-center gap-3">
          <input
            type="month"
            className="input w-44"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <span className="text-sm text-gray-500">{month ? `${month} 기준` : '전체 기간'}</span>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['고객사', '청구 월', '처리 건수', '금액', '상태', '복구'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : usage.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">데이터가 없습니다</td></tr>
            ) : (
              usage.map((row) => (
                <tr key={`${row.tenant_id}-${row.billing_month}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.tenant_name}</td>
                  <td className="px-4 py-3 text-gray-600">{row.billing_month}</td>
                  <td className="px-4 py-3 text-gray-600">{row.unit_count}건</td>
                  <td className="px-4 py-3 text-gray-600">
                    {row.amount != null ? `₩${row.amount.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      row.status === 'paid' ? 'bg-green-100 text-green-700'
                      : row.status === 'suspended' ? 'bg-red-100 text-red-700'
                      : row.status === 'overdue' ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-600'
                    }`}>
                      {{ paid: '납부완료', suspended: '중단', overdue: '연체', pending: '대기' }[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.status === 'suspended' && (
                      <button
                        onClick={() => restoreMutation.mutate(row.tenant_id)}
                        disabled={restoreMutation.isPending}
                        className="text-xs text-brand-600 hover:underline font-medium"
                      >
                        서비스 복구
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── 고객사 탭 ──────────────────────────────────────────────
function TenantsTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', contact_email: '', business_number: '', contact_phone: '' })
  const [showForm, setShowForm] = useState(false)

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => adminApi.listTenants(),
  })

  const createMutation = useMutation({
    mutationFn: () => adminApi.createTenant({
      name: form.name,
      contact_email: form.contact_email,
      business_number: form.business_number || undefined,
      contact_phone: form.contact_phone || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setForm({ name: '', contact_email: '', business_number: '', contact_phone: '' })
      setShowForm(false)
    },
  })

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold text-gray-800">고객사 목록</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          {showForm ? '취소' : '+ 고객사 등록'}
        </button>
      </div>

      {showForm && (
        <div className="card mb-4">
          <h3 className="font-medium text-gray-800 mb-3">신규 고객사 등록</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">회사명 *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="㈜한국부품" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">담당자 이메일 *</label>
              <input className="input" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="manager@company.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">사업자번호</label>
              <input className="input" value={form.business_number} onChange={(e) => setForm({ ...form, business_number: e.target.value })} placeholder="123-45-67890" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">연락처</label>
              <input className="input" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="010-1234-5678" />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.name || !form.contact_email || createMutation.isPending}
              className="btn-primary text-sm"
            >
              등록
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['회사명', '사업자번호', '담당자 이메일', '연락처', '상태'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : tenants.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">등록된 고객사가 없습니다</td></tr>
            ) : (
              tenants.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{t.business_number ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.contact_email}</td>
                  <td className="px-4 py-3 text-gray-500">{t.contact_phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {t.is_active ? '정상' : '중단'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── 양식 템플릿 탭 ──────────────────────────────────────────
function TemplatesTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    tenant_id: '',
    customer_name: '',
    template_description: '',
    sample_text: '',
  })
  const [showForm, setShowForm] = useState(false)

  const { data: tenants = [] } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => adminApi.listTenants(),
  })

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['admin-templates'],
    queryFn: () => adminApi.listTemplates(),
  })

  const createMutation = useMutation({
    mutationFn: () => adminApi.createTemplate({
      tenant_id: form.tenant_id,
      customer_name: form.customer_name,
      template_description: form.template_description || undefined,
      sample_text: form.sample_text || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-templates'] })
      setForm({ tenant_id: '', customer_name: '', template_description: '', sample_text: '' })
      setShowForm(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-templates'] }),
  })

  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? id

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold text-gray-800">발주서 양식 템플릿</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          {showForm ? '취소' : '+ 양식 등록'}
        </button>
      </div>

      {showForm && (
        <div className="card mb-4">
          <h3 className="font-medium text-gray-800 mb-3">발주서 양식 등록</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">고객사 *</label>
                <select
                  className="input"
                  value={form.tenant_id}
                  onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}
                >
                  <option value="">-- 고객사 선택 --</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">발주 고객사명 (발주처) *</label>
                <input
                  className="input"
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  placeholder="예: 현대자동차"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">양식 특징 설명</label>
              <input
                className="input"
                value={form.template_description}
                onChange={(e) => setForm({ ...form, template_description: e.target.value })}
                placeholder="예: 품번이 2행에 위치, 수량은 'QTY' 열에 표기"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">샘플 발주서 원문 (AI 파싱 힌트)</label>
              <textarea
                className="input min-h-[100px] resize-y font-mono text-xs"
                value={form.sample_text}
                onChange={(e) => setForm({ ...form, sample_text: e.target.value })}
                placeholder="샘플 발주서 텍스트를 붙여넣으세요..."
              />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.tenant_id || !form.customer_name || createMutation.isPending}
              className="btn-primary text-sm"
            >
              등록
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card text-center py-8 text-gray-400">불러오는 중...</div>
      ) : templates.length === 0 ? (
        <div className="card text-center py-8 text-gray-400">등록된 양식이 없습니다</div>
      ) : (
        <div className="space-y-3">
          {templates.map((tmpl) => (
            <div key={tmpl.id} className="card flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-900">{tmpl.customer_name}</span>
                  <span className="text-xs text-gray-400">({tenantName(tmpl.tenant_id)})</span>
                </div>
                {tmpl.template_description && (
                  <p className="text-sm text-gray-500">{tmpl.template_description}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  등록일: {new Date(tmpl.created_at).toLocaleDateString('ko-KR')}
                </p>
              </div>
              <button
                onClick={() => deleteMutation.mutate(tmpl.id)}
                disabled={deleteMutation.isPending}
                className="text-xs text-red-500 hover:underline shrink-0"
              >
                비활성화
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── 메인 Admin 페이지 ───────────────────────────────────────
export default function Admin() {
  const [tab, setTab] = useState<Tab>('usage')

  const TABS: { key: Tab; label: string }[] = [
    { key: 'usage',     label: '사용량 리포트' },
    { key: 'tenants',   label: '고객사 관리' },
    { key: 'templates', label: '양식 템플릿' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">관리자</h1>
        <p className="text-gray-500 text-sm mt-1">고객사 사용량 및 서비스 상태를 관리합니다</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'usage'     && <UsageTab />}
      {tab === 'tenants'   && <TenantsTab />}
      {tab === 'templates' && <TemplatesTab />}
    </div>
  )
}
