import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Bell, Compass, Menu, Music2, Search, X } from 'lucide-react'
import { scanForNewConcerts, useAlerts } from '../lib/alerts.js'
import { Badge } from './ui/badge.jsx'

function NavItem({ to, children, end, onClick, mobile = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `relative flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors rounded-xl ${
          mobile
            ? 'w-full px-4 py-3 text-[15px]'
            : 'px-3.5 py-2 text-[14px]'
        } ${
          isActive
            ? 'text-[#3182f6] bg-[#e8f3ff] font-semibold'
            : 'text-[#6b7684] font-medium hover:text-[#191f28] hover:bg-[#f2f4f6]'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

export default function Layout() {
  const alerts = useAlerts()
  const unread = alerts.inbox.filter((item) => !item.read).length
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()

  // 페이지 이동 시 모바일 메뉴 자동 닫기
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname, location.search])

  const todayFormatted = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}.${m}.${d}`
  }, [])

  useEffect(() => {
    const run = () => {
      scanForNewConcerts()
    }
    run()
    const timer = setInterval(run, 5 * 60 * 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#f9fafb] text-[#191f28] flex flex-col font-sans">
      <header className="sticky top-0 z-30 bg-[#f9fafb]/95 backdrop-blur-md border-b border-[#e5e8eb]/60">
        <div className="mx-auto flex max-w-[960px] items-center justify-between gap-4 px-6 h-16">
          <NavLink
            to="/"
            className="flex items-center gap-2 group shrink-0 whitespace-nowrap"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3182f6] text-white shadow-sm transition-transform group-hover:scale-105 shrink-0">
              <Music2 className="h-5 w-5" />
            </div>
            <span className="text-[17px] font-bold tracking-tight text-[#191f28]">
              Cloudcon
            </span>
          </NavLink>

          {/* 데스크톱 네비게이션 */}
          <nav className="hidden sm:flex items-center gap-1 shrink-0">
            <NavItem to="/" end>
              <Search className="h-4 w-4 shrink-0" />
              <span>검색 홈</span>
            </NavItem>
            <NavItem to="/explore">
              <Compass className="h-4 w-4 shrink-0" />
              <span>공연 모아보기</span>
            </NavItem>
            <NavItem to="/alerts">
              <Bell className="h-4 w-4 shrink-0" />
              <span>알림</span>
              {unread > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-1 h-5 px-1.5 text-[11px] font-bold rounded-full"
                >
                  {unread}
                </Badge>
              )}
            </NavItem>
          </nav>

          {/* 모바일 햄버거 메뉴 버튼 */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="relative flex sm:hidden h-10 w-10 items-center justify-center rounded-xl text-[#191f28] hover:bg-[#f2f4f6] transition-colors cursor-pointer shrink-0"
            aria-label={mobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
            {!mobileMenuOpen && unread > 0 && (
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[#f04452]" />
            )}
          </button>
        </div>

        {/* 모바일 드롭다운 세부 메뉴 */}
        {mobileMenuOpen && (
          <nav className="sm:hidden border-t border-[#e5e8eb]/70 bg-white/95 backdrop-blur-md px-4 py-3 space-y-1 shadow-[0_8px_20px_rgba(0,0,0,0.06)]">
            <NavItem
              to="/"
              end
              mobile
              onClick={() => setMobileMenuOpen(false)}
            >
              <Search className="h-4 w-4 shrink-0" />
              <span>검색 홈</span>
            </NavItem>
            <NavItem
              to="/explore"
              mobile
              onClick={() => setMobileMenuOpen(false)}
            >
              <Compass className="h-4 w-4 shrink-0" />
              <span>공연 모아보기</span>
            </NavItem>
            <NavItem
              to="/alerts"
              mobile
              onClick={() => setMobileMenuOpen(false)}
            >
              <Bell className="h-4 w-4 shrink-0" />
              <span>알림</span>
              {unread > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-auto h-5 px-1.5 text-[11px] font-bold rounded-full"
                >
                  {unread}
                </Badge>
              )}
            </NavItem>
          </nav>
        )}
      </header>

      <div className="flex-1">
        <Outlet />
      </div>

      <footer className="mt-auto border-t border-[#f2f4f6] bg-white py-8">
        <div className="mx-auto max-w-[960px] px-6 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[12px] text-[#8b95a1]">
            <p className="font-medium text-[#6b7684]">
              © {new Date().getFullYear()} Cloudcon. All rights reserved.
            </p>
            <p>출처: (재)예술경영지원센터 공연예술통합전산망(KOPIS)</p>
          </div>

          <div className="text-[11px] leading-relaxed text-[#b0b8c1] space-y-0.5 break-keep">
            <p className="flex flex-wrap gap-x-4 gap-y-0.5">
              <span className="whitespace-nowrap">· 집계기간 : 최종집계 {todayFormatted}</span>
              <span className="whitespace-nowrap">· 집계대상 : 모든 공연 데이터 전송기관</span>
            </p>
            <p>
              · 아래 집계 데이터는 공연예술통합전산망 연계기관의 티켓판매시스템에서 발권된 분량을 기준으로 제공하므로 해당 공연의 전체 관객 수와 차이가 있을 수 있습니다.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
