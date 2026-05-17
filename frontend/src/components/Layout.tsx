import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const navItems = [
  { to: '/',               label: '대시보드',     icon: '📊', exact: true },
  { to: '/orders/upload',  label: '발주서 업로드', icon: '📤' },
  { to: '/production',     label: '생산의뢰서',   icon: '🏭' },
  { to: '/shipment',       label: '선적서류',     icon: '🚢' },
]

function NavLinks({ role, onClose }: { role?: string; onClose?: () => void }) {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-brand-50 text-brand-700'
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    }`

  return (
    <nav className="flex-1 py-4 space-y-0.5 px-2">
      {navItems.map(({ to, label, icon, exact }) => (
        <NavLink key={to} to={to} end={exact} className={linkClass} onClick={onClose}>
          <span>{icon}</span>
          {label}
        </NavLink>
      ))}
      {(role === 'admin' || role === 'superadmin') && (
        <NavLink to="/admin" className={linkClass} onClick={onClose}>
          <span>⚙️</span> 관리자
        </NavLink>
      )}
    </nav>
  )
}

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const sidebarContent = (
    <>
      <div className="px-6 py-5 border-b border-gray-100">
        <h1 className="text-base font-bold text-brand-700 leading-tight">발주 자동화</h1>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{user?.email}</p>
      </div>
      <NavLinks role={user?.role} onClose={() => setSidebarOpen(false)} />
      <div className="px-4 py-4 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="w-full text-left text-sm text-gray-500 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          로그아웃
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 모바일 오버레이 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 사이드바 — 데스크탑: 항상 표시 / 모바일: 슬라이드 */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-30 w-56 bg-white border-r border-gray-200 flex flex-col transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        {sidebarContent}
      </aside>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 모바일 상단 바 */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
            aria-label="메뉴 열기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-bold text-brand-700 text-sm">발주 자동화</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
