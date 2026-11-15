import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Ticket,
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
  ChevronRight,
  Bell,
  Search,
  AlertCircle,
  Sparkles,
} from 'lucide-react'
import Poster from '../components/Poster.jsx'
import { getTicketOpens } from '../lib/api.js'

function formatKoreanDateTime(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const days = ['일', '월', '화', '수', '목', '금', '토']
    const dayName = days[d.getDay()]
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${yyyy}.${mm}.${dd}(${dayName}) ${hh}:${min}`
  } catch {
    return dateStr
  }
}

function DDayBadge({ dDay, isPast, isToday, isTomorrow, dDayLabel }) {
  if (isPast) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-bold bg-[#f2f4f6] text-[#8b95a1]">
        오픈 완료
      </span>
    )
  }

  if (isToday) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-bold bg-[#fff0f1] text-[#f04452] animate-pulse">
        {dDayLabel || '오늘 오픈'}
      </span>
    )
  }

  if (isTomorrow) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-bold bg-[#fff8eb] text-[#ff8a00]">
        {dDayLabel || '내일 오픈'}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-bold bg-[#e8f3ff] text-[#3182f6]">
      {dDayLabel || (typeof dDay === 'number' ? `D-${dDay}` : '오픈 예정')}
    </span>
  )
}

export default function TicketOpensPage() {
  const [ticketOpens, setTicketOpens] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterTab, setFilterTab] = useState('all') // 'all' | 'today_tomorrow' | 'this_week' | 'upcoming'
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getTicketOpens()
      .then((res) => {
        if (!cancelled) {
          setTicketOpens(res.ticketOpens || [])
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const filteredItems = useMemo(() => {
    let list = ticketOpens

    // 탭 필터링
    if (filterTab === 'today_tomorrow') {
      list = list.filter((item) => item.ticketOpen?.isToday || item.ticketOpen?.isTomorrow)
    } else if (filterTab === 'this_week') {
      list = list.filter(
        (item) =>
          typeof item.ticketOpen?.dDay === 'number' &&
          item.ticketOpen.dDay >= 0 &&
          item.ticketOpen.dDay <= 7
      )
    } else if (filterTab === 'upcoming') {
      list = list.filter((item) => !item.ticketOpen?.isPast)
    }

    // 검색어 필터링
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((item) => {
        const textPool = [
          item.title,
          item.venue,
          item.cast,
          item.subGenre,
          item.genre,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return textPool.includes(q)
      })
    }

    return list
  }, [ticketOpens, filterTab, searchQuery])

  return (
    <div className="mx-auto max-w-[840px] px-4 sm:px-6 py-8 md:py-12 animate-fade-up">
      {/* Page Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e8f3ff] text-[#3182f6] text-[12.5px] font-bold mb-3">
          <Ticket className="h-3.5 w-3.5" />
          <span>Cloudcon 주력 서비스</span>
        </div>
        <h1 className="text-[24px] sm:text-[28px] font-extrabold text-[#191f28] tracking-tight">
          티켓 오픈 일정
        </h1>
        <p className="mt-2 text-[14.5px] sm:text-[15.5px] text-[#6b7684] leading-relaxed break-keep">
          좋아하는 클래식 공연의 티켓 예매 오픈 시각을 놓치지 않도록 인터파크·NOL 단독 오픈 일정을 한곳에 모았습니다. 사전에 알림 키워드를 등록해 두시면 티켓 오픈 예정 시 이메일로 즉시 알려드려요.
        </p>
      </div>

      {/* Quick Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between mb-6 pb-4 border-b border-[#f2f4f6]">
        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-[#f2f4f6] p-1 rounded-xl overflow-x-auto no-scrollbar shrink-0">
          {[
            ['all', '전체 일정'],
            ['today_tomorrow', '오늘/내일 오픈'],
            ['this_week', '이번 주 오픈'],
            ['upcoming', '오픈 예정만'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterTab(key)}
              className={`px-3 py-1.5 text-[13px] font-semibold rounded-lg whitespace-nowrap transition-all cursor-pointer ${
                filterTab === key
                  ? 'bg-white text-[#191f28] shadow-xs'
                  : 'text-[#6b7684] hover:text-[#191f28]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search input inside ticket opens */}
        <div className="relative flex-1 sm:max-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8b95a1]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="공연명, 연주자, 공연장 검색"
            className="w-full h-9 pl-9 pr-3 text-[13px] rounded-xl bg-white border border-[#e5e8eb] placeholder-[#8b95a1] focus:outline-none focus:border-[#3182f6] focus:ring-2 focus:ring-[#3182f6]/10"
          />
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-4 py-8">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-5 rounded-2xl bg-white border border-[#e5e8eb] animate-pulse flex flex-col sm:flex-row gap-4"
            >
              <div className="w-24 h-32 rounded-xl bg-[#f2f4f6] shrink-0" />
              <div className="flex-1 space-y-3">
                <div className="h-5 bg-[#f2f4f6] rounded-md w-1/3" />
                <div className="h-6 bg-[#f2f4f6] rounded-md w-3/4" />
                <div className="h-4 bg-[#f2f4f6] rounded-md w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="py-12 text-center rounded-2xl bg-white border border-[#e5e8eb]">
          <AlertCircle className="h-8 w-8 text-[#f04452] mx-auto mb-2" />
          <p className="text-[15px] font-bold text-[#191f28]">
            티켓 오픈 일정을 불러오지 못했습니다.
          </p>
          <p className="text-[13px] text-[#8b95a1] mt-1">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredItems.length === 0 && (
        <div className="py-16 text-center rounded-2xl bg-white border border-dashed border-[#e5e8eb]">
          <Ticket className="h-10 w-10 text-[#8b95a1] mx-auto mb-3 opacity-60" />
          <h3 className="text-[17px] font-bold text-[#191f28]">
            해당 조건의 티켓 오픈 일정이 없습니다
          </h3>
          <p className="text-[13.5px] text-[#8b95a1] mt-1 max-w-sm mx-auto">
            새로운 클래식 공연 티켓 오픈 일정이 감지되는 즉시 자동으로 등록됩니다.
          </p>
        </div>
      )}

      {/* Ticket Open Cards List */}
      {!loading && !error && filteredItems.length > 0 && (
        <div className="space-y-4">
          {filteredItems.map((concert) => {
            const ticketOpen = concert.ticketOpen || {}
            const openAtFormatted =
              ticketOpen.openAtFormatted ||
              formatKoreanDateTime(ticketOpen.openAt)
            const bookingUrl =
              ticketOpen.bookingUrl ||
              (concert.tickets && concert.tickets[0]?.url) ||
              '#'

            return (
              <div
                key={concert.id}
                className="group relative p-5 rounded-2xl bg-white border border-[#e5e8eb] hover:border-[#3182f6] hover:shadow-[0_4px_20px_rgba(49,130,246,0.08)] transition-all flex flex-col sm:flex-row gap-4 sm:gap-5"
              >
                {/* Poster Thumbnail */}
                <div className="w-20 sm:w-28 aspect-[3/4] shrink-0 overflow-hidden rounded-xl bg-[#f2f4f6] relative self-start">
                  <Poster
                    src={concert.poster}
                    title={concert.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>

                {/* Main Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    {/* Badges Bar: D-Day & Open Type */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <DDayBadge
                        dDay={ticketOpen.dDay}
                        isPast={ticketOpen.isPast}
                        isToday={ticketOpen.isToday}
                        isTomorrow={ticketOpen.isTomorrow}
                        dDayLabel={ticketOpen.dDayLabel}
                      />
                      <span className="text-[12px] font-semibold text-[#4e5968] bg-[#f2f4f6] px-2 py-0.5 rounded-md">
                        {ticketOpen.typeName || '일반 예매'}
                      </span>
                      {concert.source === 'nol' && (
                        <span className="text-[11px] font-medium text-[#ff3b30] bg-[#fff0f0] px-2 py-0.5 rounded-md">
                          인터파크/NOL
                        </span>
                      )}
                    </div>

                    {/* Prominent Ticket Open Schedule Box */}
                    <div className="mb-2.5 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] p-2.5 sm:p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#f04452]">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span>티켓 예매 오픈 시각</span>
                        </div>
                        <div className="text-[15px] sm:text-[17px] font-extrabold text-[#191f28] mt-0.5 tracking-tight truncate">
                          {openAtFormatted}
                        </div>
                      </div>

                      {/* Direct Reservation Link Button */}
                      {bookingUrl && (
                        <a
                          href={bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#3182f6] text-white text-[13px] font-bold hover:bg-[#1b64da] transition-colors shrink-0 whitespace-nowrap shadow-xs"
                        >
                          <span>예매 바로가기</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        </a>
                      )}
                    </div>

                    {/* Concert Title */}
                    <Link
                      to={`/concerts/${concert.id}`}
                      className="block text-[17px] sm:text-[18px] font-bold text-[#191f28] group-hover:text-[#3182f6] transition-colors line-clamp-2 leading-snug break-keep"
                    >
                      {concert.title}
                    </Link>

                    {/* Cast info */}
                    {concert.cast && (
                      <p className="mt-1 text-[13px] text-[#4e5968] line-clamp-1">
                        출연: {concert.cast}
                      </p>
                    )}
                  </div>

                  {/* Metadata Footer: Performance Date & Venue */}
                  <div className="mt-3 pt-3 border-t border-[#f2f4f6] flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-[#8b95a1]">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1 font-medium text-[#4e5968]">
                        <Calendar className="h-3.5 w-3.5 text-[#8b95a1]" />
                        공연일: {concert.from || ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-[#8b95a1]" />
                        {concert.venue || '공연장 미정'}
                      </span>
                    </div>

                    <Link
                      to={`/concerts/${concert.id}`}
                      className="inline-flex items-center gap-1 font-semibold text-[#3182f6] hover:underline"
                    >
                      <span>공연 상세 및 프로그램</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Bottom Alert Banner */}
      <div className="mt-10 rounded-2xl bg-gradient-to-r from-[#e8f3ff] to-[#f0f7ff] border border-[#d0e4ff] p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[14px] font-bold text-[#3182f6] mb-1">
            <Bell className="h-4 w-4 shrink-0" />
            <span>원하는 공연의 티켓 오픈 일정을 놓치지 마세요</span>
          </div>
          <p className="text-[13px] text-[#4e5968] leading-relaxed break-keep">
            좋아하는 연주자나 오케스트라 키워드를 등록하면, 티켓 오픈 일정이 발표되는 즉시 무료로 이메일 알림을 보내드립니다.
          </p>
        </div>
        <Link
          to="/alerts"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#191f28] text-white text-[13px] font-bold hover:bg-[#333d4b] transition-colors shrink-0 whitespace-nowrap"
        >
          <span>키워드 알림 등록하기</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
