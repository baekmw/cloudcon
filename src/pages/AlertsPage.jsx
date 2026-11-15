import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bell,
  Trash2,
  Check,
  Mail,
  Plus,
  Sparkles,
  Unplug,
  AlertCircle,
  ListChecks,
  ChevronRight,
  ChevronDown,
  Calendar,
  MapPin,
} from 'lucide-react'
import { Button } from '../components/ui/button.jsx'
import { Input } from '../components/ui/input.jsx'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx'
import StatePill from '../components/StatePill.jsx'
import {
  subscribeKeyword,
  getMyKeywords,
  addMyKeyword,
  deleteMyKeyword,
  disconnectDevice,
  unsubscribeAllData,
  getConcerts,
} from '../lib/api.js'
import { clearLocalAlerts } from '../lib/alerts.js'
import { matchConcertClassical } from '../lib/classical.js'
import { formatPeriod } from '../lib/format.js'

const SUGGESTED_KEYWORDS = [
  '베토벤',
  '모차르트',
  '쇼팽',
  '라흐마니노프',
  '차이콥스키',
  '말러',
  '예술의전당',
  '롯데콘서트홀',
  '사계',
  '신세계',
]

export default function AlertsPage() {
  const [params, setParams] = useSearchParams()
  const initialQuery = params.get('q') || ''
  const verifyError = params.get('verify') === 'invalid'

  // Auth / Subscription state
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [keywords, setKeywords] = useState([])

  // Unauthenticated mode: 'subscribe' (새 알림 신청) | 'view' (내 알림 목록 보기)
  const [unauthTab, setUnauthTab] = useState('subscribe')

  // Unauthenticated form state
  const [emailInput, setEmailInput] = useState('')
  const [keywordInput, setKeywordInput] = useState(initialQuery)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(
    verifyError ? '유효하지 않거나 만료된 인증 링크입니다. 다시 신청해 주세요.' : ''
  )
  const [verificationSent, setVerificationSent] = useState(false)
  const [instantAddedMessage, setInstantAddedMessage] = useState('')

  // Authenticated add/delete & matched concerts state
  const [newKeywordInput, setNewKeywordInput] = useState(initialQuery)
  const [addingKeyword, setAddingKeyword] = useState(false)
  const [deletingKeyword, setDeletingKeyword] = useState('')
  const [manageNotice, setManageNotice] = useState('')
  const [manageError, setManageError] = useState('')
  const [deletingAll, setDeletingAll] = useState(false)
  const [deletedSuccessMessage, setDeletedSuccessMessage] = useState('')
  const [concerts, setConcerts] = useState([])
  const [expandedKeyword, setExpandedKeyword] = useState(null)

  useEffect(() => {
    document.title = 'cloudcon (클라우드콘) · 이메일 공연 알림 | Cloudcon'
  }, [])

  // Mount 시 쿠키(manageToken) 기반 구독 상태 조회 (GET /api/my-keywords)
  useEffect(() => {
    let cancelled = false
    setLoadingAuth(true)

    getMyKeywords()
      .then((res) => {
        if (cancelled) return
        if (res.authenticated) {
          setAuthenticated(true)
          setUserEmail(res.email)
          setKeywords(res.keywords)
        } else {
          setAuthenticated(false)
          setUserEmail('')
          setKeywords([])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthenticated(false)
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAuth(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // 인증된 경우 각 키워드별 매칭 공연 목록을 보여주기 위해 공연 데이터 로드
  useEffect(() => {
    if (!authenticated) return
    let cancelled = false
    getConcerts()
      .then((res) => {
        if (!cancelled && res?.concerts) {
          setConcerts(res.concerts)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [authenticated])

  // 각 등록 키워드별 매칭 공연 계산
  const matchedByKeyword = useMemo(() => {
    const map = {}
    for (const kw of keywords) {
      if (!concerts.length) {
        map[kw] = []
        continue
      }
      const list = concerts.filter(
        (c) =>
          c.state !== '공연완료' &&
          matchConcertClassical(c, kw, c.programs).matched
      )
      map[kw] = list
    }
    return map
  }, [keywords, concerts])

  // Unauthenticated: 이메일 + 키워드 구독 폼 제출 (POST /api/subscribe)
  async function handleSubscribeSubmit(event) {
    event.preventDefault()
    setFormError('')
    setVerificationSent(false)
    setInstantAddedMessage('')

    const email = emailInput.trim()
    const keyword = keywordInput.trim()

    if (!email) {
      setFormError('알림을 받을 이메일 주소를 입력해 주세요.')
      return
    }
    if (unauthTab === 'subscribe' && !keyword) {
      setFormError('알림을 받을 아티스트, 곡명 또는 공연장 키워드를 입력해 주세요.')
      return
    }

    setSubmitting(true)
    try {
      if (unauthTab === 'view') {
        await subscribeKeyword({
          email,
          keyword: '',
          sendMagicLink: true,
        })
        setVerificationSent(true)
      } else {
        const res = await subscribeKeyword({ email, keyword })
        if (!res.verified || res.status === 'verification_sent') {
          setVerificationSent(true)
          setKeywordInput('')
        } else {
          setInstantAddedMessage(
            `'${keyword}' 알림 키워드가 ${email} 앞으로 즉시 추가되었습니다.`
          )
          setKeywordInput('')
        }
      }
      if (params.has('q') || params.has('verify')) {
        setParams({}, { replace: true })
      }
    } catch (err) {
      setFormError(err.message || '요청 처리 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  // 이미 인증된 이메일 사용자가 새 기기에서 관리 링크 메일을 요청할 때
  async function handleRequestManageLink() {
    const email = emailInput.trim()
    if (!email) return
    setSubmitting(true)
    setFormError('')
    try {
      await subscribeKeyword({
        email,
        keyword: keywordInput.trim(),
        sendMagicLink: true,
      })
      setInstantAddedMessage('')
      setVerificationSent(true)
    } catch (err) {
      setFormError(err.message || '인증 링크 발송에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  // Authenticated: 새 키워드 추가 (POST /api/my-keywords)
  async function handleAddKeyword(event, targetKw) {
    if (event) event.preventDefault()
    const kw = (targetKw ?? newKeywordInput).trim()
    if (!kw) {
      setManageError('추가할 키워드를 입력해 주세요.')
      return
    }

    setManageError('')
    setManageNotice('')
    setAddingKeyword(true)

    try {
      const res = await addMyKeyword(kw)
      setKeywords(res.keywords || [])
      setNewKeywordInput('')
      setManageNotice(`'${kw}' 알림 키워드가 추가되었습니다.`)
      setTimeout(() => setManageNotice(''), 3500)
      if (params.has('q')) {
        setParams({}, { replace: true })
      }
    } catch (err) {
      if (err.status === 401) {
        setAuthenticated(false)
      } else {
        setManageError(err.message || '키워드 추가에 실패했습니다.')
      }
    } finally {
      setAddingKeyword(false)
    }
  }

  // Authenticated: 키워드 개별 삭제 (DELETE /api/my-keywords)
  async function handleDeleteKeyword(kw) {
    setManageError('')
    setManageNotice('')
    setDeletingKeyword(kw)

    try {
      const res = await deleteMyKeyword(kw)
      setKeywords(res.keywords || [])
      if (expandedKeyword === kw) setExpandedKeyword(null)
      setManageNotice(`'${kw}' 알림이 삭제되었습니다.`)
      setTimeout(() => setManageNotice(''), 3000)
    } catch (err) {
      if (err.status === 401) {
        setAuthenticated(false)
      } else {
        setManageError(err.message || '키워드 삭제에 실패했습니다.')
      }
    } finally {
      setDeletingKeyword('')
    }
  }

  // Authenticated: 기기에서 연결 해제 (POST /api/disconnect)
  async function handleDisconnect() {
    try {
      await disconnectDevice()
    } catch {
      // ignore
    }
    setAuthenticated(false)
    setUserEmail('')
    setKeywords([])
    setVerificationSent(false)
    setInstantAddedMessage('')
    setManageNotice('')
    setManageError('')
  }

  // Authenticated: 서버에서 이메일 및 모든 알림 키워드 완전 삭제 (DELETE /api/alerts/unsubscribe)
  async function handleDeleteAllData() {
    const confirmMsg = `등록된 이메일(${userEmail})과 모든 알림 키워드가 서버에서 즉시 영구 삭제되며, 더 이상 알림 메일이 발송되지 않습니다.\n\n정말로 모든 데이터를 삭제하시겠습니까?`
    if (!window.confirm(confirmMsg)) {
      return
    }

    setDeletingAll(true)
    setManageError('')
    setManageNotice('')

    try {
      const res = await unsubscribeAllData()
      clearLocalAlerts()
      setAuthenticated(false)
      setUserEmail('')
      setKeywords([])
      setVerificationSent(false)
      setInstantAddedMessage('')
      setDeletedSuccessMessage(
        res?.message || '이메일과 모든 등록 키워드가 서버에서 완전히 삭제되었습니다.'
      )
      setTimeout(() => setDeletedSuccessMessage(''), 6000)
    } catch (err) {
      setManageError(err.message || '데이터 삭제에 실패했습니다.')
    } finally {
      setDeletingAll(false)
    }
  }

  return (
    <main className="mx-auto max-w-[840px] px-6 py-10 md:py-12 flex flex-col items-center animate-fade-up">
      <div className="w-full max-w-[800px]">
        {/* 상단 헤더 (공연 모아보기 페이지와 동일한 레이아웃) */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#191f28] tracking-tight break-keep">
            공연 이메일 알림
          </h1>
          <p className="mt-1.5 text-[14px] sm:text-[15px] text-[#6b7684] leading-relaxed break-keep">
            기다리는 연주자, 곡명, 공연장을 등록해 두시면 새 공연 소식이 올라올 때 이메일로 보내드립니다.
          </p>
        </div>

      {/* 초기 로딩 스켈레톤 */}
      {loadingAuth ? (
        <Card className="border-[#e5e8eb] shadow-xs">
          <CardContent className="p-6 sm:p-8 space-y-4 animate-pulse">
            <div className="h-6 w-48 rounded-lg bg-[#f2f4f6]" />
            <div className="h-4 w-72 rounded-md bg-[#f2f4f6]" />
            <div className="h-11 w-full rounded-xl bg-[#f2f4f6]" />
            <div className="h-11 w-full rounded-xl bg-[#f2f4f6]" />
          </CardContent>
        </Card>
      ) : !authenticated ? (
        /* =========================================================
           1. Unauthenticated (401): 새 알림 신청하기 / 내 알림 목록 보기 탭
           ========================================================= */
        <div className="space-y-5 animate-fade-up">
          {deletedSuccessMessage && (
            <div className="p-4 rounded-2xl bg-[#e8f7ee] border border-[#a6e2be] text-[#03b26c] flex items-center gap-2 text-[13.5px] font-semibold animate-fade-up">
              <Check className="h-4 w-4 shrink-0" />
              <span>{deletedSuccessMessage}</span>
            </div>
          )}
          {/* 상단 탭 전환: 새 알림 신청 vs 내 알림 목록 보기 */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setUnauthTab('subscribe')
                setFormError('')
                setVerificationSent(false)
              }}
              className={`group flex items-center justify-center gap-2 py-3 px-3 rounded-2xl border transition-all cursor-pointer ${
                unauthTab === 'subscribe'
                  ? 'bg-[#e8f3ff]/75 border-[#3182f6] ring-2 ring-[#3182f6]/15 shadow-xs'
                  : 'bg-white border-[#e5e8eb] hover:border-[#3182f6]/60 hover:bg-[#f8fbff]'
              }`}
            >
              <div
                className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                  unauthTab === 'subscribe'
                    ? 'bg-[#3182f6] text-white shadow-xs'
                    : 'bg-[#f2f4f6] text-[#4e5968] group-hover:bg-[#e8f3ff] group-hover:text-[#3182f6]'
                }`}
              >
                <Bell className="h-4 w-4" />
              </div>
              <span className="text-[14px] sm:text-[15px] font-bold text-[#191f28] whitespace-nowrap">
                새 알림 신청하기
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUnauthTab('view')
                setFormError('')
                setVerificationSent(false)
              }}
              className={`group flex items-center justify-center gap-2 py-3 px-3 rounded-2xl border transition-all cursor-pointer ${
                unauthTab === 'view'
                  ? 'bg-[#e8f3ff]/75 border-[#3182f6] ring-2 ring-[#3182f6]/15 shadow-xs'
                  : 'bg-white border-[#e5e8eb] hover:border-[#3182f6]/60 hover:bg-[#f8fbff]'
              }`}
            >
              <div
                className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                  unauthTab === 'view'
                    ? 'bg-[#3182f6] text-white shadow-xs'
                    : 'bg-[#f2f4f6] text-[#4e5968] group-hover:bg-[#e8f3ff] group-hover:text-[#3182f6]'
                }`}
              >
                <ListChecks className="h-4 w-4" />
              </div>
              <span className="text-[14px] sm:text-[15px] font-bold text-[#191f28] whitespace-nowrap">
                내 알림 목록 보기
              </span>
            </button>
          </div>

          <Card className="border-[#e5e8eb] shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
            <CardHeader className="p-6 sm:p-7 pb-3">
              <div className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#3182f6] bg-[#e8f3ff] px-3 py-1 rounded-full w-fit mb-2 whitespace-nowrap">
                {unauthTab === 'view' ? (
                  <>
                    <ListChecks className="h-3.5 w-3.5 shrink-0" />
                    내 알림 목록 조회 · 관리
                  </>
                ) : (
                  <>
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    무료 이메일 소식 받기
                  </>
                )}
              </div>
              <CardTitle className="text-[19px] sm:text-[21px] font-extrabold text-[#191f28] break-keep">
                {unauthTab === 'view'
                  ? '등록해 둔 내 알림 목록을 불러올까요?'
                  : '어떤 클래식 무대를 기다리시나요?'}
              </CardTitle>
              <p className="text-[13.5px] text-[#6b7684] leading-relaxed break-keep">
                {unauthTab === 'view'
                  ? '알림을 신청했던 이메일 주소를 입력하시면, 클릭 한 번으로 이 기기에서 내 알림 목록을 보고 편집할 수 있는 인증 링크를 보내드려요.'
                  : '별도의 복잡한 절차 없이 이메일 주소와 키워드만 입력하면 새 공연 오픈 시 메일로 알려드려요.'}
              </p>
            </CardHeader>

            <CardContent className="p-6 sm:p-7 pt-2">
              <form onSubmit={handleSubscribeSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="sub-email"
                    className="block text-[13px] font-semibold text-[#333d4b] mb-1.5"
                  >
                    {unauthTab === 'view' ? '등록한 이메일 주소' : '받을 이메일 주소'}
                  </label>
                  <Input
                    id="sub-email"
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="name@example.com"
                    className="h-12 text-[15px]"
                  />
                </div>

                {unauthTab === 'subscribe' && (
                  <div>
                    <label
                      htmlFor="sub-keyword"
                      className="block text-[13px] font-semibold text-[#333d4b] mb-1.5"
                    >
                      알림 받을 키워드 (작곡가 · 연주자 · 곡명 · 공연장)
                    </label>
                    <Input
                      id="sub-keyword"
                      type="text"
                      required
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      placeholder="예: 베토벤, 모차르트, 쇼팽, 예술의전당"
                      className="h-12 text-[15px]"
                    />

                    {/* 추천 키워드 빠른 입력 */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11.5px] font-semibold text-[#8b95a1] mr-1 whitespace-nowrap">
                        자주 찾는 키워드
                      </span>
                      {SUGGESTED_KEYWORDS.map((word) => (
                        <button
                          key={word}
                          type="button"
                          onClick={() => setKeywordInput(word)}
                          className={`text-[12px] px-2.5 py-1 rounded-full border whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                            keywordInput === word
                              ? 'bg-[#3182f6] text-white border-[#3182f6]'
                              : 'bg-[#f9fafb] text-[#4e5968] border-[#e5e8eb] hover:border-[#3182f6]/50 hover:text-[#191f28]'
                          }`}
                        >
                          + {word}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {formError && (
                  <div className="p-3.5 rounded-xl bg-[#fff0f1] border border-[#f04452]/20 text-[#f04452] text-[13px] font-medium flex items-center gap-2 break-keep">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 rounded-xl text-[15px] font-bold shadow-xs"
                >
                  {submitting
                    ? '전송 중...'
                    : unauthTab === 'view'
                    ? '내 알림 목록 확인 링크 메일로 받기'
                    : '이메일로 공연 알림 받기'}
                </Button>
              </form>

              {/* 인증 링크 발송 완료 안내 */}
              {verificationSent && (
                <div className="mt-5 p-4 rounded-2xl bg-[#e8f3ff]/80 border border-[#3182f6]/30 text-[#191f28] animate-fade-up">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-[#3182f6] text-white flex items-center justify-center shrink-0 mt-0.5">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14.5px] font-bold text-[#191f28] break-keep">
                        {unauthTab === 'view'
                          ? '이메일로 내 알림 목록 연결 링크를 보냈습니다.'
                          : '이메일로 인증 링크를 보냈습니다. 링크를 클릭하면 알림이 시작됩니다.'}
                      </p>
                      <p className="mt-1 text-[12.5px] text-[#4e5968] leading-relaxed break-keep">
                        메일함({emailInput})에서 링크를 누르면 이 기기에서 곧바로 내 알림 목록 전체를 확인하고 편집할 수 있습니다.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 이미 인증된 이메일에 키워드가 즉시 추가된 경우 안내 */}
              {instantAddedMessage && (
                <div className="mt-5 p-4 rounded-2xl bg-[#e8faf3] border border-[#03b26c]/30 text-[#191f28] animate-fade-up">
                  <div className="flex items-start gap-2.5">
                    <Check className="h-5 w-5 text-[#03b26c] shrink-0 mt-0.5" />
                    <div className="min-w-0 space-y-2">
                      <p className="text-[14px] font-bold text-[#03b26c] break-keep">
                        {instantAddedMessage}
                      </p>
                      <button
                        type="button"
                        onClick={handleRequestManageLink}
                        className="text-[12.5px] font-semibold text-[#3182f6] hover:underline cursor-pointer"
                      >
                        이 기기에서 내 알림 목록 전체 보기 · 편집 링크 메일로 받기 &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* =========================================================
           2. Authenticated (GET /api/my-keywords 성공 시):
              "{email}님이 받고 있는 알림" + 내 알림 목록(매칭 공연 미리보기 및 개별 삭제) + 새 키워드 추가 폼
           ========================================================= */
        <div className="space-y-6 animate-fade-up">
          {/* 상단 구독자 상태 카드 & 기기에서 연결 해제 */}
          <Card className="border-[#e5e8eb] shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="h-11 w-11 rounded-2xl bg-[#e8f3ff] text-[#3182f6] flex items-center justify-center shrink-0">
                  <Bell className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-[17px] sm:text-[19px] font-extrabold text-[#191f28] break-all sm:break-keep">
                    {userEmail}님이 받고 있는 알림
                  </h2>
                  <p className="text-[12.5px] text-[#8b95a1] mt-0.5 break-keep">
                    매일 오전 9시·오후 6시에 새로 등록된 공연을 확인해 메일로 보내드립니다.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#e5e8eb] bg-white text-[12.5px] font-semibold text-[#6b7684] hover:text-[#191f28] hover:border-[#b0b8c1] whitespace-nowrap transition-all cursor-pointer"
                  title="현재 브라우저에서만 로그아웃합니다. 이메일 알림은 계속 발송됩니다."
                >
                  <Unplug className="h-3.5 w-3.5 shrink-0" />
                  기기에서 연결 해제
                </button>

                <button
                  type="button"
                  onClick={handleDeleteAllData}
                  disabled={deletingAll}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#f04452]/30 bg-[#fff5f5] text-[12.5px] font-semibold text-[#f04452] hover:bg-[#ffebeb] hover:border-[#f04452] whitespace-nowrap transition-all cursor-pointer"
                  title="서버에 저장된 이메일과 모든 등록 키워드를 영구 삭제합니다."
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  {deletingAll ? '삭제 중...' : '서버에서 완전 삭제'}
                </button>
              </div>
            </CardContent>
          </Card>

          {/* 내 알림 목록 (등록된 키워드 + 키워드별 현재 매칭 공연 보기) */}
          <Card className="border-[#e5e8eb] shadow-xs">
            <CardHeader className="p-5 sm:p-6 pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-[16px] font-bold text-[#191f28] flex items-center gap-1.5 whitespace-nowrap">
                <ListChecks className="h-4.5 w-4.5 text-[#3182f6] shrink-0" />
                <span>내 알림 목록</span>
                <span className="ml-1 text-[14px] font-semibold text-[#3182f6]">
                  {keywords.length}개
                </span>
              </CardTitle>
            </CardHeader>

            <CardContent className="p-5 sm:p-6 pt-0">
              {keywords.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-[#e5e8eb] rounded-2xl bg-[#f9fafb]/60">
                  <Bell className="h-7 w-7 text-[#b0b8c1] mx-auto mb-2" />
                  <p className="text-[14.5px] font-semibold text-[#4e5968]">
                    현재 등록된 알림 키워드가 없습니다
                  </p>
                  <p className="mt-1 text-[12.5px] text-[#8b95a1]">
                    아래 입력창에서 소식을 받고 싶은 작곡가, 연주자, 곡명을 추가해 보세요.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[#f2f4f6] border border-[#f2f4f6] rounded-2xl overflow-hidden bg-white">
                  {keywords.map((kw) => {
                    const matchedConcerts = matchedByKeyword[kw] || []
                    const isExpanded = expandedKeyword === kw

                    return (
                      <li key={kw} className="transition-colors">
                        <div className="flex items-center justify-between gap-2 px-4 py-3.5 hover:bg-[#f9fafb]">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedKeyword(isExpanded ? null : kw)
                            }
                            className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                          >
                            <span className="h-2 w-2 rounded-full bg-[#3182f6] shrink-0" />
                            <span className="text-[15px] font-bold text-[#191f28] truncate">
                              {kw}
                            </span>
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#e8f3ff] text-[#3182f6] shrink-0 whitespace-nowrap">
                              공연 {matchedConcerts.length}건
                              <ChevronDown
                                className={`h-3 w-3 transition-transform ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </span>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <Link
                              to={`/?q=${encodeURIComponent(kw)}`}
                              className="inline-flex items-center gap-0.5 px-2.5 py-1.5 rounded-xl text-[12px] font-semibold text-[#4e5968] hover:text-[#3182f6] hover:bg-[#e8f3ff]/60 whitespace-nowrap transition-colors"
                            >
                              <span>검색</span>
                              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                            </Link>
                            <button
                              type="button"
                              disabled={deletingKeyword === kw}
                              onClick={() => handleDeleteKeyword(kw)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[12px] font-semibold text-[#8b95a1] hover:text-[#f04452] hover:bg-[#fff0f1] whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                              aria-label={`${kw} 알림 삭제`}
                            >
                              <Trash2 className="h-3.5 w-3.5 shrink-0" />
                              <span>{deletingKeyword === kw ? '삭제 중' : '삭제'}</span>
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 bg-[#f9fafb]/80 border-t border-[#f2f4f6] space-y-2 animate-fade-up">
                            {matchedConcerts.length === 0 ? (
                              <p className="text-[12.5px] text-[#8b95a1] py-2">
                                현재 진행·예정인 &lsquo;{kw}&rsquo; 관련 공연이 없습니다. 새 공연이 등록되면 이메일로 바로 알려드릴게요.
                              </p>
                            ) : (
                              <>
                                <div className="space-y-1.5">
                                  {matchedConcerts.slice(0, 5).map((concert) => (
                                    <Link
                                      key={concert.id}
                                      to={`/concerts/${concert.id}`}
                                      className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-[#e5e8eb] hover:border-[#3182f6] transition-all group"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 mb-1">
                                          <StatePill state={concert.state} />
                                          <span className="text-[12px] font-bold text-[#191f28] truncate group-hover:text-[#3182f6]">
                                            {concert.title}
                                          </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-[#6b7684]">
                                          <span className="flex items-center gap-1 truncate">
                                            <MapPin className="h-3 w-3 text-[#8b95a1] shrink-0" />
                                            {concert.venue}
                                          </span>
                                          <span className="flex items-center gap-1 shrink-0">
                                            <Calendar className="h-3 w-3 text-[#8b95a1] shrink-0" />
                                            {formatPeriod(concert.from, concert.to)}
                                          </span>
                                        </div>
                                      </div>
                                      <ChevronRight className="h-4 w-4 text-[#8b95a1] group-hover:text-[#3182f6] shrink-0" />
                                    </Link>
                                  ))}
                                </div>
                                {matchedConcerts.length > 5 && (
                                  <Link
                                    to={`/?q=${encodeURIComponent(kw)}`}
                                    className="block text-center text-[12px] font-semibold text-[#3182f6] hover:underline pt-1"
                                  >
                                    외 {matchedConcerts.length - 5}건의 공연 전체 보기 &rarr;
                                  </Link>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* 새 키워드 추가 폼 */}
          <Card className="border-[#e5e8eb] shadow-xs">
            <CardHeader className="p-5 sm:p-6 pb-3">
              <CardTitle className="text-[16px] font-bold text-[#191f28] flex items-center gap-1.5">
                <Plus className="h-4 w-4 text-[#3182f6] shrink-0" />
                새 알림 키워드 추가
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 sm:p-6 pt-0">
              <form onSubmit={(e) => handleAddKeyword(e)} className="flex gap-2">
                <Input
                  type="text"
                  value={newKeywordInput}
                  onChange={(e) => setNewKeywordInput(e.target.value)}
                  placeholder="예: 베토벤, 모차르트, 쇼팽, 예술의전당"
                  className="h-11 text-[14.5px]"
                />
                <Button
                  type="submit"
                  disabled={addingKeyword}
                  className="h-11 px-5 rounded-xl font-semibold whitespace-nowrap shrink-0"
                >
                  {addingKeyword ? '추가 중...' : '추가하기'}
                </Button>
              </form>

              {/* 빠른 추천 키워드 */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#8b95a1] mr-1 whitespace-nowrap">
                  <Sparkles className="h-3 w-3 text-[#3182f6] shrink-0" />
                  추천 키워드
                </span>
                {SUGGESTED_KEYWORDS.filter((w) => !keywords.includes(w)).map(
                  (word) => (
                    <button
                      key={word}
                      type="button"
                      disabled={addingKeyword}
                      onClick={() => handleAddKeyword(null, word)}
                      className="text-[12px] px-2.5 py-1 rounded-full bg-[#f9fafb] text-[#4e5968] border border-[#e5e8eb] hover:border-[#3182f6] hover:text-[#3182f6] whitespace-nowrap shrink-0 transition-all cursor-pointer"
                    >
                      + {word}
                    </button>
                  )
                )}
              </div>

              {manageNotice && (
                <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-[#03b26c] animate-fade-up">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>{manageNotice}</span>
                </p>
              )}

              {manageError && (
                <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-[#f04452] animate-fade-up">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{manageError}</span>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      </div>
    </main>
  )
}
