import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bell,
  ChevronLeft,
  Trash2,
  Check,
  Mail,
  Plus,
  Sparkles,
  Unplug,
  AlertCircle,
} from 'lucide-react'
import { Button } from '../components/ui/button.jsx'
import { Input } from '../components/ui/input.jsx'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx'
import {
  subscribeKeyword,
  getMyKeywords,
  addMyKeyword,
  deleteMyKeyword,
  disconnectDevice,
} from '../lib/api.js'

const SUGGESTED_KEYWORDS = [
  '베토벤 9번',
  '조성진',
  '임윤찬',
  '라흐마니노프 피아노 협주곡 2번',
  '말러',
  '예술의전당',
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

  // Unauthenticated form state
  const [emailInput, setEmailInput] = useState('')
  const [keywordInput, setKeywordInput] = useState(initialQuery)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(
    verifyError ? '유효하지 않거나 만료된 인증 링크입니다. 다시 신청해 주세요.' : ''
  )
  const [verificationSent, setVerificationSent] = useState(false)
  const [instantAddedMessage, setInstantAddedMessage] = useState('')

  // Authenticated add/delete state
  const [newKeywordInput, setNewKeywordInput] = useState(initialQuery)
  const [addingKeyword, setAddingKeyword] = useState(false)
  const [deletingKeyword, setDeletingKeyword] = useState('')
  const [manageNotice, setManageNotice] = useState('')
  const [manageError, setManageError] = useState('')

  useEffect(() => {
    document.title = 'Cloudcon · 이메일 공연 알림'
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
    if (!keyword) {
      setFormError('알림을 받을 아티스트, 곡명 또는 공연장 키워드를 입력해 주세요.')
      return
    }

    setSubmitting(true)
    try {
      const res = await subscribeKeyword({ email, keyword })
      if (!res.verified || res.status === 'verification_sent') {
        setVerificationSent(true)
        setKeywordInput('')
      } else {
        // 이미 인증된 이메일인 경우 바로 추가 완료 응답
        setInstantAddedMessage(
          `'${keyword}' 알림 키워드가 ${email} 앞으로 즉시 추가되었습니다.`
        )
        setKeywordInput('')
      }
      if (params.has('q') || params.has('verify')) {
        setParams({}, { replace: true })
      }
    } catch (err) {
      setFormError(err.message || '알림 신청 처리 중 오류가 발생했습니다.')
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

  return (
    <main className="mx-auto max-w-[720px] px-6 py-8 sm:py-12">
      {/* 상단 헤더 */}
      <div className="mb-7">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-[#6b7684] hover:text-[#191f28] mb-2.5 transition-colors whitespace-nowrap"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" /> 검색으로 돌아가기
        </Link>
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
           1. Unauthenticated (401): 이메일 + 키워드 뉴스레터 구독 폼
           ========================================================= */
        <Card className="border-[#e5e8eb] shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
          <CardHeader className="p-6 sm:p-7 pb-3">
            <div className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#3182f6] bg-[#e8f3ff] px-3 py-1 rounded-full w-fit mb-2 whitespace-nowrap">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              무료 이메일 소식 받기
            </div>
            <CardTitle className="text-[19px] sm:text-[21px] font-extrabold text-[#191f28] break-keep">
              어떤 클래식 무대를 기다리시나요?
            </CardTitle>
            <p className="text-[13.5px] text-[#6b7684] leading-relaxed break-keep">
              별도의 복잡한 절차 없이 이메일 주소와 키워드만 입력하면 새 공연 오픈 시 메일로 알려드려요.
            </p>
          </CardHeader>

          <CardContent className="p-6 sm:p-7 pt-2">
            <form onSubmit={handleSubscribeSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="sub-email"
                  className="block text-[13px] font-semibold text-[#333d4b] mb-1.5"
                >
                  받을 이메일 주소
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

              <div>
                <label
                  htmlFor="sub-keyword"
                  className="block text-[13px] font-semibold text-[#333d4b] mb-1.5"
                >
                  알림 받을 키워드 (아티스트 · 곡명 · 공연장)
                </label>
                <Input
                  id="sub-keyword"
                  type="text"
                  required
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="예: 베토벤 9번, 조성진, 임윤찬, 예술의전당"
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
                {submitting ? '전송 중...' : '이메일로 공연 알림 받기'}
              </Button>
            </form>

            {/* 인증 링크 발송 완료 안내 */}
            {verificationSent && (
              <div className="mt-5 p-4 rounded-2xl bg-[#e8f3ff]/80 border border-[#3182f6]/30 text-[#191f28] animate-in fade-in">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-[#3182f6] text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-bold text-[#191f28] break-keep">
                      이메일로 인증 링크를 보냈습니다. 링크를 클릭하면 알림이 시작됩니다.
                    </p>
                    <p className="mt-1 text-[12.5px] text-[#4e5968] leading-relaxed break-keep">
                      메일함({emailInput})에서 인증 링크를 누르면 이 기기에서 곧바로 알림 키워드를 관리할 수 있습니다.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 이미 인증된 이메일에 키워드가 즉시 추가된 경우 안내 */}
            {instantAddedMessage && (
              <div className="mt-5 p-4 rounded-2xl bg-[#e8faf3] border border-[#03b26c]/30 text-[#191f28] animate-in fade-in">
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
                      이 기기에서 알림 목록 전체 보기 · 편집 링크 메일로 받기 &rarr;
                    </button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* =========================================================
           2. Authenticated (GET /api/my-keywords 성공 시):
              "{email}님이 받고 있는 알림" + 키워드 목록(개별 삭제) + 새 키워드 추가 폼 + "기기에서 연결 해제"
           ========================================================= */
        <div className="space-y-6 animate-in fade-in duration-300">
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

              <button
                type="button"
                onClick={handleDisconnect}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#e5e8eb] bg-white text-[12.5px] font-semibold text-[#6b7684] hover:text-[#f04452] hover:border-[#f04452]/40 hover:bg-[#fff0f1]/50 whitespace-nowrap shrink-0 transition-all self-start sm:self-auto cursor-pointer"
              >
                <Unplug className="h-3.5 w-3.5 shrink-0" />
                기기에서 연결 해제
              </button>
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
                  placeholder="예: 베토벤 9번, 조성진, 말러 교향곡, 롯데콘서트홀"
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
                <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-[#03b26c] animate-in fade-in">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>{manageNotice}</span>
                </p>
              )}

              {manageError && (
                <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-[#f04452] animate-in fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{manageError}</span>
                </p>
              )}
            </CardContent>
          </Card>

          {/* 등록된 키워드 목록 (개별 삭제 버튼) */}
          <Card className="border-[#e5e8eb] shadow-xs">
            <CardHeader className="p-5 sm:p-6 pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-[16px] font-bold text-[#191f28] whitespace-nowrap">
                등록된 알림 키워드{' '}
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
                    위 입력창에서 소식을 받고 싶은 연주자나 곡명을 추가해 보세요.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[#f2f4f6] border border-[#f2f4f6] rounded-2xl overflow-hidden bg-white">
                  {keywords.map((kw) => (
                    <li
                      key={kw}
                      className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-[#f9fafb] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="h-2 w-2 rounded-full bg-[#3182f6] shrink-0" />
                        <span className="text-[15px] font-bold text-[#191f28] truncate">
                          {kw}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={deletingKeyword === kw}
                        onClick={() => handleDeleteKeyword(kw)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[12.5px] font-semibold text-[#8b95a1] hover:text-[#f04452] hover:bg-[#fff0f1] whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                        aria-label={`${kw} 알림 삭제`}
                      >
                        <Trash2 className="h-3.5 w-3.5 shrink-0" />
                        <span>{deletingKeyword === kw ? '삭제 중' : '삭제'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
}
