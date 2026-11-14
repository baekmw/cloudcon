import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search,
  X,
  Bell,
  ChevronRight,
  ChevronDown,
  Calendar,
  MapPin,
  AlertCircle,
  Check,
  Music,
  Compass,
} from 'lucide-react'
import Poster from '../components/Poster.jsx'
import StatePill from '../components/StatePill.jsx'
import { Button } from '../components/ui/button.jsx'
import { Card, CardContent } from '../components/ui/card.jsx'
import { getConcerts, addMyKeyword } from '../lib/api.js'
import { useAlerts } from '../lib/alerts.js'
import { formatPeriod } from '../lib/format.js'
import { matchConcertClassical } from '../lib/classical.js'

const PAGE_SIZE = 20

const POPULAR_KEYWORDS = [
  '베9',
  '조성진',
  '임윤찬',
  '라피협2',
  '차피협',
  '예술의전당',
  '신세계',
  '사계',
]

function matchesState(concert, filter) {
  if (filter === 'all') return true
  return concert.state === filter
}

function ConcertCardItem({ concert, q, isFading = false }) {
  return (
    <Link
      to={`/concerts/${concert.id}`}
      tabIndex={isFading ? -1 : 0}
      aria-hidden={isFading ? 'true' : undefined}
      className={`group flex gap-4 p-4 rounded-2xl bg-white border border-[#e5e8eb] transition-all items-start ${
        isFading
          ? 'pointer-events-none'
          : 'hover:border-[#3182f6] hover:shadow-[0_4px_16px_rgba(49,130,246,0.08)] cursor-pointer'
      }`}
    >
      {/* Poster: Fixed aspect ratio, strictly aligned to top-left */}
      <div className="w-20 sm:w-24 shrink-0 aspect-[3/4] overflow-hidden rounded-xl bg-[#f2f4f6] self-start relative">
        <Poster
          src={concert.poster}
          title={concert.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col justify-between min-w-0 self-stretch">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <StatePill state={concert.state} />
            <span className="text-[12px] text-[#8b95a1] whitespace-nowrap shrink-0">
              {concert.genre || '클래식'}
            </span>
            {concert.matchReason && (
              <span className="text-[11px] font-medium text-[#3182f6] bg-[#e8f3ff] px-2 py-0.5 rounded-md truncate max-w-[200px] sm:max-w-[240px] whitespace-nowrap">
                {concert.matchReason}
              </span>
            )}
          </div>
          <h3 className="text-[16px] sm:text-[17px] font-bold text-[#191f28] group-hover:text-[#3182f6] transition-colors line-clamp-2 leading-snug break-keep">
            {concert.title}
          </h3>
        </div>

        {/* Program List Preview on Card */}
        {Array.isArray(concert.programs) && concert.programs.length > 0 && (
          <div className="mt-2.5 rounded-xl bg-[#f8fafc] p-2.5 border border-[#edf2f7]">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#8b95a1] mb-1.5">
              <span className="flex items-center gap-1 text-[#3182f6] whitespace-nowrap">
                <Music className="h-3 w-3 shrink-0" />
                진행 프로그램 ({concert.programs.length}곡)
              </span>
            </div>
            <div className="space-y-1">
              {concert.programs.slice(0, 3).map((item, idx) => {
                const isMatched =
                  concert.matchedProgram?.id === item.id ||
                  (q &&
                    ((item.composerShort && item.composerShort.toLowerCase().includes(q.toLowerCase())) ||
                      (item.titleKo && item.titleKo.toLowerCase().includes(q.toLowerCase())) ||
                      (item.searchingWord && item.searchingWord.toLowerCase().includes(q.toLowerCase()))))
                return (
                  <div
                    key={idx}
                    className={`flex items-baseline gap-1.5 text-[12px] min-w-0 whitespace-nowrap ${
                      isMatched ? 'text-[#3182f6] font-semibold' : 'text-[#4e5968]'
                    }`}
                  >
                    <span className="shrink-0 font-medium text-[#191f28]">
                      {item.composerShort || item.composerKo || item.composer}
                    </span>
                    <span className="shrink-0 text-[#8b95a1]">·</span>
                    <span className="truncate text-[#6b7684]">
                      {item.titleKo || item.title}
                    </span>
                  </div>
                )
              })}
              {concert.programs.length > 3 && (
                <p className="text-[11px] text-[#8b95a1] pt-0.5 whitespace-nowrap">
                  외 {concert.programs.length - 3}곡 더보기...
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-[12px] sm:text-[13px] text-[#6b7684] min-w-0">
          <span className="flex items-center gap-1 min-w-0 whitespace-nowrap">
            <MapPin className="h-3.5 w-3.5 text-[#8b95a1] shrink-0" />
            <span className="truncate">{concert.venue} · {concert.area}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0 whitespace-nowrap">
            <Calendar className="h-3.5 w-3.5 text-[#8b95a1] shrink-0" />
            <span>{formatPeriod(concert.from, concert.to)}</span>
          </span>
        </div>
      </div>
    </Link>
  )
}

function CalmHeroHeading() {
  const phrases = useMemo(
    () => [
      '보고 싶던 모든 무대를 한곳에서',
      '기다린 연주 소식을 가장 먼저',
      '듣고 싶은 클래식을 직접 무대 위로',
    ],
    []
  )
  const [index, setIndex] = useState(0)
  const [isFading, setIsFading] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setIsFading(true)
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % phrases.length)
        setIsFading(false)
      }, 450)
    }, 4200)

    return () => clearInterval(timer)
  }, [phrases.length])

  return (
    <div className="min-h-[2.75rem] sm:min-h-[4rem] md:min-h-[4.5rem] py-1 flex items-center justify-center">
      <h1
        className={`text-[21px] sm:text-4xl md:text-5xl font-extrabold text-[#191f28] tracking-tight leading-snug whitespace-nowrap transition-all duration-500 ease-out ${
          isFading ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
        }`}
      >
        {phrases[index]}
      </h1>
    </div>
  )
}

