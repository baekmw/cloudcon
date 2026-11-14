import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Bell, Compass, Download, Menu, Search, Share, X } from 'lucide-react'
import { scanForNewConcerts, useAlerts } from '../lib/alerts.js'
import { Badge } from './ui/badge.jsx'

function TicketLogo({ className = 'h-6 w-6', withText = false, whiteBg = false }) {
  const src = withText
    ? whiteBg
      ? '/logos/logo-text-white.svg'
      : '/logos/logo-text-transparent.svg'
    : whiteBg
      ? '/logos/logo-notext-white.svg'
      : '/logos/logo-notext-transparent.svg'

  return (
    <img
      src={src}
      alt="cloudcon"
      className={`${className} object-contain select-none`}
      draggable={false}
    />
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
              ? 'text-[var(--theme-white)] bg-[var(--theme-dark)] font-semibold'
              : 'text-[var(--theme-white)] bg-[var(--theme-dark)] font-semibold'
            : mobile
              ? 'text-[var(--theme-dark)] font-medium hover:bg-black/5'
              : 'text-[var(--text-secondary)] font-medium hover:text-[var(--theme-dark)] hover:bg-[var(--bg-subtle)]'
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
    <div className="min-h-screen bg-[var(--theme-white)] text-[var(--theme-dark)] flex flex-col font-sans">
      <header className="sticky top-0 z-30 bg-[var(--theme-white)] border-b border-[var(--theme-light)]/75">
        <div className="relative mx-auto flex max-w-[960px] items-center justify-between gap-4 px-5 sm:px-6 h-12 sm:h-13">
          <NavLink
            to="/"
            className="flex items-center gap-1.5 group shrink-0 whitespace-nowrap"
          >
            <div className="flex h-7 w-7 items-center justify-center bg-transparent transition-transform group-hover:scale-105 shrink-0">
              <TicketLogo className="h-6 w-6" withText={false} whiteBg={false} />
            </div>
            <span className="text-[16px] font-bold tracking-tight text-[var(--theme-dark)]">
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
                  variant="default"
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
                className="ml-1.5 flex items-center gap-1.5 rounded-xl border border-[var(--theme-dark)] bg-[var(--theme-white)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--theme-dark)] hover:bg-[var(--theme-dark)] hover:text-[var(--theme-white)] transition-colors cursor-pointer shrink-0 whitespace-nowrap"
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
            className="relative flex sm:hidden h-8.5 w-8.5 items-center justify-center rounded-xl text-[var(--theme-dark)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer shrink-0"
            aria-label={mobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X className="h-4.5 w-4.5" />
            ) : (
              <Menu className="h-4.5 w-4.5" />
            )}
            {!mobileMenuOpen && unread > 0 && (
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[var(--theme-dark)]" />
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
                className="absolute right-4 top-[calc(100%+6px)] z-50 w-44 sm:hidden rounded-2xl bg-white/65 border border-[var(--theme-light)] ring-1 ring-[#2b2b2b]/8 p-1.5 space-y-0.5 shadow-[0_10px_28px_rgba(43,43,43,0.14)] animate-in fade-in zoom-in-95 duration-150 origin-top-right"
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
                      variant="default"
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
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13.5px] font-semibold text-[var(--theme-dark)] hover:bg-black/5 rounded-xl transition-colors cursor-pointer"
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
            className="w-full max-w-[380px] rounded-2xl bg-[var(--theme-white)] p-6 shadow-xl border border-[var(--theme-light)] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--theme-white)] border border-[var(--theme-light)] overflow-hidden">
                  <TicketLogo className="h-9 w-9" withText={true} whiteBg={true} />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-[var(--theme-dark)]">cloudcon 앱 설치</h3>
                  <p className="text-[12px] text-[var(--theme-mid)]">iPhone / iPad 홈 화면에 추가</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--theme-mid)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-xl bg-[var(--bg-subtle)] p-4 space-y-2.5 text-[13px] text-[var(--theme-dark)] leading-relaxed">
              <p className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--theme-dark)] text-[11px] font-bold text-[var(--theme-white)]">1</span>
                <span>브라우저 하단의 <Share className="inline h-3.5 w-3.5 text-[var(--theme-dark)] mx-0.5" /> <strong>공유</strong> 버튼을 누르세요.</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--theme-dark)] text-[11px] font-bold text-[var(--theme-white)]">2</span>
                <span>메뉴에서 <strong>&lsquo;홈 화면에 추가&rsquo;</strong>를 선택하면 앱처럼 바로 실행할 수 있어요.</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="w-full rounded-xl bg-[var(--theme-dark)] py-3 text-[14px] font-semibold text-[var(--theme-white)] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
            >
              확인
            </button>
          </div>
        </div>
      )}

      <div className="flex-1">
        <Outlet />
      </div>

      <footer className="mt-auto border-t border-[var(--theme-light)]/75 bg-[var(--theme-white)] py-8">
        <div className="mx-auto max-w-[960px] px-6 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[12px] text-[var(--theme-mid)]">
            <p className="font-medium text-[var(--text-secondary)]">
              © {new Date().getFullYear()} cloudcon. All rights reserved.
            </p>
            <p>출처: (재)예술경영지원센터 공연예술통합전산망(KOPIS)</p>
          </div>

          <div className="text-[11px] leading-relaxed text-[var(--theme-mid)] space-y-0.5 break-keep">
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
