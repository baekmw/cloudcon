import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Bell, Music2 } from 'lucide-react'
import { scanForNewConcerts, useAlerts } from '../lib/alerts.js'
import { Badge } from './ui/badge.jsx'

function NavItem({ to, children, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex items-center gap-1.5 px-3.5 py-2 text-[14px] font-medium transition-colors rounded-xl ${
          isActive
            ? 'text-[#3182f6] bg-[#e8f3ff]'
            : 'text-[#6b7684] hover:text-[#191f28] hover:bg-[#f2f4f6]'
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
      <header className="sticky top-0 z-30 bg-[#f9fafb]/90 backdrop-blur-md border-b border-[#e5e8eb]/60">
        <div className="mx-auto flex max-w-[960px] items-center justify-between gap-4 px-6 h-16">
          <NavLink to="/" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3182f6] text-white shadow-sm transition-transform group-hover:scale-105">
              <Music2 className="h-5 w-5" />
            </div>
            <span className="text-[17px] font-bold tracking-tight text-[#191f28]">Cloudcon</span>
          </NavLink>
          <nav className="flex items-center gap-1">
            <NavItem to="/" end>홈</NavItem>
            <NavItem to="/alerts">
              <Bell className="h-4 w-4" />
              <span>알림</span>
              {unread > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[11px] font-bold rounded-full">
                  {unread}
                </Badge>
              )}
            </NavItem>
          </nav>
        </div>
      </header>

      <div className="flex-1">
        <Outlet />
      </div>

      <footer className="mt-auto border-t border-[#f2f4f6] bg-white py-10">
        <div className="mx-auto max-w-[960px] px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-[#8b95a1]">
          <p>
            공연예술통합전산망(KOPIS) 서양음악(클래식) Open API 연동
          </p>
          <p>
            Cloudcon · 토스 스타일 미니멀 클래식 공연 알림
          </p>
        </div>
      </footer>
    </div>
  )
}