function SearchSkeletonCards() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex gap-4 p-4 rounded-2xl bg-white border border-[#e5e8eb] animate-pulse items-start"
        >
          {/* Poster skeleton */}
          <div className="w-20 sm:w-24 shrink-0 aspect-[3/4] rounded-xl bg-[#f2f4f6]" />

          {/* Content skeleton */}
          <div className="flex flex-1 flex-col justify-between min-w-0 self-stretch py-0.5">
            <div>
              {/* Badge & tag skeleton */}
              <div className="flex items-center gap-2 mb-2">
                <div className="h-5 w-14 rounded-full bg-[#f2f4f6]" />
                <div className="h-4 w-12 rounded-md bg-[#f2f4f6]" />
              </div>
              {/* Title lines skeleton */}
              <div className="h-5 w-4/5 rounded-md bg-[#e5e8eb]/80 mb-2" />
              <div className="h-4 w-1/2 rounded-md bg-[#e5e8eb]/50" />
            </div>

            {/* Program box skeleton */}
            <div className="mt-3 rounded-xl bg-[#f8fafc] p-2.5 border border-[#edf2f7] space-y-1.5">
              <div className="h-3 w-28 rounded bg-[#e5e8eb]/70" />
              <div className="h-3.5 w-3/4 rounded bg-[#e5e8eb]/50" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const state = params.get('state') || 'all'
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [inputValue, setInputValue] = useState(q)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const [registeredKeys, setRegisteredKeys] = useState(() => new Set())
  const [justAddedTarget, setJustAddedTarget] = useState(null)
  const [rollingIndex, setRollingIndex] = useState(0)
  const [isRolling, setIsRolling] = useState(false)
  const alerts = useAlerts()

  // 검색란 내부 추천 키워드 아래로 내려가는 롤링 애니메이션
  useEffect(() => {
    const timer = setInterval(() => {
      setIsRolling(true)
      setTimeout(() => {
        setRollingIndex((prev) => (prev + 1) % POPULAR_KEYWORDS.length)
        setIsRolling(false)
      }, 380)
    }, 2600)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    document.title = 'Cloudcon · 클래식 공연 검색'
  }, [])

  useEffect(() => {
    let cancelled = false
    getConcerts()
      .then((response) => {
        if (!cancelled) setData(response)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Sync url param with input
  useEffect(() => {
    setInputValue(q)
  }, [q])

  // Reset pagination when search query or filter changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [q, state])

  function handleSearch(searchQuery) {
    const trimmed = searchQuery.trim()
    setInputValue(searchQuery)
    if (trimmed) {
      setParams({ q: trimmed, state }, { replace: true })
    } else {
      setParams({}, { replace: true })
    }
  }

  function handleClear() {
    setInputValue('')
    setParams({}, { replace: true })
  }

  function handleStateChange(newState) {
    if (q) {
      setParams({ q, state: newState }, { replace: true })
    }
  }

  async function handleCreateAlert(keyword) {
    const target = (keyword || inputValue || q).trim()
    if (!target) return
    try {
      await addMyKeyword(target)
      setRegisteredKeys((prev) => new Set([...prev, target.toLowerCase()]))
      setJustAddedTarget(target.toLowerCase())
    } catch (err) {
      if (err.status === 401) {
        navigate(`/alerts?q=${encodeURIComponent(target)}`)
      }
    }
  }

  const concerts = data?.concerts || []

  // Classical fuzzy, abbreviation & full-DB search matching
  const searchResults = useMemo(() => {
    const needle = q.trim()
    if (!needle) return []

    const matches = []
    for (const concert of concerts) {
      if (!matchesState(concert, state)) continue
      const matchResult = matchConcertClassical(concert, needle, concert.programs)
      if (matchResult.matched) {
        matches.push({
          ...concert,
          matchScore: matchResult.score,
          matchReason: matchResult.reason,
          matchedProgram: matchResult.matchedProgram,
        })
      }
    }

    return matches.sort((a, b) => {
      const isCompA = a.state === '공연완료' ? 1 : 0
      const isCompB = b.state === '공연완료' ? 1 : 0
      if (isCompA !== isCompB) {
        return isCompA - isCompB
      }

      if (isCompA === 1) {
        return (b.to || b.from || '').localeCompare(a.to || a.from || '')
      }

      const rankA = a.state === '공연중' ? 0 : 1
      const rankB = b.state === '공연중' ? 0 : 1
      if (rankA !== rankB) {
        return rankA - rankB
      }

      const fromCompare = (a.from || '').localeCompare(b.from || '')
      if (fromCompare !== 0) return fromCompare

      return (a.title || '').localeCompare(b.title || '', 'ko')
    })
  }, [concerts, q, state])

  const hasSearch = Boolean(q.trim())
  const targetClean = q.trim().toLowerCase()

  const isTargetRegistered = useMemo(() => {
    if (!targetClean) return false
    return (
      registeredKeys.has(targetClean) ||
      alerts.watches.some((w) => w.query.trim().toLowerCase() === targetClean)
    )
  }, [targetClean, registeredKeys, alerts.watches])

  const wasJustAdded = justAddedTarget === targetClean

  // Pagination slices
  const visibleConcerts = searchResults.slice(0, visibleCount)
  const fadingConcert = searchResults.length > visibleCount ? searchResults[visibleCount] : null
  const hasMore = searchResults.length > visibleCount
  const remainingCount = searchResults.length - visibleCount

  return (
    <main className="mx-auto max-w-[800px] px-6 py-12 md:py-20 flex flex-col items-center">
      {/* Toss style Hero & Search Area */}
      <div className={`w-full flex flex-col items-center transition-all duration-300 ${hasSearch ? 'mb-8' : 'my-auto py-8 sm:py-12'}`}>
        {!hasSearch && (
          <div className="text-center mb-8 sm:mb-10 animate-in fade-in duration-500">
            <CalmHeroHeading />
            <p className="mt-3 sm:mt-4 text-[13.5px] sm:text-[16px] text-[#6b7684] font-normal leading-relaxed max-w-[540px] mx-auto break-keep">
              아티스트, 연주곡, 공연장 어디든 편하게 입력해 보세요.<br /> 관련된 모든 클래식 무대를 빠짐없이 찾아드릴게요.
            </p>
          </div>
        )}

        {/* Minimal Toss-style Search Bar */}
        <div className="w-full max-w-[640px]">
          <div className="relative group">
            <div className="pointer-events-none absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-[#8b95a1] group-focus-within:text-[#3182f6] transition-colors z-10">
              <Search className="h-5 w-5" />
            </div>

            {/* 입력값이 비어있을 때 아래로 내려가며 차례로 표시되는 추천 검색어 플레이스홀더 */}
            {!inputValue && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-11 sm:left-13 right-22 sm:right-24 top-0 bottom-0 flex items-center overflow-hidden"
              >
                <div className="relative h-6 w-full overflow-hidden">
                  {/* 들어오는 다음 키워드 (위에서 중앙으로 내려옴) */}
                  <span
                    className={`absolute inset-0 flex items-center text-[15px] sm:text-[17px] text-[#8b95a1] whitespace-nowrap truncate ${
                      isRolling
                        ? 'transition-all duration-380 ease-out translate-y-0 opacity-100'
                        : '-translate-y-6 opacity-0'
                    }`}
                  >
                    {POPULAR_KEYWORDS[(rollingIndex + 1) % POPULAR_KEYWORDS.length]}
                  </span>
                  {/* 현재 키워드 (중앙에서 아래로 내려가며 사라짐) */}
                  <span
                    className={`absolute inset-0 flex items-center text-[15px] sm:text-[17px] text-[#8b95a1] whitespace-nowrap truncate ${
                      isRolling
                        ? 'transition-all duration-380 ease-out translate-y-6 opacity-0'
                        : 'translate-y-0 opacity-100'
                    }`}
                  >
                    {POPULAR_KEYWORDS[rollingIndex]}
                  </span>
                </div>
              </div>
            )}

            <input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value)
                if (!e.target.value.trim() && q) {
                  setParams({}, { replace: true })
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch(inputValue.trim() ? inputValue : POPULAR_KEYWORDS[rollingIndex])
                }
              }}
              placeholder=""
              aria-label="공연, 아티스트, 연주곡 검색"
              className="w-full h-14 sm:h-15 rounded-2xl bg-white border border-[#e5e8eb] pl-11 sm:pl-13 pr-22 sm:pr-24 text-[15px] sm:text-[17px] text-[#191f28] placeholder-[#8b95a1] shadow-[0_2px_8px_rgba(0,0,0,0.04)] focus:outline-none focus:border-[#3182f6] focus:ring-4 focus:ring-[#3182f6]/10 transition-all"
            />
            <div className="absolute right-3 sm:right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {inputValue && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1.5 rounded-full text-[#8b95a1] hover:text-[#191f28] hover:bg-[#f2f4f6] transition-colors cursor-pointer shrink-0"
                  aria-label="검색어 지우기"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <Button
                size="sm"
                onClick={() =>
                  handleSearch(inputValue.trim() ? inputValue : POPULAR_KEYWORDS[rollingIndex])
                }
                className="rounded-xl px-3.5 h-10 font-semibold whitespace-nowrap shrink-0"
              >
                검색
              </Button>
            </div>
          </div>

          {/* 비검색 시 하단 바로가기 카드 (공연 모아보기 & 공연 알림 받기) */}
          {!hasSearch && (
            <div className="mt-10 sm:mt-12 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              <Link
                to="/explore"
                className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl bg-white border border-[#e5e8eb] shadow-xs text-[14px] text-[#4e5968] hover:text-[#191f28] hover:border-[#3182f6] transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-xl bg-[#e8f3ff] text-[#3182f6] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Compass className="h-4.5 w-4.5" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="font-bold text-[#191f28] whitespace-nowrap">공연 모아보기</p>
                    <p className="text-[12px] text-[#8b95a1] truncate">
                      달력(일정별) · 전국 지도(장소별)로 탐색
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-[#8b95a1] shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              <Link
                to="/alerts"
                className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl bg-white border border-[#e5e8eb] shadow-xs text-[14px] text-[#4e5968] hover:text-[#191f28] hover:border-[#3182f6] transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-xl bg-[#e8f3ff] text-[#3182f6] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Bell className="h-4.5 w-4.5" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="font-bold text-[#191f28] whitespace-nowrap">공연 알림 받기</p>
                    <p className="text-[12px] text-[#8b95a1] truncate">
                      좋아하는 연주자 새 일정 가장 먼저 받기
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-[#8b95a1] shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Search Results Section (Only visible when searched) */}
      {hasSearch && (
        <section className="w-full max-w-[760px] animate-in fade-in duration-300">
          {/* Result Header & State Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-[#f2f4f6]">
            <div>
              <h2 className="text-[17px] font-bold text-[#191f28] break-keep">
                '{q}' 검색 결과
                <span className="ml-2 text-[14px] font-normal text-[#8b95a1] whitespace-nowrap">
                  {searchResults.length}건
                </span>
              </h2>
            </div>

            {/* Filter Pills: 전체, 공연중, 공연예정, 공연완료 */}
            <div className="flex items-center gap-1 bg-[#f2f4f6] p-1 rounded-xl self-start sm:self-auto">
              {[
                ['all', '전체'],
                ['공연중', '공연중'],
                ['공연예정', '공연예정'],
                ['공연완료', '공연완료'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleStateChange(key)}
                  className={`px-3 py-1 text-[13px] font-semibold rounded-lg whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    state === key
                      ? 'bg-white text-[#191f28] shadow-sm'
                      : 'text-[#6b7684] hover:text-[#191f28]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Loading Skeletons */}
          {loading && <SearchSkeletonCards />}

          {/* Empty State with Toss style Alert Prompt */}
          {!loading && searchResults.length === 0 && (
            <Card className="py-12 px-6 text-center border-dashed">
              <CardContent className="flex flex-col items-center p-0">
                <div className="h-12 w-12 rounded-2xl bg-[#f2f4f6] text-[#8b95a1] flex items-center justify-center mb-3">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <h3 className="text-[17px] font-bold text-[#191f28]">검색 결과가 없어요</h3>
                <p className="mt-1 text-[14px] text-[#8b95a1] max-w-sm">
                  '{q}'에 대한 공연이 아직 등록되지 않았을 수 있습니다. 알림을 신청해두시면 등록 즉시 알려드려요!
                </p>

                <Button
                  onClick={() => handleCreateAlert(q)}
                  disabled={isTargetRegistered}
                  className={`mt-5 rounded-xl font-semibold gap-2 transition-all ${
                    isTargetRegistered
                      ? 'bg-[#e8faf3] text-[#03b26c] border border-[#03b26c]/30 hover:bg-[#e8faf3] cursor-default'
                      : 'bg-[#3182f6] text-white hover:bg-[#1b64da]'
                  }`}
                >
                  {isTargetRegistered ? (
                    <>
                      <Check className="h-4 w-4 text-[#03b26c]" />
                      '{q}' {wasJustAdded ? '알림 등록 완료!' : '이미 알림 등록됨'}
                    </>
                  ) : (
                    <>
                      <Bell className="h-4 w-4" />
                      '{q}' 새 공연 알림 받기
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Results List: 20건 표시 */}
          <div className="space-y-3">
            {visibleConcerts.map((concert) => (
              <ConcertCardItem key={concert.id} concert={concert} q={q} />
            ))}
          </div>

          {/* 그 다음 1건: 완전 흰색이 아닌 반투명 블러 페이드아웃으로 내용물이 은은하게 보이도록 처리 */}
          {fadingConcert && (
            <div className="relative mt-3 select-none pointer-events-none overflow-hidden rounded-2xl">
              <div
                style={{
                  maskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.06) 95%)',
                  WebkitMaskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.06) 95%)',
                }}
              >
                <ConcertCardItem concert={fadingConcert} q={q} isFading />
              </div>
              <div
                style={{
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                  maskImage:
                    'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.75) 40%, black 100%)',
                  WebkitMaskImage:
                    'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.75) 40%, black 100%)',
                }}
                className="absolute inset-0 bg-gradient-to-b from-transparent via-[#f9fafb]/65 to-[#f9fafb]/92"
              />
            </div>
          )}

          {/* 더보기 버튼 */}
          {hasMore && (
            <div className="mt-5 flex flex-col items-center">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-[#8b95a1] hover:text-[#4e5968] transition-colors cursor-pointer py-1.5 px-3"
              >
                <span>더보기 ({Math.min(PAGE_SIZE, remainingCount)}건 더보기)</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <p className="mt-1 text-[12px] text-[#8b95a1]/80">
                전체 {searchResults.length}건 중 {visibleCount}건 표시 중
              </p>
            </div>
          )}

          {/* Quick noti CTA sticky at bottom of search results:
              하단 페이드의 흰색 농도와 블러를 강화하고 스티키 카드의 불투명도·블러를 높여 하단 영역을 확실히 차단 */}
          {searchResults.length > 0 && (
            <div className="sticky bottom-0 z-20 mt-5 -mx-6 px-6 pt-4 pb-14 sm:pb-5 pointer-events-none relative">
              <div
                aria-hidden="true"
                style={{
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                  maskImage:
                    'linear-gradient(to top, black 0%, black 65%, rgba(0,0,0,0.45) 86%, transparent 100%)',
                  WebkitMaskImage:
                    'linear-gradient(to top, black 0%, black 65%, rgba(0,0,0,0.45) 86%, transparent 100%)',
                }}
                className="absolute inset-x-0 top-0 -bottom-10 bg-[linear-gradient(to_top,rgba(249,250,251,0.95)_0%,rgba(249,250,251,0.86)_48%,rgba(249,250,251,0.55)_78%,rgba(249,250,251,0)_100%)] pointer-events-none"
              />
              <div
                style={{
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                }}
                className="relative z-10 pointer-events-auto px-4 py-3.5 rounded-2xl bg-white/85 border border-[#e5e8eb]/90 shadow-[0_6px_24px_rgba(25,31,40,0.08)] flex flex-row items-center justify-between gap-3 transition-all"
              >
                <div className="text-[13px] sm:text-[14px] text-[#333d4b] leading-snug break-keep text-left min-w-0 flex-1">
                  <span className="font-bold text-[#191f28]">'{q}'</span> 관련 새 공연이 올라오면 알림을 받을까요?
                </div>
                <Button
                  variant={isTargetRegistered ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => handleCreateAlert(q)}
                  disabled={isTargetRegistered}
                  className={`rounded-xl font-semibold gap-1.5 shrink-0 whitespace-nowrap transition-all ${
                    isTargetRegistered
                      ? 'bg-[#e8faf3]/90 text-[#03b26c] border-[#03b26c]/30 hover:bg-[#e8faf3] cursor-default'
                      : 'bg-[#3182f6] text-white hover:bg-[#1b64da]'
                  }`}
                >
                  {isTargetRegistered ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#03b26c] shrink-0" />
                      <span>{wasJustAdded ? '알림 등록 완료' : '이미 알림 등록됨'}</span>
                    </>
                  ) : (
                    <>
                      <Bell className="h-3.5 w-3.5 shrink-0" />
                      <span>알림 받기</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
