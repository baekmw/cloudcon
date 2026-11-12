import { useSyncExternalStore } from 'react'
import { getConcert, getConcerts } from './api.js'
import { matchConcert } from './match.js'

const STORAGE_KEY = 'cloudcon.alerts.v1'

const initial = {
  watches: [],
  inbox: [],
  seenIds: [],
  bootstrapped: false,
  lastScanAt: null,
  lastError: null,
}

function load() {
  if (typeof localStorage === 'undefined') return initial
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '')
    return { ...initial, ...parsed }
  } catch {
    return initial
  }
}

let snapshot = load()
const listeners = new Set()
let scanning = null

function emit(next) {
  snapshot = next
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  listeners.forEach((listener) => listener())
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot() {
  return snapshot
}

export function useAlerts() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function addWatch(kind, query) {
  const trimmed = query.trim()
  if (trimmed.length < 2) return { ok: false, error: '두 글자 이상 입력해 주세요.' }
  if (trimmed.length > 40) return { ok: false, error: '40자 안으로 입력해 주세요.' }

  const current = getSnapshot()
  const exists = current.watches.some(
    (watch) => watch.kind === kind && watch.query.toLowerCase() === trimmed.toLowerCase(),
  )
  if (exists) return { ok: false, error: '이미 같은 알림이 있습니다.' }

  const watch = {
    id: crypto.randomUUID(),
    kind,
    query: trimmed,
    createdAt: Date.now(),
  }
  emit({ ...current, watches: [watch, ...current.watches] })
  return { ok: true, watch }
}

export function removeWatch(id) {
  const current = getSnapshot()
  emit({
    ...current,
    watches: current.watches.filter((watch) => watch.id !== id),
    inbox: current.inbox.filter((item) => item.watchId !== id),
  })
}

export function markRead(id) {
  const current = getSnapshot()
  emit({
    ...current,
    inbox: current.inbox.map((item) => (item.id === id ? { ...item, read: true } : item)),
  })
}

export function markAllRead() {
  const current = getSnapshot()
  emit({
    ...current,
    inbox: current.inbox.map((item) => ({ ...item, read: true })),
  })
}

function notify(item) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const notification = new Notification('Cloudcon · 새 클래식 공연', {
      body: item.body,
      tag: item.id,
    })
    notification.onclick = () => {
      window.focus()
      window.location.href = `/concerts/${item.concertId}`
    }
  } catch {
    // The inbox still keeps the item when the browser blocks notifications.
  }
}

async function runScan() {
  const data = await getConcerts()
  if (!data.configured) return { ok: false, reason: 'unconfigured' }

  const ids = data.concerts.map((concert) => concert.id)
  const current = getSnapshot()

  if (!current.bootstrapped) {
    emit({
      ...getSnapshot(),
      seenIds: ids,
      bootstrapped: true,
      lastScanAt: Date.now(),
      lastError: null,
    })
    return { ok: true, found: 0, bootstrapped: true }
  }

  const seen = new Set(current.seenIds)
  const fresh = data.concerts.filter((concert) => !seen.has(concert.id))
  const notices = []

  for (const concert of fresh) {
    const watches = getSnapshot().watches
    if (!watches.length) continue
    let detail = concert
    try {
      const response = await getConcert(concert.id)
      detail = response.concert
    } catch {
      detail = concert
    }
    for (const watch of watches) {
      const reason = matchConcert(detail, watch.kind, watch.query)
      if (!reason) continue
      notices.push({
        id: `${concert.id}:${watch.id}`,
        concertId: concert.id,
        watchId: watch.id,
        title: detail.title,
        body: `${watch.query} · ${detail.title} (${reason})`,
        reason,
        query: watch.query,
        at: Date.now(),
        read: false,
      })
    }
  }

  const latest = getSnapshot()
  const known = new Set(latest.inbox.map((item) => item.id))
  const novel = notices.filter((item) => !known.has(item.id))
  emit({
    ...latest,
    seenIds: [...new Set([...latest.seenIds, ...ids])],
    inbox: [...novel, ...latest.inbox].slice(0, 50),
    bootstrapped: true,
    lastScanAt: Date.now(),
    lastError: null,
  })
  novel.forEach(notify)
  return { ok: true, found: novel.length }
}

export function scanForNewConcerts() {
  if (scanning) return scanning
  scanning = runScan()
    .catch((error) => {
      emit({ ...getSnapshot(), lastScanAt: Date.now(), lastError: error.message })
      return { ok: false, reason: error.message }
    })
    .finally(() => {
      scanning = null
    })
  return scanning
}
