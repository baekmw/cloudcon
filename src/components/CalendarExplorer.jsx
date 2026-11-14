import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function toYmdDot(year, month, day) {
  return `${year}.${String(month + 1).padStart(2, '0')}.${String(day).padStart(2, '0')}`
}

function parseYmdDot(str) {
  if (!str) return null
  const parts = String(str).trim().split('.')
  if (parts.length < 3) return null
  const y = Number(parts[0])
  const m = Number(parts[1]) - 1
  const d = Number(parts[2])
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null
  return { year: y, month: m, day: d }
}

export default function CalendarExplorer({
  concerts = [],
  selectedDate,
  onSelectDate,
}) {
  const today = useMemo(() => new Date(), [])
  const todayStr = useMemo(
    () => toYmdDot(today.getFullYear(), today.getMonth(), today.getDate()),
    [today]
  )

  const initialParsed = parseYmdDot(selectedDate) || {
    year: today.getFullYear(),
    month: today.getMonth(),
    day: today.getDate(),
  }

  const [viewYear, setViewYear] = useState(initialParsed.year)
  const [viewMonth, setViewMonth] = useState(initialParsed.month)

  // 현재 보고 있는 월의 각 날짜별 공연 수 집계
  const { weeks, monthTotalConcerts } = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    const startWeekday = firstDay.getDay()
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

    const countMap = new Map()
    const uniqueInMonth = new Set()

    for (let d = 1; d <= daysInMonth; d++) {
      countMap.set(toYmdDot(viewYear, viewMonth, d), 0)
    }

    const monthStartStr = toYmdDot(viewYear, viewMonth, 1)
    const monthEndStr = toYmdDot(viewYear, viewMonth, daysInMonth)

    for (const concert of concerts) {
      const from = concert.from || ''
      const to = concert.to || from
      if (!from) continue

      if (to < monthStartStr || from > monthEndStr) continue

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = toYmdDot(viewYear, viewMonth, d)
        if (from <= dateStr && dateStr <= to) {
          countMap.set(dateStr, (countMap.get(dateStr) || 0) + 1)
          uniqueInMonth.add(concert.id)
        }
      }
    }

    const cells = []
    for (let i = 0; i < startWeekday; i++) {
      cells.push(null)
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = toYmdDot(viewYear, viewMonth, d)
      const weekday = (startWeekday + d - 1) % 7
      cells.push({
        day: d,
        dateStr,
        weekday,
        count: countMap.get(dateStr) || 0,
      })
    }
    while (cells.length % 7 !== 0) {
      cells.push(null)
    }

    const weekRows = []
    for (let i = 0; i < cells.length; i += 7) {
      weekRows.push(cells.slice(i, i + 7))
    }

    return {
      weeks: weekRows,
      monthTotalConcerts: uniqueInMonth.size,
    }
  }, [concerts, viewYear, viewMonth])

  function handlePrevMonth() {
    let nextY = viewYear
    let nextM = viewMonth - 1
    if (nextM < 0) {
      nextM = 11
      nextY -= 1
    }
    setViewYear(nextY)
    setViewMonth(nextM)
    onSelectDate(toYmdDot(nextY, nextM, 1))
  }

  function handleNextMonth() {
    let nextY = viewYear
    let nextM = viewMonth + 1
    if (nextM > 11) {
      nextM = 0
      nextY += 1
    }
    setViewYear(nextY)
    setViewMonth(nextM)
    onSelectDate(toYmdDot(nextY, nextM, 1))
  }

  return (
    <div className="w-full rounded-3xl bg-[var(--theme-white)] border border-[var(--theme-light)] shadow-[0_2px_12px_rgba(43,43,43,0.03)] p-5 sm:p-7 animate-fade-up">
      {/* 상단 월 선택 스테퍼 */}
      <div className="flex items-center justify-between gap-2 pb-4 border-b border-[var(--theme-light)]/60">
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--theme-dark)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer shrink-0"
            aria-label="이전 달"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="px-1.5 sm:px-2 text-[17px] sm:text-[20px] font-extrabold text-[var(--theme-dark)] tabular-nums tracking-tight whitespace-nowrap shrink-0">
            {viewYear}년 {viewMonth + 1}월
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--theme-dark)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer shrink-0"
            aria-label="다음 달"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <span className="text-[12px] sm:text-[13px] text-[var(--theme-mid)] whitespace-nowrap shrink-0">
          이달의 공연 <strong className="text-[var(--theme-dark)] font-semibold tabular-nums">{monthTotalConcerts}</strong>건
        </span>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mt-4 pb-2 text-center">
        {WEEKDAYS.map((dayName, idx) => (
          <div
            key={dayName}
            className={`text-[12px] font-semibold py-1 ${
              idx === 0 || idx === 6
                ? 'text-[var(--text-secondary)]'
                : 'text-[var(--theme-mid)]'
            }`}
          >
            {dayName}
          </div>
        ))}
      </div>

      {/* 미니멀 보더리스 날짜 그리드 (주 단위 구분선 + 아래에서 올라오는 페이드인) */}
      <div
        key={`${viewYear}-${viewMonth}`}
        className="divide-y divide-[var(--theme-light)]/50"
      >
        {weeks.map((week, wIdx) => (
          <div
            key={`week-${wIdx}`}
            style={{ animationDelay: `${wIdx * 40}ms` }}
            className="grid grid-cols-7 py-1 sm:py-1.5 animate-fade-up"
          >
            {week.map((cell, cIdx) => {
              if (!cell) {
                return <div key={`empty-${wIdx}-${cIdx}`} className="h-14 sm:h-16" />
              }

              const isSelected = cell.dateStr === selectedDate
              const isToday = cell.dateStr === todayStr
              const count = cell.count

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => onSelectDate(cell.dateStr)}
                  className={`group relative h-14 sm:h-16 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--theme-light)]/45'
                      : 'hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  {/* 날짜 숫자 */}
                  <span
                    className={`inline-flex items-center justify-center h-7 w-7 rounded-full text-[14px] sm:text-[15px] tabular-nums transition-colors ${
                      isSelected
                        ? 'bg-[var(--theme-dark)] text-[var(--theme-white)] font-bold shadow-xs'
                        : isToday
                        ? 'text-[var(--theme-dark)] font-extrabold underline decoration-2 underline-offset-4'
                        : count === 0
                        ? 'text-[var(--theme-mid)] font-normal'
                        : 'text-[var(--theme-dark)] font-semibold'
                    }`}
                  >
                    {cell.day}
                  </span>

                  {/* 총 공연 수 */}
                  <span
                    className={`text-[11px] sm:text-[12px] leading-none tabular-nums whitespace-nowrap transition-colors ${
                      count === 0
                        ? 'text-transparent select-none'
                        : isSelected
                        ? 'text-[var(--theme-dark)] font-bold'
                        : 'text-[var(--theme-mid)] font-medium group-hover:text-[var(--theme-dark)]'
                    }`}
                  >
                    {count > 0 ? `${count}건` : '-'}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
