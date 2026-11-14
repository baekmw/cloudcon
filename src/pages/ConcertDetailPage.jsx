import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronDown, ChevronUp, ExternalLink, Bell, Calendar, MapPin, Check, Ticket } from 'lucide-react'
import Poster from '../components/Poster.jsx'
import StatePill from '../components/StatePill.jsx'
import ProgramList from '../components/ProgramList.jsx'
import { Button } from '../components/ui/button.jsx'
import { Input } from '../components/ui/input.jsx'
import { Badge } from '../components/ui/badge.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx'
import { getConcert, addMyKeyword } from '../lib/api.js'
import { formatPeriod } from '../lib/format.js'
import { splitPeople, cleanArtistName } from '../lib/match.js'

function Fact({ label, value }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[minmax(4.25rem,max-content)_1fr] gap-3 py-2.5 text-[14px]">
      <dt className="font-medium text-[#8b95a1] shrink-0 whitespace-nowrap">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap text-[#191f28] break-keep">{value}</dd>
    </div>
  )
}

function parseRuntimeMinutes(rt) {
  if (!rt) return 0
  const hMatch = rt.match(/(\d+)\s*시간/)
  const mMatch = rt.match(/(\d+)\s*분/)
  const h = hMatch ? parseInt(hMatch[1], 10) : 0
  const m = mMatch ? parseInt(mMatch[1], 10) : 0
  return h * 60 + m
}

function addMinutesToTime(timeStr, mins) {
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + mins
  const endH = Math.floor(total / 60) % 24
  const endM = total % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}

