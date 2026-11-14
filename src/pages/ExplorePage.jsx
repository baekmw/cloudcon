import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Calendar,
  MapPin,
  AlertCircle,
  Music,
  ChevronDown,
  CalendarDays,
  Map as MapIcon,
} from 'lucide-react'
import Poster from '../components/Poster.jsx'
import StatePill from '../components/StatePill.jsx'
import CalendarExplorer from '../components/CalendarExplorer.jsx'
import MapExplorer, {
  KOREA_REGIONS,
  matchConcertRegion,
} from '../components/MapExplorer.jsx'
import { Card, CardContent } from '../components/ui/card.jsx'
import { getConcerts } from '../lib/api.js'
import { formatPeriod } from '../lib/format.js'

const PAGE_SIZE = 20

function toYmdDot(date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate()
  ).padStart(2, '0')}`
}

function formatKoreanDateLabel(ymdDot) {
  if (!ymdDot) return ''
  const parts = ymdDot.split('.').map(Number)
  if (parts.length < 3) return ymdDot
  const [y, m, d] = parts
  const dateObj = new Date(y, m - 1, d)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  const w = weekdays[dateObj.getDay()]
  return `${y}년 ${m}월 ${d}일 (${w})`
}

function matchesState(concert, filter) {
  if (filter === 'all') return true
  return concert.state === filter
}

function sortConcertsStandard(list) {
  return [...list].sort((a, b) => {
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
}

function ConcertCardItem({ concert, isFading = false }) {
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
      {/* Poster */}
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
              {concert.programs.slice(0, 3).map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-baseline gap-1.5 text-[12px] min-w-0 whitespace-nowrap text-[#4e5968]"
                >
                  <span className="shrink-0 font-medium text-[#191f28]">
                    {item.composerShort || item.composerKo || item.composer}
                  </span>
                  <span className="shrink-0 text-[#8b95a1]">·</span>
                  <span className="truncate text-[#6b7684]">
                    {item.titleKo || item.title}
                  </span>
                </div>
              ))}
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

function SearchSkeletonCards() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex gap-4 p-4 rounded-2xl bg-white border border-[#e5e8eb] animate-pulse items-start"
        >
          <div className="w-20 sm:w-24 shrink-0 aspect-[3/4] rounded-xl bg-[#f2f4f6]" />
          <div className="flex flex-1 flex-col justify-between min-w-0 self-stretch py-0.5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-5 w-14 rounded-full bg-[#f2f4f6]" />
                <div className="h-4 w-12 rounded-md bg-[#f2f4f6]" />
              </div>
              <div className="h-5 w-4/5 rounded-md bg-[#e5e8eb]/80 mb-2" />
              <div className="h-4 w-1/2 rounded-md bg-[#e5e8eb]/50" />
            </div>
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

export default function ExplorePage() {
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') === 'map' ? 'map' : 'calendar'
  const state = params.get('state') || 'all'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const todayStr = useMemo(() => toYmdDot(new Date()), [])
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [selectedRegion, setSelectedRegion] = useState('all')
  const [selectedVenue, setSelectedVenue] = useState('')

  useEffect(() => {
    document.title = 'Cloudcon · 공연 모아보기'
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

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [mode, state, selectedDate, selectedRegion, selectedVenue])

  function handleSwitchMode(nextMode) {
    const next = { mode: nextMode }
    if (state !== 'all') next.state = state
    setParams(next, { replace: true })
  }

  function handleStateChange(nextState) {
    const next = { mode }
    if (nextState !== 'all') next.state = nextState
    setParams(next, { replace: true })
  }

  const concerts = data?.concerts || []

  const todayConcertCount = useMemo(() => {
    let count = 0
    for (const c of concerts) {
      const from = c.from || ''
      const to = c.to || from
      if (from && from <= todayStr && todayStr <= to) {
        count += 1
      }
    }
    return count
  }, [concerts, todayStr])

  const dateResults = useMemo(() => {
    if (!selectedDate) return []
    const filtered = concerts.filter((c) => {
      if (!matchesState(c, state)) return false
      const from = c.from || ''
      const to = c.to || from
      return from && from <= selectedDate && selectedDate <= to
    })
    return sortConcertsStandard(filtered)
  }, [concerts, selectedDate, state])

  const mapResults = useMemo(() => {
    const filtered = concerts.filter((c) => {
      if (!matchesState(c, state)) return false
      if (!matchConcertRegion(c.area, selectedRegion)) return false
      if (selectedVenue) {
        const v = String(c.venue || '').trim()
        const shortVenue = v.replace(/\s*\([^)]*\)\s*$/, '').trim() || v
        if (shortVenue !== selectedVenue && !v.includes(selectedVenue)) {
          return false
        }
      }
      return true
    })
    return sortConcertsStandard(filtered)
  }, [concerts, selectedRegion, selectedVenue, state])

  const activeList = mode === 'map' ? mapResults : dateResults

  const visibleConcerts = activeList.slice(0, visibleCount)
  const fadingConcert = activeList.length > visibleCount ? activeList[visibleCount] : null
  const hasMore = activeList.length > visibleCount
  const remainingCount = activeList.length - visibleCount

  const selectedRegionLabel = useMemo(() => {
    if (selectedRegion === 'all') return '전국 전체'
    const found = KOREA_REGIONS.find((r) => r.id === selectedRegion)
    return found ? found.names[0] : selectedRegion
  }, [selectedRegion])

  return (
    <main className="mx-auto max-w-[840px] px-6 py-10 md:py-12 flex flex-col items-center">
      {/* 상단 타이틀 & 직관적인 모드 전환 탭 카드 */}
      <div className="w-full max-w-[800px] mb-7">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#191f28] tracking-tight">
            공연 모아보기
          </h1>
          <p className="mt-1.5 text-[14px] sm:text-[15px] text-[#6b7684]">
            달력에서 원하는 날짜의 공연을 찾거나, 전국 지도에서 지역·공연장별 일정을 한눈에 확인해 보세요.
          </p>
        </div>

        {/* 일정별 / 장소별 전환 탭 */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={() => handleSwitchMode('calendar')}
            className={`group relative flex items-center justify-center gap-2 sm:gap-2.5 py-3 sm:py-3.5 px-3 sm:px-4 rounded-2xl border transition-all cursor-pointer ${
              mode === 'calendar'
                ? 'bg-[#e8f3ff]/75 border-[#3182f6] ring-2 ring-[#3182f6]/15 shadow-xs'
                : 'bg-white border-[#e5e8eb] hover:border-[#3182f6]/60 hover:bg-[#f8fbff]'
            }`}
          >
            <div
              className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                mode === 'calendar'
                  ? 'bg-[#3182f6] text-white shadow-xs'
                  : 'bg-[#f2f4f6] text-[#4e5968] group-hover:bg-[#e8f3ff] group-hover:text-[#3182f6]'
              }`}
            >
              <CalendarDays className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <span className="text-[14px] sm:text-[15px] font-bold text-[#191f28] whitespace-nowrap">
              일정별로 보기
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchMode('map')}
            className={`group relative flex items-center justify-center gap-2 sm:gap-2.5 py-3 sm:py-3.5 px-3 sm:px-4 rounded-2xl border transition-all cursor-pointer ${
              mode === 'map'
                ? 'bg-[#e8f3ff]/75 border-[#3182f6] ring-2 ring-[#3182f6]/15 shadow-xs'
                : 'bg-white border-[#e5e8eb] hover:border-[#3182f6]/60 hover:bg-[#f8fbff]'
            }`}
          >
            <div
              className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                mode === 'map'
                  ? 'bg-[#3182f6] text-white shadow-xs'
                  : 'bg-[#f2f4f6] text-[#4e5968] group-hover:bg-[#e8f3ff] group-hover:text-[#3182f6]'
              }`}
            >
              <MapIcon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <span className="text-[14px] sm:text-[15px] font-bold text-[#191f28] whitespace-nowrap">
              장소별로 보기
            </span>
          </button>
        </div>
      </div>

      {/* 본문 탐색기 영역 */}
      <section className="w-full max-w-[800px] animate-in fade-in duration-300">
        {mode === 'calendar' ? (
          <div className="mb-8">
            <CalendarExplorer
              concerts={concerts}
              selectedDate={selectedDate}
              onSelectDate={(dateStr) => setSelectedDate(dateStr)}
            />
          </div>
        ) : (
          <div className="mb-8">
            <MapExplorer
              concerts={concerts}
              selectedRegion={selectedRegion}
              selectedVenue={selectedVenue}
              onSelectRegion={(rid) => setSelectedRegion(rid)}
              onSelectVenue={(v) => setSelectedVenue(v)}
            />
          </div>
        )}

        {/* 선택된 조건의 공연 목록 헤더 & 상태 필터 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-[#f2f4f6]">
          <div>
            <h2 className="text-[17px] font-bold text-[#191f28] flex flex-wrap items-center gap-2 break-keep">
              {mode === 'calendar' ? (
                <span className="whitespace-nowrap">{formatKoreanDateLabel(selectedDate)} 공연 일정</span>
              ) : (
                <span className="break-keep">
                  {selectedRegionLabel}
                  {selectedVenue ? ` · ${selectedVenue}` : ''} 클래식 공연
                </span>
              )}
              <span className="text-[14px] font-normal text-[#8b95a1] whitespace-nowrap shrink-0">
                {activeList.length}건
              </span>
            </h2>
          </div>

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

        {/* 로딩 스켈레톤 */}
        {loading && <SearchSkeletonCards />}

        {/* 빈 결과 안내 */}
        {!loading && activeList.length === 0 && (
          <Card className="py-12 px-6 text-center border-dashed">
            <CardContent className="flex flex-col items-center p-0">
              <div className="h-12 w-12 rounded-2xl bg-[#f2f4f6] text-[#8b95a1] flex items-center justify-center mb-3">
                <AlertCircle className="h-6 w-6" />
              </div>
              {mode === 'calendar' ? (
                <>
                  <h3 className="text-[17px] font-bold text-[#191f28]">
                    선택한 날짜에 예정된 공연이 없어요
                  </h3>
                  <p className="mt-1 text-[14px] text-[#8b95a1] max-w-sm">
                    달력에서 공연 건수가 표시된 다른 날짜를 클릭해 보세요.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-[17px] font-bold text-[#191f28]">
                    선택한 지역·공연장에 해당하는 공연이 없어요
                  </h3>
                  <p className="mt-1 text-[14px] text-[#8b95a1] max-w-sm">
                    지도에서 다른 지역을 선택하거나 전국 전체 보기로 전환해 보세요.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* 공연 카드 리스트 */}
        <div className="space-y-3">
          {visibleConcerts.map((concert) => (
            <ConcertCardItem key={concert.id} concert={concert} />
          ))}
        </div>

        {/* 페이드아웃 미리보기 카드 */}
        {fadingConcert && (
          <div className="relative mt-3 select-none pointer-events-none overflow-hidden rounded-2xl">
            <div
              style={{
                maskImage:
                  'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 45%, rgba(0,0,0,0) 85%)',
                WebkitMaskImage:
                  'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 45%, rgba(0,0,0,0) 85%)',
              }}
            >
              <ConcertCardItem concert={fadingConcert} isFading />
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-white" />
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
              전체 {activeList.length}건 중 {visibleCount}건 표시 중
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
