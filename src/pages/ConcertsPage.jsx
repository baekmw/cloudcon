import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Poster from '../components/Poster.jsx'
import StatePill from '../components/StatePill.jsx'
import { getConcerts } from '../lib/api.js'
import { AREAS, formatPeriod, overlapsRange, parseKopisDate } from '../lib/format.js'

const fieldClass =
  'w-full rounded-xl border border-line bg-card px-3 py-2 text-sm outline-none focus:border-wine'

function matchesState(concert, filter) {
  if (filter === 'all') return true
  if (filter === 'live') return concert.state === '공연중' || concert.state === '공연예정'
  return concert.state === filter
}

export default function ConcertsPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const area = params.get('area') || ''
  const state = params.get('state') || 'live'
  const from = params.get('from') || ''
  const to = params.get('to') || ''
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Cloudcon · 클래식 공연'
  }, [])

  useEffect(() => {
    let cancelled = false
    getConcerts()
      .then((response) => {
        if (!cancelled) setData(response)
      })
      .catch((reason) => {
        if (!cancelled) setError(reason.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function update(next) {
    const merged = { q, area, state, from, to, ...next }
    const cleaned = {}
    if (merged.q) cleaned.q = merged.q
    if (merged.area) cleaned.area = merged.area
    if (merged.state && merged.state !== 'live') cleaned.state = merged.state
    if (merged.from) cleaned.from = merged.from
    if (merged.to) cleaned.to = merged.to
    setParams(cleaned, { replace: true })
  }

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      setData(await getConcerts({ refresh: true }))
    } catch (reason) {
      setError(reason.message)
    } finally {
      setLoading(false)
    }
  }

  const concerts = data?.concerts || []
  const areas = useMemo(() => {
    const present = new Set(concerts.map((concert) => concert.area).filter(Boolean))
    const known = AREAS.filter((name) => present.has(name))
    const extra = [...present].filter((name) => !AREAS.includes(name)).sort((a, b) => a.localeCompare(b, 'ko'))
    return [...known, ...extra]
  }, [concerts])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const fromDate = from ? parseKopisDate(from.replaceAll('-', '.')) : null
    const toDate = to ? parseKopisDate(to.replaceAll('-', '.')) : null
    return concerts.filter((concert) => {
      if (!matchesState(concert, state)) return false
      if (area && concert.area !== area) return false
      if (!overlapsRange(concert, fromDate, toDate)) return false
      if (!needle) return true
      return [concert.title, concert.venue, concert.area].join(' ').toLowerCase().includes(needle)
    })
  }, [concerts, q, area, state, from, to])

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.18em] text-wine uppercase">KOPIS · 서양음악</p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight">한국의 클래식 공연</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            전국 공연장에 올라온 클래식 공연을 한곳에 모읍니다. 아티스트나 곡을 골라 새 공연 알림을 만들 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading || data?.configured === false}
          className="rounded-full border border-line bg-card px-4 py-2 text-sm disabled:opacity-50"
        >
          다시 불러오기
        </button>
      </div>

      {data?.configured === false && (
        <section className="mt-8 rounded-2xl border border-line bg-card p-6">
          <h2 className="font-serif text-2xl">KOPIS 서비스 키가 필요합니다</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            공연 목록은 공연예술통합전산망 Open API로 가져옵니다. 키를 발급한 뒤 프로젝트 루트의{' '}
            <code className="rounded bg-paper px-1.5 py-0.5">.env</code>에 넣고 개발 서버를 다시 시작하세요.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-ink px-4 py-3 text-sm text-paper">KOPIS_SERVICE_KEY=발급받은키</pre>
          <a
            className="mt-4 inline-block text-sm text-wine underline underline-offset-2"
            href="https://www.kopis.or.kr/por/cs/openapi/openApiList.do?menuId=MNU_00074"
            target="_blank"
            rel="noreferrer"
          >
            KOPIS Open API 안내
          </a>
        </section>
      )}

      {loading && data?.configured !== false && (
        <p className="mt-8 text-sm text-muted">KOPIS에서 클래식 공연을 모으는 중입니다. 처음에는 한 달씩 나눠 요청합니다.</p>
      )}
      {error && (
        <p className="mt-8 rounded-xl border border-wine/30 bg-card px-4 py-3 text-sm text-wine">{error}</p>
      )}

      {data?.configured && (
        <>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-muted">공연명, 공연장, 지역</span>
              <input
                className={fieldClass}
                value={q}
                onChange={(event) => update({ q: event.target.value })}
                placeholder="예: 예술의전당, 교향악"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs text-muted">지역</span>
              <select className={fieldClass} value={area} onChange={(event) => update({ area: event.target.value })}>
                <option value="">전국</option>
                {areas.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs text-muted">상태</span>
              <select className={fieldClass} value={state} onChange={(event) => update({ state: event.target.value })}>
                <option value="live">예정 · 공연중</option>
                <option value="공연예정">공연예정</option>
                <option value="공연중">공연중</option>
                <option value="공연완료">공연완료</option>
                <option value="all">전체</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs text-muted">기간</span>
              <div className="grid grid-cols-2 gap-2">
                <input className={fieldClass} type="date" value={from} onChange={(event) => update({ from: event.target.value })} />
                <input className={fieldClass} type="date" value={to} onChange={(event) => update({ to: event.target.value })} />
              </div>
            </label>
          </div>

          <p className="mt-5 text-sm text-muted">
            {visible.length}건 표시 · KOPIS에서 {concerts.length}건을 모았습니다
          </p>

          {visible.length === 0 && !loading && (
            <p className="mt-8 text-sm text-muted">조건에 맞는 공연이 없습니다.</p>
          )}

          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((concert) => (
              <li key={concert.id}>
                <Link
                  to={`/concerts/${concert.id}`}
                  className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card transition hover:-translate-y-0.5 hover:border-wine/40"
                >
                  <Poster src={concert.poster} title={concert.title} className="aspect-[3/4] w-full object-cover" />
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <StatePill state={concert.state} />
                      <span className="truncate text-xs text-muted">{concert.area}</span>
                    </div>
                    <h2 className="font-serif text-xl leading-snug">{concert.title}</h2>
                    <p className="text-sm text-muted">{concert.venue}</p>
                    <p className="mt-auto pt-2 text-sm">{formatPeriod(concert.from, concert.to)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