function getConcertTimeDisplay(schedule, runtime) {
  const mins = parseRuntimeMinutes(runtime)

  if (schedule) {
    const times = [...schedule.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map((m) => m[1])
    const uniqueTimes = [...new Set(times)]
    if (uniqueTimes.length > 0 && mins > 0) {
      return {
        timeValue: uniqueTimes.map((t) => `${t}~${addMinutesToTime(t, mins)}`).join(', '),
        showRuntimeRow: false,
      }
    }
    if (uniqueTimes.length > 0) {
      return {
        timeValue: uniqueTimes.join(', '),
        showRuntimeRow: Boolean(runtime),
      }
    }
    const cleaned = schedule.replace(/[월화수목금토일]요일\s*/g, '').trim()
    return {
      timeValue: cleaned || schedule,
      showRuntimeRow: Boolean(runtime),
    }
  }

  return {
    timeValue: '',
    showRuntimeRow: Boolean(runtime),
  }
}

function getOrganizerSummary(concert) {
  const fields = [
    concert.presenter,
    concert.producer,
    concert.organizer,
    concert.planner,
    concert.company,
  ].filter(Boolean)

  if (fields.length === 0) return ''

  const unique = []
  for (const item of fields) {
    const parts = String(item).split(/[,/]/).map((s) => s.trim()).filter(Boolean)
    for (const p of parts) {
      if (!unique.includes(p)) {
        unique.push(p)
      }
    }
  }

  return unique.join(', ')
}

function StorySection({ story }) {
  const [expanded, setExpanded] = useState(false)
  const [isLong, setIsLong] = useState(false)
  const contentRef = useRef(null)

  useEffect(() => {
    if (contentRef.current && contentRef.current.scrollHeight > 220) {
      setIsLong(true)
    }
  }, [story])

  if (!story) return null

  return (
    <Card className="mt-6 border-[#e5e8eb] overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-[17px]">프로그램 소개</CardTitle>
      </CardHeader>
      <CardContent className="text-[14px] leading-relaxed text-[#4e5968] pt-0">
        <div
          ref={contentRef}
          className={`relative transition-all duration-300 ${
            !expanded && isLong ? 'max-h-[190px] overflow-hidden' : ''
          }`}
        >
          <div className="whitespace-pre-wrap">{story}</div>

          {!expanded && isLong && (
            <>
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent via-white/80 to-white pointer-events-none" />
              <div className="absolute inset-x-0 bottom-1 flex justify-center z-10">
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-[#8b95a1] hover:text-[#4e5968] transition-colors cursor-pointer py-1 px-3"
                >
                  <span>소개 더보기</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}
        </div>

        {expanded && isLong && (
          <div className="mt-2.5 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setExpanded(false)
                contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
              }}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[#8b95a1] hover:text-[#4e5968] transition-colors cursor-pointer py-1 px-3"
            >
              <span>소개 접기</span>
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DetailImages({ images = [] }) {
  const [expanded, setExpanded] = useState(false)
  const [isLong, setIsLong] = useState(false)
  const containerRef = useRef(null)

  const checkHeight = () => {
    if (containerRef.current && containerRef.current.scrollHeight > 520) {
      setIsLong(true)
    }
  }

  useEffect(() => {
    checkHeight()
  }, [images])

  if (!images || images.length === 0) return null

  return (
    <div className="mt-6">
      <div
        ref={containerRef}
        className={`relative transition-all duration-300 ${
          !expanded && isLong ? 'max-h-[500px] overflow-hidden' : ''
        }`}
      >
        <div className="space-y-3">
          {images.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              onLoad={checkHeight}
              className="w-full rounded-2xl border border-[#e5e8eb]"
              referrerPolicy="no-referrer"
            />
          ))}
        </div>

        {/* 점진적으로 흐려지는 그라데이션 및 더보기 버튼 */}
        {!expanded && isLong && (
          <>
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent via-white/80 to-white pointer-events-none" />
            <div className="absolute inset-x-0 bottom-2 flex justify-center z-10">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-[#8b95a1] hover:text-[#4e5968] transition-colors cursor-pointer py-1 px-3"
              >
                <span>상세 이미지 더보기</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {expanded && isLong && (
        <div className="mt-2.5 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setExpanded(false)
              containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            }}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[#8b95a1] hover:text-[#4e5968] transition-colors cursor-pointer py-1 px-3"
          >
            <span>상세 이미지 접기</span>
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

export default function ConcertDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [concert, setConcert] = useState(null)
  const [error, setError] = useState('')
  const [song, setSong] = useState('')
  const [notice, setNotice] = useState('')

  function handleGoBack() {
    if (window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0) {
      navigate(-1)
    } else {
      navigate('/')
    }
  }

  useEffect(() => {
    let cancelled = false
    setConcert(null)
    setError('')
    getConcert(id)
      .then((response) => {
        if (!cancelled) setConcert(response.concert)
      })
      .catch((reason) => {
        if (!cancelled) setError(reason.message)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (concert?.title) document.title = `${concert.title} · Cloudcon`
  }, [concert])

  async function watchPerson(name) {
    const cleanName = cleanArtistName(name) || name
    try {
      await addMyKeyword(cleanName)
      setNotice(`'${cleanName}' 이메일 알림이 등록되었습니다!`)
      setTimeout(() => setNotice(''), 3500)
    } catch (err) {
      if (err.status === 401) {
        navigate(`/alerts?q=${encodeURIComponent(cleanName)}`)
      } else {
        setNotice(err.message || '알림 등록 실패')
        setTimeout(() => setNotice(''), 3500)
      }
    }
  }

  async function watchSong(event) {
    event.preventDefault()
    const target = song.trim()
    if (!target) return
    try {
      await addMyKeyword(target)
      setSong('')
      setNotice(`'${target}' 곡 이메일 알림이 등록되었습니다!`)
      setTimeout(() => setNotice(''), 3500)
    } catch (err) {
      if (err.status === 401) {
        navigate(`/alerts?q=${encodeURIComponent(target)}`)
      } else {
        setNotice(err.message || '알림 등록 실패')
        setTimeout(() => setNotice(''), 3500)
      }
    }
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-[15px] text-[#f04452] font-semibold">{error}</p>
        <button
          type="button"
          onClick={handleGoBack}
          className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium text-[#3182f6] cursor-pointer hover:underline"
        >
          <ChevronLeft className="h-4 w-4" /> 검색으로 돌아가기
        </button>
      </main>
    )
  }

  if (!concert) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#3182f6] border-t-transparent" />
        <p className="mt-3 text-[14px] text-[#8b95a1]">공연 정보를 불러오는 중...</p>
      </main>
    )
  }

  const people = splitPeople(concert.cast)

  return (
    <main className="mx-auto max-w-[960px] px-6 py-6 sm:py-8">
      {/* Back Button (Non-sticky: scrolls away naturally) */}
      <button
        type="button"
        onClick={handleGoBack}
        className="inline-flex items-center gap-1 text-[14px] font-medium text-[#6b7684] hover:text-[#191f28] mb-6 transition-colors whitespace-nowrap cursor-pointer"
      >
        <ChevronLeft className="h-4 w-4 shrink-0" /> 검색으로 돌아가기
      </button>

      <div className="grid gap-8 md:grid-cols-[280px_1fr] items-start">
        {/* Sticky Left Column: Poster, Booking & Alert */}
        <div className="md:sticky md:top-20 md:self-start space-y-3">
          <div className="overflow-hidden rounded-2xl bg-white border border-[#e5e8eb] shadow-sm">
            <Poster
              src={concert.poster}
              title={concert.title}
              className="aspect-[3/4] w-full object-cover"
            />
          </div>

          {concert.tickets?.length > 0 && (
            <div className="flex flex-col gap-2">
              {concert.tickets.map((ticket) => (
                <a
                  key={ticket.url}
                  href={ticket.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-[#e5e8eb] bg-white px-3 py-2.5 text-[13px] font-semibold text-[#4e5968] hover:text-[#191f28] hover:border-[#3182f6] hover:bg-[#f8fafc] whitespace-nowrap transition-all shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                >
                  <Ticket className="h-3.5 w-3.5 text-[#8b95a1] shrink-0" />
                  <span className="truncate">{ticket.name} 예매하기</span>
                  <ExternalLink className="h-3.5 w-3.5 text-[#8b95a1] shrink-0" />
                </a>
              ))}
            </div>
          )}

          {/* Quick Alert from this concert */}
          <Card className="border-[#3182f6]/30 bg-white shadow-sm overflow-hidden">
            <CardHeader className="p-3.5 pb-2">
              <CardTitle className="text-[14px] flex items-center gap-1.5 font-bold text-[#191f28] whitespace-nowrap">
                <Bell className="h-4 w-4 text-[#3182f6] shrink-0" />
                이 공연으로 알림 받기
              </CardTitle>
              <p className="text-[11px] text-[#8b95a1] leading-tight break-keep">
                새 공연이 등록되면 알려드려요
              </p>
            </CardHeader>
            <CardContent className="p-3.5 pt-0">
              {people.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2.5">
                  {people.slice(0, 4).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => watchPerson(name)}
                      className="px-2 py-1 rounded-lg border border-[#e5e8eb] bg-[#f9fafb] text-[11px] font-medium text-[#4e5968] hover:border-[#3182f6] hover:text-[#3182f6] whitespace-nowrap shrink-0 transition-all cursor-pointer"
                    >
                      + {name}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={watchSong} className="flex gap-1.5">
                <Input
                  value={song}
                  onChange={(e) => setSong(e.target.value)}
                  placeholder="곡 이름 등록 (예: 월광)"
                  className="bg-white h-8 text-[12px] px-2.5"
                />
                <Button type="submit" size="sm" className="shrink-0 font-semibold h-8 text-[12px] px-2.5">
                  등록
                </Button>
              </form>

              {notice && (
                <p className="mt-2 flex items-center gap-1 text-[11px] text-[#03b26c] font-medium animate-in fade-in">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{notice}</span>
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Concert Details */}
        <article className="min-w-0">
          {/* Metadata badges & info above Title */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <StatePill state={concert.state} />
            {concert.visit && <Badge variant="secondary">내한</Badge>}
            {concert.openRun && <Badge variant="amber">오픈런</Badge>}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 text-[12px] sm:text-[13px] text-[#6b7684] mb-2.5 whitespace-nowrap overflow-hidden">
            <span className="inline-flex items-center gap-1 min-w-0">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-[#8b95a1]" />
              <span className="truncate">{concert.venue} · {concert.area}</span>
            </span>
            <span className="shrink-0 text-[#8b95a1]">·</span>
            <span className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-[#8b95a1]" />
              <span>{formatPeriod(concert.from, concert.to)}</span>
            </span>
          </div>

          {/* Normal Title (Non-sticky, no background layer) */}
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#191f28] leading-tight">
            {concert.title}
          </h1>

          {/* Facts Card */}
          <Card className="mt-6 border-[#e5e8eb] overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-[17px]">공연 정보</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 pt-0 divide-y divide-[#f2f4f6]">
              <Fact label="출연" value={concert.cast} />
              <Fact label="제작진" value={concert.crew} />
              {(() => {
                const timeInfo = getConcertTimeDisplay(concert.schedule, concert.runtime)
                return (
                  <>
                    {timeInfo.timeValue && <Fact label="시간" value={timeInfo.timeValue} />}
                    {timeInfo.showRuntimeRow && <Fact label="런타임" value={concert.runtime} />}
                  </>
                )
              })()}
              <Fact label="가격" value={concert.price} />
              <Fact label="주최·기획" value={getOrganizerSummary(concert)} />
            </CardContent>
          </Card>

          {/* Program List with instant AI skeleton */}
          <ProgramList
            initialPrograms={concert.programs}
            concertId={concert.id}
            isPending={Boolean(concert.programPending)}
          />

          {/* Story with fading overflow & expand button */}
          <StorySection story={concert.story} />

          {/* Detail Images with fading overflow & expand button */}
          <DetailImages images={concert.images || []} />

          <p className="mt-8 text-[12px] text-[#8b95a1]">KOPIS 식별번호: {concert.id}</p>
        </article>
      </div>
    </main>
  )
}
