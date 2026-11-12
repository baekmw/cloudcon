async function readJson(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || 'KOPIS 요청에 실패했습니다.')
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
