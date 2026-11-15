import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  Check,
  CheckCircle2,
  Database,
  Edit3,
  Lock,
  LogOut,
  Mail,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Users,
  X,
  Ticket,
} from 'lucide-react'
import {
  adminLogin,
  adminLogout,
  crawlNolUpcoming,
  deleteAdminSubscriber,
  getAdminCache,
  getAdminDashboard,
  getAdminSubscribers,
  getConcerts,
  reextractEmptyPrograms,
  runAdminBatch,
  toggleAdminSubscriberVerify,
  updateAdminCache,
} from '../lib/api.js'

export default function AdminPage() {
  const [authStatus, setAuthStatus] = useState('checking') // 'checking' | 'unauthenticated' | 'authenticated'
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const [dashboard, setDashboard] = useState(null)
  const [subscribers, setSubscribers] = useState([])
  const [cacheData, setCacheData] = useState({})
  const [concertsMap, setConcertsMap] = useState({})

  const [loadingData, setLoadingData] = useState(false)
  const [batchTriggering, setBatchTriggering] = useState(false)
  const [toast, setToast] = useState(null)

  const [activeTab, setActiveTab] = useState('logs') // 'logs' | 'subscribers' | 'cache'

  // Subscribers tab state
  const [subFilter, setSubFilter] = useState('')

  // Cache tab state
  const [cacheSearch, setCacheSearch] = useState('')
  const [selectedConcertId, setSelectedConcertId] = useState(null)
  const [editingPrograms, setEditingPrograms] = useState([])
  const [rawJsonMode, setRawJsonMode] = useState(false)
  const [rawJsonText, setRawJsonText] = useState('')
  const [savingCache, setSavingCache] = useState(false)
  const [onlyEmptyTitles, setOnlyEmptyTitles] = useState(false)
  const [reextracting, setReextracting] = useState(false)

  useEffect(() => {
    document.title = 'cloudcon · 관리자 대시보드'
  }, [])

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev))
    }, 3200)
  }, [])

  const fetchAllAdminData = useCallback(async (silent = false) => {
    if (!silent) setLoadingData(true)
    try {
      const [dashRes, subRes, cacheRes, concertsRes] = await Promise.all([
        getAdminDashboard(),
        getAdminSubscribers(),
        getAdminCache(),
        getConcerts().catch(() => ({ concerts: [] })),
      ])
      setDashboard(dashRes)
      setSubscribers(subRes?.subscribers || [])
      setCacheData(cacheRes?.cache || {})

      const map = {}
      for (const c of concertsRes?.concerts || []) {
        map[c.id] = c
      }
      setConcertsMap(map)
      setAuthStatus('authenticated')
    } catch (err) {
      if (err?.status === 401) {
        setAuthStatus('unauthenticated')
      } else {
        showToast(err?.message || '데이터를 불러오지 못했습니다.', 'error')
      }
    } finally {
      if (!silent) setLoadingData(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchAllAdminData()
  }, [fetchAllAdminData])

  // Poll dashboard while batch is running
  useEffect(() => {
    if (authStatus !== 'authenticated' || !dashboard?.isBatchRunning) return
    const timer = setInterval(() => {
      getAdminDashboard()
        .then((res) => {
          setDashboard(res)
          if (!res.isBatchRunning) {
            fetchAllAdminData(true)
            showToast('배치 작업이 완료되었습니다.', 'success')
          }
        })
        .catch(() => {})
    }, 3000)
    return () => clearInterval(timer)
  }, [authStatus, dashboard?.isBatchRunning, fetchAllAdminData, showToast])

  async function handleLoginSubmit(e) {
    e.preventDefault()
    if (!password.trim()) return
    setLoggingIn(true)
    setLoginError('')
    try {
      await adminLogin(password.trim())
      setPassword('')
      await fetchAllAdminData()
    } catch (err) {
      setLoginError(err?.message || '비밀번호가 일치하지 않습니다.')
    } finally {
      setLoggingIn(false)
    }
  }

  async function handleLogout() {
    try {
      await adminLogout()
    } catch {
      // ignore
    }
    setAuthStatus('unauthenticated')
    setDashboard(null)
  }

  async function handleRunBatch() {
    if (batchTriggering || dashboard?.isBatchRunning) return
    setBatchTriggering(true)
    try {
      const res = await runAdminBatch()
      showToast(res?.message || '배치 파이프라인 실행을 시작했습니다.', 'success')
      const updated = await getAdminDashboard()
      setDashboard(updated)
    } catch (err) {
      showToast(err?.message || '배치 실행에 실패했습니다.', 'error')
    } finally {
      setBatchTriggering(false)
    }
  }

  const [isCrawlingNol, setIsCrawlingNol] = useState(false)

  async function handleCrawlNol() {
    if (isCrawlingNol) return
    setIsCrawlingNol(true)
    try {
      const res = await crawlNolUpcoming()
      showToast(res?.message || '놀유니버스 클래식 티켓오픈 수집이 완료되었습니다.', 'success')
      const updated = await getAdminDashboard()
      setDashboard(updated)
    } catch (err) {
      showToast(err?.message || '놀유니버스 티켓오픈 수집에 실패했습니다.', 'error')
    } finally {
      setIsCrawlingNol(false)
    }
  }

  async function handleToggleVerify(email, currentVerified) {
    try {
      const res = await toggleAdminSubscriberVerify(email, !currentVerified)
      const nextVerified =
        typeof res?.verified === 'boolean'
          ? res.verified
          : typeof res?.subscriber?.verified === 'boolean'
            ? res.subscriber.verified
            : !currentVerified
      setSubscribers((prev) =>
        prev.map((s) => (s.email === email ? { ...s, verified: nextVerified } : s))
      )
      const dash = await getAdminDashboard()
      setDashboard(dash)
      showToast(
        `${email} 구독자를 ${nextVerified ? '인증 완료' : '미인증'} 상태로 변경했습니다.`,
        'success'
      )
    } catch (err) {
      showToast(err?.message || '상태 변경에 실패했습니다.', 'error')
    }
  }

  async function handleDeleteSubscriber(email) {
    if (!window.confirm(`정말 ${email} 구독자를 삭제하시겠습니까?`)) return
    try {
      await deleteAdminSubscriber(email)
      setSubscribers((prev) => prev.filter((s) => s.email !== email))
      const dash = await getAdminDashboard()
      setDashboard(dash)
      showToast(`${email} 구독자가 삭제되었습니다.`, 'success')
    } catch (err) {
      showToast(err?.message || '구독자 삭제에 실패했습니다.', 'error')
    }
  }

  const normalizeProgramList = useCallback((rawEntry) => {
    const programs = Array.isArray(rawEntry)
      ? rawEntry
      : Array.isArray(rawEntry?.programs)
        ? rawEntry.programs
        : []
    return programs.map((p, idx) => ({
      ...p,
      id: p.id || `ai-${idx + 1}`,
      composer: p.composer ?? '',
      composerKo: p.composerKo ?? '',
      composerShort: p.composerShort ?? '',
      title: p.title ?? '',
      titleKo: p.titleKo ?? '',
      genre: p.genre ?? '',
      movements: Array.isArray(p.movements) ? p.movements : [],
      duration: p.duration ?? '',
      searchingWord: p.searchingWord ?? '',
      source: p.source || 'ai_vision',
    }))
  }, [])

  // Select concert for cache editing
  const handleSelectCacheConcert = useCallback(
    (concertId, sourceCache = cacheData) => {
      setSelectedConcertId(concertId)
      const cloned = normalizeProgramList(sourceCache[concertId])
      setEditingPrograms(cloned)
      setRawJsonText(JSON.stringify(cloned, null, 2))
    },
    [cacheData, normalizeProgramList]
  )

  function handleProgramFieldChange(index, field, value) {
    setEditingPrograms((prev) => {
      const next = [...prev]
      if (field === 'movementsText') {
        const lines = value
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
        next[index] = { ...next[index], movements: lines }
      } else {
        next[index] = { ...next[index], [field]: value }
      }
      setRawJsonText(JSON.stringify(next, null, 2))
      return next
    })
  }

  function handleAddProgramRow() {
    setEditingPrograms((prev) => {
      const next = [
        ...prev,
        {
          id: `manual-${prev.length + 1}`,
          composer: '',
          composerKo: '',
          composerShort: '',
          title: '',
          titleKo: '',
          genre: '',
          movements: [],
          duration: '',
          searchingWord: '',
          source: 'admin_edited',
        },
      ]
      setRawJsonText(JSON.stringify(next, null, 2))
      return next
    })
  }

  function handleRemoveProgramRow(index) {
    setEditingPrograms((prev) => {
      const next = prev.filter((_, idx) => idx !== index)
      setRawJsonText(JSON.stringify(next, null, 2))
      return next
    })
  }

  async function handleSaveCache() {
    if (!selectedConcertId) return
    let programsToSave = editingPrograms
    if (rawJsonMode) {
      try {
        const parsed = JSON.parse(rawJsonText)
        if (!Array.isArray(parsed)) {
          showToast('JSON 최상위 구조는 배열([])이어야 합니다.', 'error')
          return
        }
        programsToSave = parsed
      } catch (err) {
        showToast(`JSON 문법 오류: ${err.message}`, 'error')
        return
      }
    }

    setSavingCache(true)
    try {
      const res = await updateAdminCache(selectedConcertId, programsToSave)
      const savedPrograms = Array.isArray(res?.programs)
        ? res.programs
        : Array.isArray(res?.entry?.programs)
          ? res.entry.programs
          : programsToSave
      setCacheData((prev) => ({
        ...prev,
        [selectedConcertId]: savedPrograms,
      }))
      const normalized = normalizeProgramList(savedPrograms)
      setEditingPrograms(normalized)
      setRawJsonText(JSON.stringify(normalized, null, 2))
      showToast(`${selectedConcertId} 프로그램 캐시가 저장되었습니다.`, 'success')
    } catch (err) {
      showToast(err?.message || '캐시 저장에 실패했습니다.', 'error')
    } finally {
      setSavingCache(false)
    }
  }

  async function handleTriggerReextract() {
    if (reextracting) return
    if (
      !window.confirm(
        '곡명이 비어있는("") 공연들을 대상으로 모든 세부 이미지를 모아 Gemini AI 재분석을 진행하시겠습니까? (15 RPM 한도 준수)'
      )
    ) {
      return
    }

    setReextracting(true)
    try {
      const res = await reextractEmptyPrograms()
      showToast(
        res?.message || '곡명 누락 공연 재분석을 백그라운드에서 시작했습니다.',
        'success'
      )
    } catch (err) {
      showToast(err?.message || '재분석 요청에 실패했습니다.', 'error')
    } finally {
      setTimeout(() => setReextracting(false), 5000)
    }
  }

  const filteredSubscribers = useMemo(() => {
    const q = subFilter.trim().toLowerCase()
    if (!q) return subscribers
    return subscribers.filter(
      (s) =>
        s.email.toLowerCase().includes(q) ||
        (s.keywords || []).some((k) => k.toLowerCase().includes(q))
    )
  }, [subscribers, subFilter])

  const cacheEntriesList = useMemo(() => {
    const entries = Object.entries(cacheData).map(([concertId, item]) => {
      const concert = concertsMap[concertId]
      const programs = Array.isArray(item)
        ? item
        : Array.isArray(item?.programs)
          ? item.programs
          : []
      const hasEmptyTitle =
        programs.length === 0 ||
        programs.some(
          (p) =>
            (!p.title || String(p.title).trim().length === 0) &&
            (!p.titleKo || String(p.titleKo).trim().length === 0)
        )

      return {
        concertId,
        title: concert?.title || `(KOPIS ID: ${concertId})`,
        venue: concert?.venue || '',
        period: concert ? `${concert.from || ''} ~ ${concert.to || ''}` : '',
        programs,
        from: concert?.from || '',
        hasEmptyTitle,
      }
    })
    entries.sort((a, b) => (b.from || '').localeCompare(a.from || ''))

    let filtered = entries
    if (onlyEmptyTitles) {
      filtered = filtered.filter((e) => e.hasEmptyTitle)
    }

    const q = cacheSearch.trim().toLowerCase()
    if (!q) return filtered
    return filtered.filter(
      (e) =>
        e.concertId.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.programs.some(
          (p) =>
            (p.composerKo || '').toLowerCase().includes(q) ||
            (p.composerShort || '').toLowerCase().includes(q) ||
            (p.composer || '').toLowerCase().includes(q) ||
            (p.titleKo || '').toLowerCase().includes(q) ||
            (p.title || '').toLowerCase().includes(q) ||
            (p.searchingWord || '').toLowerCase().includes(q)
        )
    )
  }, [cacheData, concertsMap, cacheSearch, onlyEmptyTitles])

  const totalEmptyTitlesCount = useMemo(() => {
    return Object.values(cacheData).filter((item) => {
      const programs = Array.isArray(item)
        ? item
        : Array.isArray(item?.programs)
          ? item.programs
          : []
      return (
        programs.length === 0 ||
        programs.some(
          (p) =>
            (!p.title || String(p.title).trim().length === 0) &&
            (!p.titleKo || String(p.titleKo).trim().length === 0)
        )
      )
    }).length
  }, [cacheData])

  // 캐시 탭 진입 시 아직 선택된 공연이 없으면 첫 번째 공연 자동 선택
  useEffect(() => {
    if (activeTab === 'cache' && !selectedConcertId && cacheEntriesList.length > 0) {
      handleSelectCacheConcert(cacheEntriesList[0].concertId)
    }
  }, [activeTab, selectedConcertId, cacheEntriesList, handleSelectCacheConcert])

  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center p-6">
        <div className="flex items-center gap-2.5 text-[14px] font-medium text-[#6b7684]">
          <RefreshCw className="h-4 w-4 animate-spin text-[#3182f6]" />
          <span>관리자 인증 확인 중...</span>
        </div>
      </div>
    )
  }

  if (authStatus === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center px-5">
        <div className="w-full max-w-[380px] rounded-2xl bg-white border border-[#e5e8eb] p-6 sm:p-7 shadow-[0_8px_30px_rgba(25,31,40,0.06)]">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f3ff] text-[#3182f6]">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-[#191f28]">cloudcon 관리자</h1>
              <p className="text-[12.5px] text-[#8b95a1]">관리자 비밀번호를 입력해 주세요</p>
            </div>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-3.5">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="관리자 비밀번호"
                autoFocus
                className="w-full h-11 rounded-xl border border-[#e5e8eb] bg-[#f9fafb] px-3.5 text-[14px] text-[#191f28] placeholder:text-[#b0b8c1] focus:outline-none focus:border-[#3182f6] focus:bg-white transition-colors"
              />
            </div>

            {loginError && (
              <div className="flex items-center gap-1.5 text-[12.5px] text-[#f04452] font-medium">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn || !password.trim()}
              className="w-full h-11 rounded-xl bg-[#3182f6] text-white text-[14px] font-semibold hover:bg-[#1b64da] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loggingIn ? '확인 중...' : '로그인'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const isRunning = Boolean(dashboard?.isBatchRunning || batchTriggering)
  const todaySent = dashboard?.emails?.todaySent ?? dashboard?.todayEmailSent ?? 0
  const dailyLimit = dashboard?.emails?.dailyLimit ?? dashboard?.dailyEmailLimit ?? 100
  const emailRatio = Math.min(100, Math.round((todaySent / dailyLimit) * 100))

  return (
    <div className="min-h-screen bg-[#f9fafb] text-[#191f28] pb-16">
      {/* Top Admin Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-[#e5e8eb]">
        <div className="mx-auto max-w-[1080px] px-5 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Link
              to="/"
              className="flex items-center gap-1.5 text-[16px] font-bold text-[#191f28] hover:text-[#3182f6] transition-colors"
            >
              <img
                src="/logos/logo-stroke-transparent.svg"
                alt="cloudcon"
                className="h-6 w-6 object-contain"
              />
              <span>cloudcon</span>
            </Link>
            <span className="rounded-md bg-[#e8f3ff] px-2 py-0.5 text-[11px] font-bold text-[#3182f6]">
              ADMIN
            </span>
            {dashboard?.today && (
              <span className="hidden sm:inline text-[12px] text-[#8b95a1] ml-1">
                기준일(KST): {dashboard.today}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchAllAdminData()}
              disabled={loadingData}
              className="flex items-center gap-1.5 rounded-xl border border-[#e5e8eb] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#4e5968] hover:bg-[#f2f4f6] transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin text-[#3182f6]' : ''}`} />
              <span>새로고침</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-xl border border-[#e5e8eb] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#6b7684] hover:text-[#f04452] hover:bg-[#fff0f1] hover:border-[#f04452]/30 transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      {/* Toast message */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl bg-[#191f28] px-4 py-3 text-[13px] font-medium text-white shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {toast.type === 'error' ? (
            <AlertCircle className="h-4 w-4 text-[#f04452] shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-[#3182f6] shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      <main className="mx-auto max-w-[1080px] px-5 sm:px-6 pt-6 space-y-6">
        {/* 1) 상단 핵심 지표 카드 4개 */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 카드 1: 오늘 방문자(UV) */}
          <div className="rounded-2xl bg-white border border-[#e5e8eb] p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#6b7684] mb-2">
              <span className="text-[13px] font-semibold">오늘 방문자 (UV)</span>
              <Users className="h-4 w-4 text-[#3182f6]" />
            </div>
            <div>
              <div className="text-[28px] font-extrabold text-[#191f28] leading-tight">
                {(dashboard?.visitors?.todayUv ?? dashboard?.todayVisitors ?? 0).toLocaleString()}
                <span className="text-[14px] font-semibold text-[#8b95a1] ml-1">명</span>
              </div>
              <p className="text-[12px] text-[#8b95a1] mt-1">
                최근 30일 누적 UV:{' '}
                <strong className="text-[#4e5968]">
                  {(dashboard?.visitors?.cumulativeUv ?? dashboard?.totalVisitors ?? 0).toLocaleString()}명
                </strong>
              </p>
            </div>
          </div>

          {/* 카드 2: 인증 구독자 수 */}
          <div className="rounded-2xl bg-white border border-[#e5e8eb] p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#6b7684] mb-2">
              <span className="text-[13px] font-semibold">인증 구독자 수</span>
              <ShieldCheck className="h-4 w-4 text-[#3182f6]" />
            </div>
            <div>
              <div className="text-[28px] font-extrabold text-[#191f28] leading-tight">
                {(dashboard?.subscribers?.verified ?? dashboard?.verifiedSubscribers ?? 0).toLocaleString()}
                <span className="text-[14px] font-semibold text-[#8b95a1] ml-1">명</span>
              </div>
              <p className="text-[12px] text-[#8b95a1] mt-1">
                전체 등록 구독자:{' '}
                <strong className="text-[#4e5968]">
                  {(dashboard?.subscribers?.total ?? dashboard?.totalSubscribers ?? 0).toLocaleString()}명
                </strong>
              </p>
            </div>
          </div>

          {/* 카드 3: 오늘 메일 발송량 (N / 100) */}
          <div className="rounded-2xl bg-white border border-[#e5e8eb] p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#6b7684] mb-2">
              <span className="text-[13px] font-semibold">오늘 메일 발송량</span>
              <Mail className="h-4 w-4 text-[#3182f6]" />
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[28px] font-extrabold text-[#191f28] leading-tight">
                  {todaySent}
                </span>
                <span className="text-[15px] font-semibold text-[#8b95a1]">
                  / {dailyLimit}통
                </span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-[#f2f4f6] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    emailRatio >= 90 ? 'bg-[#f04452]' : 'bg-[#3182f6]'
                  }`}
                  style={{ width: `${emailRatio}%` }}
                />
              </div>
            </div>
          </div>

          {/* 카드 4: 배치 즉시 실행 버튼 */}
          <div className="rounded-2xl bg-white border border-[#e5e8eb] p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#6b7684] mb-2">
              <span className="text-[13px] font-semibold">수동 배치 파이프라인</span>
              <Activity className="h-4 w-4 text-[#3182f6]" />
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleRunBatch}
                disabled={isRunning}
                className="w-full h-10 rounded-xl bg-[#3182f6] hover:bg-[#1b64da] disabled:bg-[#8b95a1] text-white text-[13px] font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>배치 실행 중...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    <span>배치 즉시 실행</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleCrawlNol}
                disabled={isCrawlingNol}
                className="w-full h-9 rounded-xl border border-[#3182f6] bg-white hover:bg-[#e8f3ff] disabled:bg-[#f2f4f6] text-[#3182f6] text-[12.5px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {isCrawlingNol ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>놀유니버스 티켓오픈 수집 중...</span>
                  </>
                ) : (
                  <>
                    <Ticket className="h-3.5 w-3.5" />
                    <span>놀유니버스 티켓오픈 즉시 수집</span>
                  </>
                )}
              </button>
              <p className="text-[11px] text-[#8b95a1] text-center">
                놀유니버스 티켓오픈 + KOPIS 수집 + AI 추출 + 알림
              </p>
            </div>
          </div>
        </section>

        {/* 2) 2단 랭킹 보드 */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 인기 검색어 Top 10 */}
          <div className="rounded-2xl bg-white border border-[#e5e8eb] p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#3182f6]" />
                <h2 className="text-[15px] font-bold text-[#191f28]">인기 검색어 Top 10</h2>
              </div>
              <span className="text-[11.5px] text-[#8b95a1]">누적 검색 횟수 기준</span>
            </div>

            {dashboard?.topSearches?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#f2f4f6] text-[12px] text-[#8b95a1]">
                      <th className="py-2 w-12 font-semibold">순위</th>
                      <th className="py-2 font-semibold">검색어</th>
                      <th className="py-2 text-right font-semibold">검색 수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f2f4f6] text-[13.5px]">
                    {dashboard.topSearches.map((item, idx) => (
                      <tr key={item.keyword} className="hover:bg-[#f9fafb]">
                        <td className="py-2.5 font-bold text-[#3182f6]">{idx + 1}</td>
                        <td className="py-2.5 font-medium text-[#191f28]">{item.keyword}</td>
                        <td className="py-2.5 text-right font-semibold text-[#4e5968]">
                          {item.count.toLocaleString()}회
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-10 text-center text-[13px] text-[#8b95a1]">
                아직 집계된 검색어 데이터가 없습니다.
              </div>
            )}
          </div>

          {/* 가장 많이 등록된 알림 키워드 Top 10 */}
          <div className="rounded-2xl bg-white border border-[#e5e8eb] p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#3182f6]" />
                <h2 className="text-[15px] font-bold text-[#191f28]">
                  가장 많이 등록된 알림 키워드 Top 10
                </h2>
              </div>
              <span className="text-[11.5px] text-[#8b95a1]">구독자 전체 합산</span>
            </div>

            {dashboard?.topSubscriberKeywords?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#f2f4f6] text-[12px] text-[#8b95a1]">
                      <th className="py-2 w-12 font-semibold">순위</th>
                      <th className="py-2 font-semibold">알림 키워드</th>
                      <th className="py-2 text-right font-semibold">등록 수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f2f4f6] text-[13.5px]">
                    {dashboard.topSubscriberKeywords.map((item, idx) => (
                      <tr key={item.keyword} className="hover:bg-[#f9fafb]">
                        <td className="py-2.5 font-bold text-[#3182f6]">{idx + 1}</td>
                        <td className="py-2.5 font-medium text-[#191f28]">{item.keyword}</td>
                        <td className="py-2.5 text-right font-semibold text-[#4e5968]">
                          {item.count.toLocaleString()}명
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-10 text-center text-[13px] text-[#8b95a1]">
                아직 등록된 알림 키워드가 없습니다.
              </div>
            )}
          </div>
        </section>

        {/* 3) 탭 전환 영역: [배치 실행 로그] / [구독자 관리] / [공연 AI 캐시 수정] */}
        <section className="rounded-2xl bg-white border border-[#e5e8eb] overflow-hidden">
          <div className="flex border-b border-[#e5e8eb] bg-[#f9fafb] px-4 pt-3 gap-2 overflow-x-auto">
            {[
              { id: 'logs', label: `배치 실행 로그 (${dashboard?.batchLogs?.length || 0})` },
              { id: 'subscribers', label: `구독자 관리 (${subscribers.length})` },
              {
                id: 'cache',
                label: `공연 AI 캐시 수정 (${Object.keys(cacheData).length})`,
              },
            ].map((tab) => {
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-[13.5px] font-bold rounded-t-xl border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'border-[#3182f6] text-[#3182f6] bg-white'
                      : 'border-transparent text-[#6b7684] hover:text-[#191f28]'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          <div className="p-5">
            {/* 탭 1: 배치 실행 로그 */}
            {activeTab === 'logs' && (
              <div>
                {dashboard?.batchLogs?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#e5e8eb] text-[12px] text-[#8b95a1]">
                          <th className="py-2.5 px-3 font-semibold whitespace-nowrap">실행 시각 (KST)</th>
                          <th className="py-2.5 px-3 font-semibold whitespace-nowrap">상태</th>
                          <th className="py-2.5 px-3 font-semibold whitespace-nowrap">신규 공연</th>
                          <th className="py-2.5 px-3 font-semibold whitespace-nowrap">발송 메일</th>
                          <th className="py-2.5 px-3 font-semibold">메시지</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f2f4f6] text-[13px]">
                        {dashboard.batchLogs.map((log, idx) => (
                          <tr key={`${log.timestamp}-${idx}`} className="hover:bg-[#f9fafb]">
                            <td className="py-3 px-3 font-mono text-[12px] text-[#4e5968] whitespace-nowrap">
                              {log.timestamp}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                  log.status === 'success'
                                    ? 'bg-[#e8f3ff] text-[#3182f6]'
                                    : 'bg-[#fff0f1] text-[#f04452]'
                                }`}
                              >
                                {log.status === 'success' ? '성공' : '오류'}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-semibold text-[#191f28] whitespace-nowrap">
                              {log.newConcerts ?? 0}건
                            </td>
                            <td className="py-3 px-3 font-semibold text-[#191f28] whitespace-nowrap">
                              {log.matchedEmails ?? 0}통
                            </td>
                            <td className="py-3 px-3 text-[#4e5968] break-all">{log.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center text-[13.5px] text-[#8b95a1]">
                    아직 기록된 배치 실행 로그가 없습니다. 상단의 [배치 즉시 실행] 버튼을 눌러 테스트해보세요.
                  </div>
                )}
              </div>
            )}

            {/* 탭 2: 구독자 관리 */}
            {activeTab === 'subscribers' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-[360px]">
                    <Search className="h-4 w-4 text-[#8b95a1] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={subFilter}
                      onChange={(e) => setSubFilter(e.target.value)}
                      placeholder="이메일 또는 키워드 검색..."
                      className="w-full h-10 rounded-xl border border-[#e5e8eb] bg-[#f9fafb] pl-9 pr-3 text-[13px] focus:outline-none focus:border-[#3182f6] focus:bg-white"
                    />
                  </div>
                  <span className="text-[12.5px] text-[#6b7684]">
                    총 <strong>{filteredSubscribers.length}</strong>명 조회됨
                  </span>
                </div>

                {filteredSubscribers.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#e5e8eb] text-[12px] text-[#8b95a1]">
                          <th className="py-2.5 px-3 font-semibold">이메일</th>
                          <th className="py-2.5 px-3 font-semibold whitespace-nowrap">인증 상태</th>
                          <th className="py-2.5 px-3 font-semibold">등록 키워드</th>
                          <th className="py-2.5 px-3 font-semibold whitespace-nowrap">발송 이력</th>
                          <th className="py-2.5 px-3 text-right font-semibold whitespace-nowrap">
                            관리
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f2f4f6] text-[13px]">
                        {filteredSubscribers.map((sub) => (
                          <tr key={sub.email} className="hover:bg-[#f9fafb]">
                            <td className="py-3 px-3 font-medium text-[#191f28] break-all">
                              {sub.email}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                  sub.verified
                                    ? 'bg-[#e8f3ff] text-[#3182f6]'
                                    : 'bg-[#f2f4f6] text-[#6b7684]'
                                }`}
                              >
                                {sub.verified ? '인증됨' : '미인증'}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex flex-wrap gap-1">
                                {(sub.keywords || []).length > 0 ? (
                                  sub.keywords.map((kw) => (
                                    <span
                                      key={kw}
                                      className="rounded-md bg-[#f2f4f6] px-2 py-0.5 text-[11.5px] font-medium text-[#333d4b]"
                                    >
                                      {kw}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[12px] text-[#b0b8c1]">키워드 없음</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-[#6b7684] whitespace-nowrap">
                              <span className="font-semibold text-[#191f28]">
                                {sub.totalEmailsSent ?? sub.notifiedCount ?? (sub.notifiedConcerts || []).length ?? 0}통
                              </span>
                              {sub.verificationCount > 0 && (
                                <span className="ml-1 text-[11px] text-[#8b95a1]" title="로그인/인증 링크 메일 발송 건수">
                                  (인증 {sub.verificationCount})
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleToggleVerify(sub.email, sub.verified)}
                                  className="rounded-lg border border-[#e5e8eb] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#333d4b] hover:bg-[#f2f4f6] transition-colors cursor-pointer"
                                >
                                  {sub.verified ? '인증 해제' : '강제 인증'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSubscriber(sub.email)}
                                  className="rounded-lg border border-[#f04452]/30 bg-[#fff0f1] p-1.5 text-[#f04452] hover:bg-[#f04452] hover:text-white transition-colors cursor-pointer"
                                  title="구독자 삭제"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center text-[13.5px] text-[#8b95a1]">
                    조건에 맞는 구독자가 없습니다.
                  </div>
                )}
              </div>
            )}

            {/* 탭 3: 공연 AI 캐시 수정 */}
            {activeTab === 'cache' && (
              <div className="space-y-4">
                {/* 상단 액션 바: 곡명 누락 공연 재분석 (15 RPM 준수) 및 필터 */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#f9fafb] border border-[#e5e8eb]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOnlyEmptyTitles((prev) => !prev)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-bold border transition-colors cursor-pointer ${
                        onlyEmptyTitles
                          ? 'bg-[#f04452] text-white border-[#f04452]'
                          : 'bg-white text-[#4e5968] border-[#e5e8eb] hover:bg-[#f2f4f6]'
                      }`}
                    >
                      <span>곡명("") 누락 공연만 보기</span>
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[11px] ${
                          onlyEmptyTitles
                            ? 'bg-white/20 text-white'
                            : 'bg-[#f04452]/10 text-[#f04452]'
                        }`}
                      >
                        {totalEmptyTitlesCount}건
                      </span>
                    </button>
                    {onlyEmptyTitles && (
                      <span className="text-[12px] text-[#8b95a1]">
                        전체 {cacheEntriesList.length}건 표시 중
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleTriggerReextract}
                    disabled={reextracting || totalEmptyTitlesCount === 0}
                    className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#3182f6] hover:bg-[#1b64da] disabled:bg-[#8b95a1] text-white text-[12.5px] font-bold transition-colors cursor-pointer whitespace-nowrap shadow-xs"
                  >
                    {reextracting ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>다중 이미지 재분석 요청 중...</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>제목 누락 {totalEmptyTitlesCount}건 전체 재분석 (15 RPM 준수)</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  {/* 좌측: 캐시된 공연 목록 */}
                  <div className="lg:col-span-5 space-y-3">
                    <div className="relative">
                      <Search className="h-4 w-4 text-[#8b95a1] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={cacheSearch}
                        onChange={(e) => setCacheSearch(e.target.value)}
                        placeholder="공연명, KOPIS ID, 작곡가, 곡명 검색..."
                        className="w-full h-10 rounded-xl border border-[#e5e8eb] bg-[#f9fafb] pl-9 pr-3 text-[13px] focus:outline-none focus:border-[#3182f6] focus:bg-white"
                      />
                    </div>

                    <div className="max-h-[540px] overflow-y-auto divide-y divide-[#f2f4f6] rounded-xl border border-[#e5e8eb]">
                      {cacheEntriesList.length > 0 ? (
                        cacheEntriesList.map((entry) => {
                          const isSelected = selectedConcertId === entry.concertId
                          return (
                            <button
                              key={entry.concertId}
                              type="button"
                              onClick={() => handleSelectCacheConcert(entry.concertId)}
                              className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                                isSelected ? 'bg-[#e8f3ff]/70' : 'hover:bg-[#f9fafb]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[11px] font-bold text-[#3182f6] bg-[#e8f3ff] px-2 py-0.5 rounded">
                                    {entry.concertId}
                                  </span>
                                  {entry.hasEmptyTitle && (
                                    <span className="rounded bg-[#fff0f1] px-1.5 py-0.5 text-[10.5px] font-bold text-[#f04452]">
                                      곡명("") 누락
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11.5px] font-semibold text-[#6b7684]">
                                  추출 곡: {entry.programs.length}개
                                </span>
                              </div>
                              <p className="text-[13.5px] font-bold text-[#191f28] line-clamp-1">
                                {entry.title}
                              </p>
                              {entry.venue && (
                                <p className="text-[11.5px] text-[#8b95a1] mt-0.5 truncate">
                                  {entry.venue} · {entry.period}
                                </p>
                              )}
                            </button>
                          )
                        })
                      ) : (
                        <div className="p-8 text-center text-[13px] text-[#8b95a1]">
                          검색된 AI 캐시 항목이 없습니다.
                        </div>
                      )}
                    </div>
                  </div>

                {/* 우측: 선택된 공연 프로그램 수정 에디터 */}
                <div className="lg:col-span-7">
                  {selectedConcertId ? (
                    <div className="rounded-xl border border-[#e5e8eb] p-4 sm:p-5 space-y-4 bg-[#f9fafb]/50">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e5e8eb] pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] font-bold text-[#3182f6]">
                              {selectedConcertId}
                            </span>
                            <Link
                              to={`/concerts/${selectedConcertId}`}
                              target="_blank"
                              className="text-[12px] text-[#6b7684] underline hover:text-[#3182f6]"
                            >
                              상세페이지 열기 ↗
                            </Link>
                          </div>
                          <h3 className="text-[15px] font-bold text-[#191f28] mt-0.5">
                            {concertsMap[selectedConcertId]?.title || selectedConcertId}
                          </h3>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (!rawJsonMode) {
                                setRawJsonText(JSON.stringify(editingPrograms, null, 2))
                                setRawJsonMode(true)
                              } else {
                                try {
                                  const parsed = JSON.parse(rawJsonText)
                                  if (!Array.isArray(parsed)) {
                                    showToast('JSON 최상위 구조는 배열([])이어야 합니다.', 'error')
                                    return
                                  }
                                  setEditingPrograms(normalizeProgramList(parsed))
                                  setRawJsonMode(false)
                                } catch (err) {
                                  showToast(`JSON 문법 오류: ${err.message}`, 'error')
                                }
                              }
                            }}
                            className="rounded-xl border border-[#e5e8eb] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#4e5968] hover:bg-[#f2f4f6] cursor-pointer"
                          >
                            {rawJsonMode ? '폼 모드로 보기' : 'JSON 직접 편집'}
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveCache}
                            disabled={savingCache}
                            className="flex items-center gap-1.5 rounded-xl bg-[#3182f6] px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-[#1b64da] disabled:opacity-50 cursor-pointer"
                          >
                            <Save className="h-3.5 w-3.5" />
                            <span>{savingCache ? '저장 중...' : '변경사항 저장'}</span>
                          </button>
                        </div>
                      </div>

                      {rawJsonMode ? (
                        <div>
                          <textarea
                            value={rawJsonText}
                            onChange={(e) => setRawJsonText(e.target.value)}
                            rows={18}
                            className="w-full rounded-xl border border-[#e5e8eb] bg-white p-3.5 font-mono text-[12.5px] text-[#191f28] focus:outline-none focus:border-[#3182f6]"
                          />
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                          {editingPrograms.map((prog, idx) => (
                            <div
                              key={prog.id || idx}
                              className="rounded-xl bg-white border border-[#e5e8eb] p-3.5 space-y-2.5"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-[12px] font-bold text-[#3182f6]">
                                    프로그램 #{idx + 1}
                                  </span>
                                  {prog.id && (
                                    <span className="font-mono text-[11px] text-[#8b95a1]">
                                      ({prog.id})
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveProgramRow(idx)}
                                  className="text-[12px] text-[#f04452] hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span>삭제</span>
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-[11px] font-semibold text-[#8b95a1] mb-1">
                                    작곡가 약칭 (composerShort)
                                  </label>
                                  <input
                                    type="text"
                                    value={prog.composerShort || ''}
                                    onChange={(e) =>
                                      handleProgramFieldChange(idx, 'composerShort', e.target.value)
                                    }
                                    placeholder="예: 베토벤"
                                    className="w-full h-9 rounded-lg border border-[#e5e8eb] px-2.5 text-[12.5px] focus:outline-none focus:border-[#3182f6]"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-[#8b95a1] mb-1">
                                    작곡가 한글명 (composerKo)
                                  </label>
                                  <input
                                    type="text"
                                    value={prog.composerKo || ''}
                                    onChange={(e) =>
                                      handleProgramFieldChange(idx, 'composerKo', e.target.value)
                                    }
                                    placeholder="예: 루트비히 판 베토벤"
                                    className="w-full h-9 rounded-lg border border-[#e5e8eb] px-2.5 text-[12.5px] focus:outline-none focus:border-[#3182f6]"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-[#8b95a1] mb-1">
                                    작곡가 원문 (composer)
                                  </label>
                                  <input
                                    type="text"
                                    value={prog.composer || ''}
                                    onChange={(e) =>
                                      handleProgramFieldChange(idx, 'composer', e.target.value)
                                    }
                                    placeholder="예: Ludwig van Beethoven"
                                    className="w-full h-9 rounded-lg border border-[#e5e8eb] px-2.5 text-[12.5px] focus:outline-none focus:border-[#3182f6]"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[11px] font-semibold text-[#8b95a1] mb-1">
                                    곡명 한글 (titleKo)
                                  </label>
                                  <input
                                    type="text"
                                    value={prog.titleKo || ''}
                                    onChange={(e) =>
                                      handleProgramFieldChange(idx, 'titleKo', e.target.value)
                                    }
                                    placeholder="예: 피아노 협주곡 제5번 내림마장조 '황제'"
                                    className="w-full h-9 rounded-lg border border-[#e5e8eb] px-2.5 text-[12.5px] focus:outline-none focus:border-[#3182f6]"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-[#8b95a1] mb-1">
                                    곡명 원문 (title)
                                  </label>
                                  <input
                                    type="text"
                                    value={prog.title || ''}
                                    onChange={(e) =>
                                      handleProgramFieldChange(idx, 'title', e.target.value)
                                    }
                                    placeholder="예: Piano Concerto No. 5 in E-flat major, Op. 73"
                                    className="w-full h-9 rounded-lg border border-[#e5e8eb] px-2.5 text-[12.5px] focus:outline-none focus:border-[#3182f6]"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="sm:col-span-1">
                                  <label className="block text-[11px] font-semibold text-[#8b95a1] mb-1">
                                    장르 (genre)
                                  </label>
                                  <input
                                    type="text"
                                    value={prog.genre || ''}
                                    onChange={(e) =>
                                      handleProgramFieldChange(idx, 'genre', e.target.value)
                                    }
                                    placeholder="예: 피아노 협주곡"
                                    className="w-full h-9 rounded-lg border border-[#e5e8eb] px-2.5 text-[12.5px] focus:outline-none focus:border-[#3182f6]"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="block text-[11px] font-semibold text-[#8b95a1] mb-1">
                                    검색 키워드 / 별칭 (searchingWord)
                                  </label>
                                  <input
                                    type="text"
                                    value={prog.searchingWord || ''}
                                    onChange={(e) =>
                                      handleProgramFieldChange(idx, 'searchingWord', e.target.value)
                                    }
                                    placeholder="예: 황제 베토벤5 피협5번"
                                    className="w-full h-9 rounded-lg border border-[#e5e8eb] px-2.5 text-[12.5px] focus:outline-none focus:border-[#3182f6]"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-[#8b95a1] mb-1">
                                  악장 목록 (movements · 줄바꿈으로 구분)
                                </label>
                                <textarea
                                  rows={2}
                                  value={
                                    Array.isArray(prog.movements) ? prog.movements.join('\n') : ''
                                  }
                                  onChange={(e) =>
                                    handleProgramFieldChange(idx, 'movementsText', e.target.value)
                                  }
                                  placeholder="I. Allegro&#10;II. Adagio un poco mosso"
                                  className="w-full rounded-lg border border-[#e5e8eb] px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-[#3182f6]"
                                />
                              </div>
                            </div>
                          ))}

                          <button
                            type="button"
                            onClick={handleAddProgramRow}
                            className="w-full py-2.5 rounded-xl border border-dashed border-[#3182f6] text-[#3182f6] text-[13px] font-semibold hover:bg-[#e8f3ff]/40 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Plus className="h-4 w-4" />
                            <span>프로그램 곡 추가</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-full min-h-[320px] rounded-xl border border-dashed border-[#e5e8eb] flex flex-col items-center justify-center p-8 text-center text-[#8b95a1]">
                      <Database className="h-8 w-8 mb-2 text-[#b0b8c1]" />
                      <p className="text-[14px] font-semibold text-[#4e5968]">
                        왼쪽 목록에서 수정할 공연을 선택하세요
                      </p>
                      <p className="text-[12.5px] mt-1">
                        AI가 추출한 프로그램 곡 정보를 수동으로 편집하거나 추가·삭제할 수 있습니다.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  </div>
)
}
