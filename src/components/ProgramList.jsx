import { useEffect, useState } from 'react'
import { Bell, Check, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.jsx'
import { addWatch } from '../lib/alerts.js'
import { fetchConcertProgram } from '../lib/api.js'

export default function ProgramList({
  initialPrograms = null,
  concertId = null,
  isPending = false,
}) {
  const [alertNotice, setAlertNotice] = useState('')
  const [programs, setPrograms] = useState(initialPrograms)
  const [loadingAI, setLoadingAI] = useState(Boolean(isPending || initialPrograms === null))

  useEffect(() => {
    setPrograms(initialPrograms)
    const needsFetch = (isPending || initialPrograms === null) && concertId
    setLoadingAI(Boolean(needsFetch))

    if (needsFetch) {
      let cancelled = false
      fetchConcertProgram(concertId)
        .then((res) => {
          if (!cancelled && res?.programs) {
            setPrograms(res.programs)
          }
        })
        .catch((err) => {
          console.warn('[ProgramList] AI extraction error:', err)
        })
        .finally(() => {
          if (!cancelled) setLoadingAI(false)
        })

      return () => {
        cancelled = true
      }
    }
  }, [initialPrograms, isPending, concertId])

  function handleWatchSong(songTitle) {
    const res = addWatch('song', songTitle)
    if (res.ok) {
      setAlertNotice(`'${songTitle}' 곡 알림이 등록되었습니다!`)
    } else {
      setAlertNotice(res.error)
    }
    setTimeout(() => setAlertNotice(''), 3500)
  }

  // Filter out any default fallback (def-) items
  const validPrograms = (programs || []).filter(
    (p) => p && !p.id?.startsWith('def-')
  )

  return (
    <Card className="mt-6 border-[#e5e8eb] overflow-hidden">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-[17px]">진행 프로그램</CardTitle>

        {/* Alert Feedback Toast */}
        {alertNotice && (
          <div className="mt-2 p-2.5 rounded-xl bg-[#e8faf3] text-[#03b26c] border border-[#03b26c]/20 text-[12px] font-medium flex items-center gap-1.5 animate-in fade-in">
            <Check className="h-3.5 w-3.5 shrink-0" />
            {alertNotice}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {loadingAI ? (
          /* Sleek Program Skeleton */
          <div className="divide-y divide-[#f2f4f6]">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="py-4 flex items-start justify-between gap-3 px-2.5 animate-pulse"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-5 rounded bg-[#f2f4f6]" />
                    <div className="h-3.5 w-24 rounded bg-[#f2f4f6]" />
                  </div>
                  <div className="h-5 w-3/4 rounded-md bg-[#e5e8eb]/80" />
                  <div className="h-3.5 w-1/2 rounded bg-[#f2f4f6]" />
                </div>
                <div className="h-7 w-14 rounded-lg bg-[#f2f4f6] shrink-0" />
              </div>
            ))}
          </div>
        ) : validPrograms.length === 0 ? (
          <div className="py-6 text-center text-[#8b95a1] text-[13px]">
            포스터 및 상세 이미지를 참조해 주세요.
          </div>
        ) : (
          <div className="divide-y divide-[#f2f4f6]">
            {validPrograms.map((track, idx) => (
              <div
                key={track.id || idx}
                className="py-4 flex items-start justify-between gap-3 first:pt-1 last:pb-1 px-2.5 -mx-2.5 rounded-xl transition-colors hover:bg-[#f9fafb]/80"
              >
                <div className="min-w-0 flex-1">
                  {/* 작곡가 정보: 작고 은은하게 */}
                  <div className="flex items-center gap-1.5 text-[11px] text-[#8b95a1] font-medium mb-1">
                    <span className="inline-flex h-4 min-w-[1.25rem] px-1 items-center justify-center rounded bg-[#f2f4f6] text-[10px] font-bold text-[#8b95a1]">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate">
                      {track.composerShort || track.composerKo || track.composer}
                    </span>
                    {track.composer && track.composer !== (track.composerShort || track.composerKo) && (
                      <span className="text-[11px] text-[#8b95a1]/70 hidden sm:inline truncate">
                        · {track.composer}
                      </span>
                    )}
                  </div>

                  {/* 곡 제목: 굵고 선명하게 부각 */}
                  <h4 className="text-[15px] sm:text-[16px] font-extrabold text-[#191f28] leading-snug tracking-tight">
                    {track.titleKo || track.title}
                  </h4>

                  {/* 원어 원제 */}
                  {track.title && track.title !== track.titleKo && (
                    <p className="mt-0.5 text-[12px] text-[#8b95a1] leading-relaxed">
                      {track.title}
                    </p>
                  )}
                </div>

                {/* 알림 받기 버튼 */}
                <button
                  type="button"
                  onClick={() => handleWatchSong(track.titleKo || track.title)}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#3182f6] hover:bg-[#e8f3ff] rounded-lg transition-colors cursor-pointer mt-0.5"
                >
                  <Bell className="h-3 w-3" />
                  곡 알림
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
