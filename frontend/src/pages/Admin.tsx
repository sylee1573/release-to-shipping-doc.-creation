import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../api/admin'
import type { CustomerProfile, ItemMaster } from '../types'

type Tab = 'usage' | 'tenants' | 'templates' | 'customer-profiles' | 'item-master'

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
          <input type="month" className="input w-44" value={month} onChange={(e) => setMonth(e.target.value)} />
          <span className="text-sm text-gray-500">{month ? `${month} 기준` : '전체 기간'}</span>
        </div>
      </div>
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>{['고객사', '청구 월', '처리 건수', '금액', '상태', '복구'].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : usage.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">데이터가 없습니다</td></tr>
            ) : usage.map((row) => (
              <tr key={`${row.tenant_id}-${row.billing_month}`} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{row.tenant_name}</td>
                <td className="px-4 py-3 text-gray-600">{row.billing_month}</td>
                <td className="px-4 py-3 text-gray-600">{row.unit_count}건</td>
                <td className="px-4 py-3 text-gray-600">{row.amount != null ? `₩${row.amount.toLocaleString()}` : '—'}</td>
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
                    <button onClick={() => restoreMutation.mutate(row.tenant_id)} disabled={restoreMutation.isPending}
                      className="text-xs text-brand-600 hover:underline font-medium">서비스 복구</button>
                  )}
                </td>
              </tr>
            ))}
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

  const { data: tenants = [], isLoading } = useQuery({ queryKey: ['admin-tenants'], queryFn: () => adminApi.listTenants() })

  const createMutation = useMutation({
    mutationFn: () => adminApi.createTenant({ name: form.name, contact_email: form.contact_email, business_number: form.business_number || undefined, contact_phone: form.contact_phone || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tenants'] }); setForm({ name: '', contact_email: '', business_number: '', contact_phone: '' }); setShowForm(false) },
  })

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold text-gray-800">고객사 목록</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">{showForm ? '취소' : '+ 고객사 등록'}</button>
      </div>
      {showForm && (
        <div className="card mb-4">
          <h3 className="font-medium text-gray-800 mb-3">신규 고객사 등록</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">회사명 *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">담당자 이메일 *</label><input className="input" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">사업자번호</label><input className="input" value={form.business_number} onChange={(e) => setForm({ ...form, business_number: e.target.value })} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">연락처</label><input className="input" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
          </div>
          <div className="flex justify-end mt-3">
            <button onClick={() => createMutation.mutate()} disabled={!form.name || !form.contact_email || createMutation.isPending} className="btn-primary text-sm">등록</button>
          </div>
        </div>
      )}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>{['회사명', '사업자번호', '담당자 이메일', '연락처', '상태'].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : tenants.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">등록된 고객사가 없습니다</td></tr>
            ) : tenants.map((t) => (
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
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── 양식 템플릿 탭 ──────────────────────────────────────────
function TemplatesTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ tenant_id: '', customer_name: '', template_description: '', sample_text: '' })
  const [showForm, setShowForm] = useState(false)

  const { data: tenants = [] } = useQuery({ queryKey: ['admin-tenants'], queryFn: () => adminApi.listTenants() })
  const { data: templates = [], isLoading } = useQuery({ queryKey: ['admin-templates'], queryFn: () => adminApi.listTemplates() })

  const createMutation = useMutation({
    mutationFn: () => adminApi.createTemplate({ tenant_id: form.tenant_id, customer_name: form.customer_name, template_description: form.template_description || undefined, sample_text: form.sample_text || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-templates'] }); setForm({ tenant_id: '', customer_name: '', template_description: '', sample_text: '' }); setShowForm(false) },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-templates'] }),
  })

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold text-gray-800">발주서 양식 템플릿</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">{showForm ? '취소' : '+ 양식 등록'}</button>
      </div>
      {showForm && (
        <div className="card mb-4">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">고객사 *</label>
                <select className="input" value={form.tenant_id} onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}>
                  <option value="">-- 선택 --</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">발주 고객사명 *</label>
                <input className="input" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
              </div>
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">양식 특징 설명</label><input className="input" value={form.template_description} onChange={(e) => setForm({ ...form, template_description: e.target.value })} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">샘플 원문</label><textarea className="input min-h-[80px] font-mono text-xs" value={form.sample_text} onChange={(e) => setForm({ ...form, sample_text: e.target.value })} /></div>
          </div>
          <div className="flex justify-end mt-3">
            <button onClick={() => createMutation.mutate()} disabled={!form.tenant_id || !form.customer_name || createMutation.isPending} className="btn-primary text-sm">등록</button>
          </div>
        </div>
      )}
      {isLoading ? <div className="card text-center py-8 text-gray-400">불러오는 중...</div>
      : templates.length === 0 ? <div className="card text-center py-8 text-gray-400">등록된 양식이 없습니다</div>
      : (
        <div className="space-y-3">
          {templates.map((tmpl) => (
            <div key={tmpl.id} className="card flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{tmpl.customer_name}</p>
                {tmpl.template_description && <p className="text-sm text-gray-500">{tmpl.template_description}</p>}
              </div>
              <button onClick={() => deleteMutation.mutate(tmpl.id)} disabled={deleteMutation.isPending} className="text-xs text-red-500 hover:underline shrink-0">비활성화</button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── 고객사 프로필 탭 ────────────────────────────────────────
function CustomerProfilesTab() {
  const qc = useQueryClient()
  const BLANK: { customer_name: string; date_type: 'arrival' | 'completion'; ship_to_name: string; ship_to_address: string; final_destination: string; sea_transit_days: number; shipping_prep_days: number; production_lead_days: number } = { customer_name: '', date_type: 'arrival', ship_to_name: '', ship_to_address: '', final_destination: '', sea_transit_days: 21, shipping_prep_days: 2, production_lead_days: 7 }
  const [form, setForm] = useState(BLANK)
  const [editing, setEditing] = useState<CustomerProfile | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data: profiles = [], isLoading } = useQuery({ queryKey: ['customer-profiles'], queryFn: () => adminApi.listCustomerProfiles() })

  const createMutation = useMutation({
    mutationFn: () => adminApi.createCustomerProfile({ ...form, ship_to_name: form.ship_to_name || undefined, ship_to_address: form.ship_to_address || undefined, final_destination: form.final_destination || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customer-profiles'] }); setForm(BLANK); setShowForm(false) },
  })

  const updateMutation = useMutation({
    mutationFn: (cp: CustomerProfile) => adminApi.updateCustomerProfile(cp.id, { date_type: form.date_type, ship_to_name: form.ship_to_name || undefined, ship_to_address: form.ship_to_address || undefined, final_destination: form.final_destination || undefined, sea_transit_days: form.sea_transit_days, shipping_prep_days: form.shipping_prep_days, production_lead_days: form.production_lead_days }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customer-profiles'] }); setEditing(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCustomerProfile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customer-profiles'] }),
  })

  const startEdit = (cp: CustomerProfile) => {
    setEditing(cp)
    setForm({ customer_name: cp.customer_name, date_type: cp.date_type, ship_to_name: cp.ship_to_name ?? '', ship_to_address: cp.ship_to_address ?? '', final_destination: cp.final_destination ?? '', sea_transit_days: cp.sea_transit_days, shipping_prep_days: cp.shipping_prep_days, production_lead_days: cp.production_lead_days })
  }

  const FormPanel = ({ isEdit }: { isEdit: boolean }) => (
    <div className="card mb-4">
      <h3 className="font-medium text-gray-800 mb-3">{isEdit ? '고객사 프로필 수정' : '신규 고객사 프로필 등록'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {!isEdit && (
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">고객사명 (SA 파싱 이름과 동일하게) *</label>
            <input className="input" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} placeholder="예: BORGWARNER TURBO AND EMISSIONS SYSTEMS" />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">SA 날짜 유형</label>
          <select className="input" value={form.date_type} onChange={(e) => setForm({ ...form, date_type: e.target.value as 'arrival' | 'completion' })}>
            <option value="arrival">도착일 (고객 도착 기준)</option>
            <option value="completion">완료일 (물건 완료 기준)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">수신처 회사명</label>
          <input className="input" value={form.ship_to_name} onChange={(e) => setForm({ ...form, ship_to_name: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">수신처 주소 (Invoice/Packing 인쇄용)</label>
          <textarea className="input min-h-[70px] text-sm" value={form.ship_to_address} onChange={(e) => setForm({ ...form, ship_to_address: e.target.value })} placeholder="한 줄씩 입력&#10;BLVD. KAPPA No. 1125&#10;RAMOS ARIZPE, MEXICO" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">최종 목적지 (Final Destination)</label>
          <input className="input" value={form.final_destination} onChange={(e) => setForm({ ...form, final_destination: e.target.value })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">해상 운송일수</label>
            <input className="input" type="number" min={1} value={form.sea_transit_days} onChange={(e) => setForm({ ...form, sea_transit_days: Number(e.target.value) })} />
            <p className="text-xs text-gray-400 mt-0.5">도착일→선적일</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">출하 준비일수</label>
            <input className="input" type="number" min={0} value={form.shipping_prep_days} onChange={(e) => setForm({ ...form, shipping_prep_days: Number(e.target.value) })} />
            <p className="text-xs text-gray-400 mt-0.5">선적일→생산완료</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">생산 리드타임 (일)</label>
            <input className="input" type="number" min={1} value={form.production_lead_days} onChange={(e) => setForm({ ...form, production_lead_days: Number(e.target.value) })} />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={() => { setShowForm(false); setEditing(null) }} className="btn-secondary text-sm">취소</button>
        <button
          onClick={() => isEdit ? updateMutation.mutate(editing!) : createMutation.mutate()}
          disabled={(!isEdit && !form.customer_name) || createMutation.isPending || updateMutation.isPending}
          className="btn-primary text-sm"
        >저장</button>
      </div>
    </div>
  )

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="font-semibold text-gray-800">고객사 프로필</h2>
          <p className="text-xs text-gray-500 mt-0.5">납기 역산 설정 · 수신처 주소 · Invoice/Packing 정보</p>
        </div>
        {!showForm && !editing && (
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ 프로필 등록</button>
        )}
      </div>
      {showForm && !editing && <FormPanel isEdit={false} />}
      {editing && <FormPanel isEdit={true} />}

      {isLoading ? <div className="card text-center py-8 text-gray-400">불러오는 중...</div>
      : profiles.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-sm">등록된 고객사 프로필이 없습니다</p>
          <p className="text-xs text-gray-400 mt-1">발주서 파싱 시 자동 납기 역산을 위해 등록해주세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((cp) => (
            <div key={cp.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900 text-sm">{cp.customer_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cp.date_type === 'arrival' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {cp.date_type === 'arrival' ? '도착일 기준' : '완료일 기준'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-0.5">
                    <span>해상 {cp.sea_transit_days}일 · 출하준비 {cp.shipping_prep_days}일 · 리드타임 {cp.production_lead_days}일</span>
                    {cp.ship_to_name && <span>수신처: {cp.ship_to_name}</span>}
                    {cp.final_destination && <span>목적지: {cp.final_destination}</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => startEdit(cp)} className="text-xs text-brand-600 hover:underline">수정</button>
                  <button onClick={() => deleteMutation.mutate(cp.id)} disabled={deleteMutation.isPending} className="text-xs text-red-500 hover:underline">삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── 품목마스터 탭 ───────────────────────────────────────────
function ItemMasterTab() {
  const qc = useQueryClient()
  const BLANK = { customer_name: '', part_number: '', description: '', unit_price: '', net_weight_per_pc: '', pcs_per_box: '' }
  const [form, setForm] = useState(BLANK)
  const [editing, setEditing] = useState<ItemMaster | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [filterCustomer, setFilterCustomer] = useState('')

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['item-master', filterCustomer],
    queryFn: () => adminApi.listItemMaster(filterCustomer || undefined),
  })

  const { data: profiles = [] } = useQuery({ queryKey: ['customer-profiles'], queryFn: () => adminApi.listCustomerProfiles() })
  const customerNames = [...new Set(profiles.map((p) => p.customer_name))]

  const createMutation = useMutation({
    mutationFn: () => adminApi.createItemMaster({
      customer_name: form.customer_name, part_number: form.part_number,
      description: form.description || undefined,
      unit_price: form.unit_price ? Number(form.unit_price) : undefined,
      net_weight_per_pc: form.net_weight_per_pc ? Number(form.net_weight_per_pc) : undefined,
      pcs_per_box: form.pcs_per_box ? Number(form.pcs_per_box) : undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['item-master'] }); setForm(BLANK); setShowForm(false) },
  })

  const updateMutation = useMutation({
    mutationFn: (item: ItemMaster) => adminApi.updateItemMaster(item.id, {
      description: form.description || undefined,
      unit_price: form.unit_price ? Number(form.unit_price) : undefined,
      net_weight_per_pc: form.net_weight_per_pc ? Number(form.net_weight_per_pc) : undefined,
      pcs_per_box: form.pcs_per_box ? Number(form.pcs_per_box) : undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['item-master'] }); setEditing(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteItemMaster(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['item-master'] }),
  })

  const startEdit = (item: ItemMaster) => {
    setEditing(item)
    setForm({ customer_name: item.customer_name, part_number: item.part_number, description: item.description ?? '', unit_price: item.unit_price != null ? String(item.unit_price) : '', net_weight_per_pc: item.net_weight_per_pc != null ? String(item.net_weight_per_pc) : '', pcs_per_box: item.pcs_per_box != null ? String(item.pcs_per_box) : '' })
  }

  const FormFields = ({ isEdit }: { isEdit: boolean }) => (
    <div className="card mb-4">
      <h3 className="font-medium text-gray-800 mb-3">{isEdit ? '품목 수정' : '품목 등록'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {!isEdit && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">고객사명 *</label>
              <select className="input" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })}>
                <option value="">-- 선택 --</option>
                {customerNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">품번 (P/N) *</label>
              <input className="input font-mono" value={form.part_number} onChange={(e) => setForm({ ...form, part_number: e.target.value })} placeholder="E1490001119" />
            </div>
          </>
        )}
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">품목 설명</label>
          <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="BRACKET-SEC'D AIR INJN" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">단가 (USD)</label>
          <input className="input" type="number" step="0.000001" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} placeholder="0.4653" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">개당 순중량 (kg)</label>
          <input className="input" type="number" step="0.000001" value={form.net_weight_per_pc} onChange={(e) => setForm({ ...form, net_weight_per_pc: e.target.value })} placeholder="0.027" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">박스당 수량 (pcs)</label>
          <input className="input" type="number" value={form.pcs_per_box} onChange={(e) => setForm({ ...form, pcs_per_box: e.target.value })} placeholder="200" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={() => { setShowForm(false); setEditing(null) }} className="btn-secondary text-sm">취소</button>
        <button
          onClick={() => isEdit ? updateMutation.mutate(editing!) : createMutation.mutate()}
          disabled={(!isEdit && (!form.customer_name || !form.part_number)) || createMutation.isPending || updateMutation.isPending}
          className="btn-primary text-sm"
        >저장</button>
      </div>
    </div>
  )

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="font-semibold text-gray-800">품목마스터</h2>
          <p className="text-xs text-gray-500 mt-0.5">단가 · 중량 · 박스당 수량 — Invoice/Packing 자동 입력</p>
        </div>
        {!showForm && !editing && (
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ 품목 등록</button>
        )}
      </div>

      {showForm && !editing && <FormFields isEdit={false} />}
      {editing && <FormFields isEdit={true} />}

      {/* 고객사 필터 */}
      <div className="flex items-center gap-3 mb-3">
        <select className="input w-64" value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)}>
          <option value="">전체 고객사</option>
          {customerNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className="text-xs text-gray-400">{items.length}건</span>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>{['고객사', '품번', '설명', '단가(USD)', '순중량(kg)', '박스당', 'RAN(현재)', ''].map((h) => (
              <th key={h} className="px-3 py-3 text-left font-semibold text-gray-600 text-xs">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">등록된 품목이 없습니다</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-3 py-2.5 text-gray-600 text-xs max-w-[120px] truncate">{item.customer_name}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-gray-900">{item.part_number}</td>
                <td className="px-3 py-2.5 text-gray-600 text-xs max-w-[150px] truncate">{item.description ?? '—'}</td>
                <td className="px-3 py-2.5 text-gray-700 text-xs text-right">{item.unit_price != null ? item.unit_price.toFixed(4) : '—'}</td>
                <td className="px-3 py-2.5 text-gray-700 text-xs text-right">{item.net_weight_per_pc != null ? item.net_weight_per_pc.toFixed(4) : '—'}</td>
                <td className="px-3 py-2.5 text-gray-700 text-xs text-right">{item.pcs_per_box ?? '—'}</td>
                <td className="px-3 py-2.5 text-xs text-right">
                  <span className="font-mono text-purple-700 font-semibold">{item.ran_last}</span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(item)} className="text-xs text-brand-600 hover:underline">수정</button>
                    <button onClick={() => deleteMutation.mutate(item.id)} disabled={deleteMutation.isPending} className="text-xs text-red-500 hover:underline">삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── 메인 Admin 페이지 ───────────────────────────────────────
export default function Admin() {
  const [tab, setTab] = useState<Tab>('customer-profiles')

  const TABS: { key: Tab; label: string }[] = [
    { key: 'customer-profiles', label: '고객사 프로필' },
    { key: 'item-master',       label: '품목마스터' },
    { key: 'usage',             label: '사용량 리포트' },
    { key: 'tenants',           label: '고객사 관리' },
    { key: 'templates',         label: '양식 템플릿' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">관리</h1>
        <p className="text-gray-500 text-sm mt-1">고객사 프로필, 품목마스터, 사용량을 관리합니다</p>
      </div>
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'customer-profiles' && <CustomerProfilesTab />}
      {tab === 'item-master'       && <ItemMasterTab />}
      {tab === 'usage'             && <UsageTab />}
      {tab === 'tenants'           && <TenantsTab />}
      {tab === 'templates'         && <TemplatesTab />}
    </div>
  )
}
