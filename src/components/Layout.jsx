import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Bell, Compass, Download, Menu, Search, Share, X } from 'lucide-react'
import { scanForNewConcerts, useAlerts } from '../lib/alerts.js'
import { Badge } from './ui/badge.jsx'

function TicketLogo({ className = 'h-5 w-5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4 5.5H20L14.5 12L20 18.5H4"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function NavItem({ to, children, end, onClick, mobile = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `relative flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors rounded-xl ${
          mobile
            ? 'w-full px-3 py-2 text-[13.5px]'
            : 'px-3 py-1.5 text-[13.5px]'
        } ${
          isActive
            ? mobile
              ? 'text-[#3182f6] bg-[#3182f6]/12 font-semibold'
              : 'text-[#3182f6] bg-[#e8f3ff] font-semibold'
            : mobile
              ? 'text-[#191f28] font-medium hover:bg-black/5'
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
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isIosInstallable, setIsIosInstallable] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const location = useLocation()

  // 페이지 이동 시 모바일 메뉴 자동 닫기
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname, location.search])

  // PWA 설치 프롬프트 및 iOS 홈 화면 추가 감지
  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    if (standalone) {
      setIsInstalled(true)
      return
    }

    const ua = window.navigator.userAgent || ''
    const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
    if (isIos) {
      setIsIosInstallable(true)
    }

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    const onAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
      setShowIosGuide(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const canInstallPwa = !isInstalled && (Boolean(deferredPrompt) || isIosInstallable)

  const handleInstallClick = async () => {
    setMobileMenuOpen(false)
    if (deferredPrompt) {
      deferredPrompt.prompt()
      try {
        const choice = await deferredPrompt.userChoice
        if (choice?.outcome === 'accepted') {
          setDeferredPrompt(null)
        }
      } catch {
        // ignore
      }
      return
    }
    if (isIosInstallable) {
      setShowIosGuide(true)
    }
  }

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
      <header className="sticky top-0 z-30 bg-[#f9fafb] border-b border-[#e5e8eb]/60">
        <div className="relative mx-auto flex max-w-[960px] items-center justify-between gap-4 px-5 sm:px-6 h-12 sm:h-13">
          <NavLink
            to="/"
            className="flex items-center gap-1.5 group shrink-0 whitespace-nowrap"
          >
            <div className="flex h-7 w-7 items-center justify-center bg-transparent text-[#3182f6] transition-transform group-hover:scale-105 shrink-0">
              <TicketLogo className="h-5 w-5" />
            </div>
            <span className="text-[16px] font-bold tracking-tight text-[#191f28]">
              cloudcon
            </span>
          </NavLink>

          {/* 데스크톱 네비게이션 */}
          <nav className="hidden sm:flex items-center gap-1 shrink-0">
            <NavItem to="/" end>
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span>검색 홈</span>
            </NavItem>
            <NavItem to="/explore">
              <Compass className="h-3.5 w-3.5 shrink-0" />
              <span>공연 모아보기</span>
            </NavItem>
            <NavItem to="/alerts">
              <Bell className="h-3.5 w-3.5 shrink-0" />
              <span>알림</span>
              {unread > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-1 h-4.5 px-1.5 text-[10.5px] font-bold rounded-full"
                >
                  {unread}
                </Badge>
              )}
            </NavItem>
            {canInstallPwa && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="ml-1.5 flex items-center gap-1.5 rounded-xl bg-[#191f28] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#333d4b] transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5 shrink-0" />
                <span>앱 설치</span>
              </button>
            )}
          </nav>

          {/* 모바일 햄버거 메뉴 버튼 */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="relative flex sm:hidden h-8.5 w-8.5 items-center justify-center rounded-xl text-[#191f28] hover:bg-[#f2f4f6] transition-colors cursor-pointer shrink-0"
            aria-label={mobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X className="h-4.5 w-4.5" />
            ) : (
              <Menu className="h-4.5 w-4.5" />
            )}
            {!mobileMenuOpen && unread > 0 && (
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#f04452]" />
            )}
          </button>

          {/* 모바일 플로팅 모달 셀렉트 메뉴 (레이아웃 밀림 없이 반투명 블러) */}
          {mobileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40 sm:hidden"
                onClick={() => setMobileMenuOpen(false)}
                aria-hidden="true"
              />
              <nav
                style={{
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                }}
                className="absolute right-4 top-[calc(100%+6px)] z-50 w-44 sm:hidden rounded-2xl bg-white/55 border border-white/75 ring-1 ring-[#191f28]/10 p-1.5 space-y-0.5 shadow-[0_10px_28px_rgba(25,31,40,0.14)] animate-in fade-in zoom-in-95 duration-150 origin-top-right"
              >
                <NavItem
                  to="/"
                  end
                  mobile
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Search className="h-3.5 w-3.5 shrink-0" />
                  <span>검색 홈</span>
                </NavItem>
                <NavItem
                  to="/explore"
                  mobile
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Compass className="h-3.5 w-3.5 shrink-0" />
                  <span>공연 모아보기</span>
                </NavItem>
                <NavItem
                  to="/alerts"
                  mobile
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Bell className="h-3.5 w-3.5 shrink-0" />
                  <span>알림</span>
                  {unread > 0 && (
                    <Badge
                      variant="destructive"
                      className="ml-auto h-4.5 px-1.5 text-[10.5px] font-bold rounded-full"
                    >
                      {unread}
                    </Badge>
                  )}
                </NavItem>
                {canInstallPwa && (
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13.5px] font-semibold text-[#3182f6] hover:bg-[#3182f6]/10 rounded-xl transition-colors cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5 shrink-0" />
                    <span>앱 설치하기</span>
                  </button>
                )}
              </nav>
            </>
          )}
        </div>
      </header>

      {showIosGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          onClick={() => setShowIosGuide(false)}
        >
          <div
            className="w-full max-w-[380px] rounded-2xl bg-white p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-[#e5e8eb] text-[#3182f6]">
                  <TicketLogo className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-[#191f28]">cloudcon 앱 설치</h3>
                  <p className="text-[12px] text-[#6b7684]">iPhone / iPad 홈 화면에 추가</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-[#8b95a1] hover:bg-[#f2f4f6] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-xl bg-[#f9fafb] p-4 space-y-2.5 text-[13px] text-[#333d4b] leading-relaxed">
              <p className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e8f3ff] text-[11px] font-bold text-[#3182f6]">1</span>
                <span>브라우저 하단의 <Share className="inline h-3.5 w-3.5 text-[#3182f6] mx-0.5" /> <strong>공유</strong> 버튼을 누르세요.</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e8f3ff] text-[11px] font-bold text-[#3182f6]">2</span>
                <span>메뉴에서 <strong>&lsquo;홈 화면에 추가&rsquo;</strong>를 선택하면 앱처럼 바로 실행할 수 있어요.</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="w-full rounded-xl bg-[#3182f6] py-3 text-[14px] font-semibold text-white hover:bg-[#1b64da] transition-colors cursor-pointer"
            >
              확인
            </button>
          </div>
        </div>
      )}

      <div className="flex-1">
        <Outlet />
      </div>

      <footer className="mt-auto border-t border-[#f2f4f6] bg-white py-8">
        <div className="mx-auto max-w-[960px] px-6 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[12px] text-[#8b95a1]">
            <p className="font-medium text-[#6b7684]">
              © {new Date().getFullYear()} cloudcon. All rights reserved.
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
