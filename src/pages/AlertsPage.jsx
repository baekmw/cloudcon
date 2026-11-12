import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bell, ChevronLeft, Trash2, Check, Clock, AlertTriangle } from 'lucide-react'
import StatePill from '../components/StatePill.jsx'
import { Button } from '../components/ui/button.jsx'
import { Input } from '../components/ui/input.jsx'
import { Badge } from '../components/ui/badge.jsx'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx'
import { findMatches } from '../lib/api.js'
import {
  addWatch,
  markAllRead,
  markRead,
  removeWatch,
  useAlerts,
} from '../lib/alerts.js'
import { formatPeriod, formatWhen } from '../lib/format.js'

export default function AlertsPage() {
  const alerts = useAlerts()
  const [params] = useSearchParams()
  const [kind, setKind] = useState(params.get('kind') === 'song' ? 'song' : 'artist')
  const [query, setQuery] = useState(params.get('q') || '')
  const [formError, setFormError] = useState('')
  const [permission, setPermission] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const [results, setResults] = useState({})

  useEffect(() => {
    document.title = 'Cloudcon · 공연 알림 관리'
  }, [])

  useEffect(() => {
    if (!alerts.watches.length) return undefined
    let cancelled = false
    let timer = 0

    async function load() {
      const pairs = await Promise.all(
        alerts.watches.map(async (watch) => {
          try {
            return [watch.id, await findMatches(watch.kind, watch.query)]
          } catch (error) {
            return [watch.id, { error: error.message, matches: [], complete: true, indexed: 0, total: 0 }]
          }
        }),
      )
      if (cancelled) return
      const next = Object.fromEntries(pairs)
      setResults(next)
      const pending = Object.values(next).some((result) => result && !result.complete && !result.error && result.configured !== false)
      if (pending) timer = window.setTimeout(load, 2000)
    }

    load()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [alerts.watches])

  async function onSubmit(event) {
    event.preventDefault()
    const result = addWatch(kind, query)
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    setQuery('')
    setFormError('')
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const next = await Notification.requestPermission()
      setPermission(next)
    }
  }

  async function askPermission() {
    if (typeof Notification === 'undefined') return
    const next = await Notification.requestPermission()
    setPermission(next)
  }

  const unread = alerts.inbox.filter((item) => !item.read).length
  const progress = Object.values(results).find((result) => result && result.total)

  return (
    <main className="mx-auto max-w-[800px] px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[#6b7684] hover:text-[#191f28] mb-2 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> 검색으로 돌아가기
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#191f28] tracking-tight">알림 관리</h1>
          <p className="mt-1 text-[14px] text-[#6b7684]">
            등록된 아티스트나 곡이 KOPIS에 새로 올라오면 실시간으로 감지합니다
          </p>
        </div>
      </div>

      {/* Push Notification Banner */}
      <Card className="mb-6 border-[#e5e8eb]">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3 text-[14px]">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#3182f6]" />
            <span className="text-[#333d4b]">
              {permission === 'granted' && '브라우저 알림이 켜져 있습니다.'}
              {permission === 'denied' && '브라우저 알림이 차단되어 있습니다 (알림함에서 확인 가능).'}
              {permission === 'default' && '브라우저 알림을 켜두시면 새 일정을 즉시 알려드려요.'}
              {permission === 'unsupported' && '이 브라우저는 웹 푸시를 지원하지 않습니다.'}
            </span>
          </div>

          {permission === 'default' && (
            <Button size="sm" onClick={askPermission} className="rounded-xl font-semibold">
              알림 허용하기
            </Button>
          )}

          {alerts.lastScanAt && (
            <span className="text-[12px] text-[#8b95a1] ml-auto">
              마지막 검사 {formatWhen(alerts.lastScanAt)}
            </span>
          )}
        </CardContent>
      </Card>

      {/* Inbox */}
      {alerts.inbox.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[17px] font-bold text-[#191f28]">
              도착한 알림 {unread > 0 && <span className="text-[#3182f6]">({unread})</span>}
            </h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[13px] font-medium text-[#3182f6] hover:underline cursor-pointer"
              >
                모두 읽음
              </button>
            )}
          </div>

          <Card className="divide-y divide-[#f2f4f6] overflow-hidden border-[#e5e8eb]">
            {alerts.inbox.map((item) => (
              <Link
                key={item.id}
                to={`/concerts/${item.concertId}`}
                onClick={() => markRead(item.id)}
                className={`block p-4 hover:bg-[#f9fafb] transition-colors ${
                  item.read ? 'opacity-60' : 'bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-medium text-[#191f28]">{item.body}</p>
                  {!item.read && (
                    <span className="h-2 w-2 rounded-full bg-[#3182f6] shrink-0 mt-1.5" />
                  )}
                </div>
                <p className="mt-1 text-[12px] text-[#8b95a1] flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatWhen(item.at)}
                </p>
              </Link>
            ))}
          </Card>
        </section>
      )}

      {/* Add New Watch Form */}
      <Card className="mb-8 border-[#e5e8eb] shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-[17px]">새 공연 알림 만들기</CardTitle>
          <p className="text-[13px] text-[#8b95a1]">
            연주자명 또는 곡명을 입력해두면 새 공연 등록 시 자동으로 감지합니다
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit}>
            <div className="flex gap-2 mb-3">
              {[
                ['artist', '아티스트'],
                ['song', '곡명'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={`px-3 py-1.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                    kind === value
                      ? 'bg-[#3182f6] text-white shadow-sm'
                      : 'bg-[#f2f4f6] text-[#6b7684] hover:text-[#191f28]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={kind === 'artist' ? '예: 조성진, 임윤찬, 정명훈' : '예: 월광, 사계, 비창'}
              />
              <Button type="submit" className="shrink-0 font-semibold px-5">
                등록하기
              </Button>
            </div>
            {formError && <p className="mt-2 text-[13px] text-[#f04452]">{formError}</p>}
          </form>
        </CardContent>
      </Card>

      {/* Progress */}
      {progress && !progress.complete && (
        <div className="mb-6 flex items-center gap-2 text-[13px] text-[#8b95a1]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#3182f6] border-t-transparent" />
          공연 상세 정보 인덱싱 중... ({progress.indexed}/{progress.total})
        </div>
      )}

      {/* Watches List */}
      <section className="space-y-4">
        <h2 className="text-[17px] font-bold text-[#191f28]">등록된 알림 목록</h2>

        {alerts.watches.length === 0 && (
          <Card className="py-12 text-center border-dashed border-[#e5e8eb]">
            <CardContent className="flex flex-col items-center p-0">
              <Bell className="h-8 w-8 text-[#8b95a1] mb-2" />
              <p className="text-[15px] font-semibold text-[#191f28]">등록된 알림이 없습니다</p>
              <p className="mt-1 text-[13px] text-[#8b95a1]">
                위 양식에서 관심 있는 아티스트나 곡을 등록해보세요
              </p>
            </CardContent>
          </Card>
        )}

        {alerts.watches.map((watch) => {
          const result = results[watch.id]
          const upcoming = (result?.matches || []).filter((item) => item.concert.state !== '공연완료')

          return (
            <Card key={watch.id} className="border-[#e5e8eb]">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Badge variant={watch.kind === 'artist' ? 'default' : 'secondary'} className="mb-1 text-[11px]">
                      {watch.kind === 'artist' ? '아티스트' : '곡'}
                    </Badge>
                    <h3 className="text-xl font-bold text-[#191f28]">{watch.query}</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeWatch(watch.id)}
                    className="text-[#8b95a1] hover:text-[#f04452] hover:bg-[#fff0f1] rounded-xl h-8 px-2.5"
                  >
                    <Trash2 className="h-4 w-4" />
                    삭제
                  </Button>
                </div>

                {/* Match Status */}
                <div className="mt-4 pt-3 border-t border-[#f2f4f6]">
                  {!result && (
                    <p className="text-[13px] text-[#8b95a1]">현재 등록된 공연에서 일치 항목을 검색하는 중...</p>
                  )}
                  {result && !result.error && upcoming.length === 0 && (
                    <p className="text-[13px] text-[#8b95a1]">
                      현재 예정·공연중인 일정에는 없습니다. 새로 등록되면 알림함에 기록됩니다.
                    </p>
                  )}
                  {upcoming.length > 0 && (
                    <div className="space-y-2 mt-2">
                      <p className="text-[12px] font-semibold text-[#3182f6]">
                        현재 예정된 공연 {upcoming.length}건
                      </p>
                      <ul className="divide-y divide-[#f2f4f6]">
                        {upcoming.map((item) => (
                          <li key={item.concert.id} className="py-2.5 first:pt-0 last:pb-0">
                            <Link
                              to={`/concerts/${item.concert.id}`}
                              className="group block hover:text-[#3182f6] transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <StatePill state={item.concert.state} />
                                <span className="text-[12px] text-[#8b95a1]">{item.reason}</span>
                              </div>
                              <p className="mt-1 text-[15px] font-bold text-[#191f28] group-hover:text-[#3182f6]">
                                {item.concert.title}
                              </p>
                              <p className="text-[13px] text-[#6b7684]">
                                {item.concert.venue} · {formatPeriod(item.concert.from, item.concert.to)}
                              </p>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </section>
    </main>
  )
}
