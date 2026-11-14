async function readJson(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || '요청 처리에 실패했습니다.')
    error.status = response.status
    throw error
  }
  return data
}

export function getConcerts({ refresh = false } = {}) {
  const query = refresh ? '?refresh=1' : ''
  return fetch(`/api/concerts${query}`).then(readJson)
}

export function getConcert(id) {
  return fetch(`/api/concerts/${encodeURIComponent(id)}`).then(readJson)
}

export function fetchConcertProgram(id, { forceAI = false, apiKey = '' } = {}) {
  const query = forceAI ? '?force=1' : ''
  return fetch(`/api/concerts/${encodeURIComponent(id)}/program${query}`, {
    method: apiKey ? 'POST' : 'GET',
    headers: apiKey ? { 'Content-Type': 'application/json' } : undefined,
    body: apiKey ? JSON.stringify({ apiKey, forceAI }) : undefined,
  }).then(readJson)
}

export function findMatches(kind, query) {
  const params = new URLSearchParams({ kind, q: query })
  return fetch(`/api/matches?${params}`).then(readJson)
}

/**
 * 이메일 + 키워드 알림 구독 신청 (POST /api/subscribe)
 */
export function subscribeKeyword({ email, keyword, sendMagicLink = false }) {
  return fetch('/api/subscribe', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, keyword, sendMagicLink }),
  }).then(readJson)
}

/**
 * 현재 기기의 쿠키(manageToken) 기반 구독 정보 조회 (GET /api/my-keywords)
 */
export async function getMyKeywords() {
  const response = await fetch('/api/my-keywords', {
    method: 'GET',
    credentials: 'include',
  })
  if (response.status === 401) {
    return { authenticated: false, email: '', keywords: [] }
  }
  const data = await readJson(response)
  return {
    authenticated: true,
    email: data.email || '',
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
  }
}

/**
 * 인증된 기기에서 새 키워드 추가 (POST /api/my-keywords)
 */
export function addMyKeyword(keyword) {
  return fetch('/api/my-keywords', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword }),
  }).then(readJson)
}

/**
 * 인증된 기기에서 키워드 개별 삭제 (DELETE /api/my-keywords)
 */
export function deleteMyKeyword(keyword) {
  return fetch('/api/my-keywords', {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword }),
  }).then(readJson)
}

/**
 * 기기에서 연결 해제 (POST /api/disconnect)
 */
export function disconnectDevice() {
  return fetch('/api/disconnect', {
    method: 'POST',
    credentials: 'include',
  }).then(readJson)
}

/**
 * 공개 트래킹: 방문자 집계 (POST /api/track/visit)
 */
export function trackVisit() {
  return fetch('/api/track/visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => {})
}

/**
 * 공개 트래킹: 검색어 집계 (POST /api/track/search)
 */
export function trackSearch(query) {
  const clean = String(query || '').trim()
  if (clean.length <= 1) return Promise.resolve()
  return fetch('/api/track/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: clean }),
  }).catch(() => {})
}

// =========================================================================
// 관리자(Admin) 전용 API (/api/admin/*)
// =========================================================================

export function adminLogin(password) {
  return fetch('/api/admin/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  }).then(readJson)
}

export function adminLogout() {
  return fetch('/api/admin/logout', {
    method: 'POST',
    credentials: 'include',
  }).then(readJson)
}

export function getAdminDashboard() {
  return fetch('/api/admin/dashboard', {
    method: 'GET',
    credentials: 'include',
  }).then(readJson)
}

export function runAdminBatch() {
  return fetch('/api/admin/run-batch', {
    method: 'POST',
    credentials: 'include',
  }).then(readJson)
}

export function getAdminSubscribers() {
  return fetch('/api/admin/subscribers', {
    method: 'GET',
    credentials: 'include',
  }).then(readJson)
}

export function deleteAdminSubscriber(email) {
  return fetch(`/api/admin/subscribers/${encodeURIComponent(email)}`, {
    method: 'DELETE',
    credentials: 'include',
  }).then(readJson)
}

export function toggleAdminSubscriberVerify(email, verified) {
  return fetch(`/api/admin/subscribers/${encodeURIComponent(email)}/verify`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(typeof verified === 'boolean' ? { verified } : {}),
  }).then(readJson)
}

export function getAdminCache() {
  return fetch('/api/admin/cache', {
    method: 'GET',
    credentials: 'include',
  }).then(readJson)
}

export function updateAdminCache(concertId, payload) {
  return fetch(`/api/admin/cache/${encodeURIComponent(concertId)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(readJson)
}
