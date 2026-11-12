export const AREAS = [
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '경기도',
  '강원특별자치도',
  '강원도',
  '충청북도',
  '충청남도',
  '전북특별자치도',
  '전라북도',
  '전라남도',
  '경상북도',
  '경상남도',
  '제주특별자치도',
]

export function formatPeriod(from, to) {
  if (!from) return '일정 미정'
  if (!to || from === to) return from
  return `${from} – ${to}`
}

export function formatWhen(timestamp) {
  if (!timestamp) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp)
}

export function parseKopisDate(value) {
  const [year, month, day] = String(value || '').split('.').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

export function overlapsRange(concert, from, to) {
  const start = parseKopisDate(concert.from)
  const end = parseKopisDate(concert.to) || start
  if (!start || !end) return true
  if (from && end < from) return false
  if (to && start > to) return false
  return true
}
