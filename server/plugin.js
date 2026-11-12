import { createKopis } from './kopis.js'
import { getConcertProgram, getAllProgramsCache } from './programExtractor.js'

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

export function kopisPlugin(serviceKey) {
  const api = createKopis(serviceKey)

  async function handle(req, res) {
    const url = new URL(req.url, 'http://cloudcon.local')

    // Program extraction endpoint (GET or POST)
    const programMatch = url.pathname.match(/^\/api\/concerts\/([^/]+)\/program$/)
    if (programMatch) {
      const concertId = decodeURIComponent(programMatch[1])
      try {
        const detail = await api.concert(concertId)
        let body = {}
        if (req.method === 'POST') {
          body = await parseJsonBody(req)
        }
        const forceAI = url.searchParams.get('force') === '1' || Boolean(body.forceAI)
        const apiKey = body.apiKey || url.searchParams.get('key') || ''
        const result = await getConcertProgram(detail.concert, { forceAI, apiKey })
        send(res, 200, { ok: true, concertId, ...result })
      } catch (error) {
        send(res, error.status || 500, { ok: false, error: error.message, programs: [] })
      }
      return
    }

    if (req.method !== 'GET') {
      send(res, 405, { error: 'GET만 지원합니다.' })
      return
    }

    if (url.pathname === '/api/status') {
      send(res, 200, await api.status())
      return
    }

    if (url.pathname === '/api/concerts') {
      try {
        send(res, 200, await api.concerts(url.searchParams.get('refresh') === '1'))
      } catch (error) {
        send(res, 502, { configured: true, concerts: [], error: error.message })
      }
      return
    }

    if (url.pathname === '/api/matches') {
      try {
        send(res, 200, await api.matches(url.searchParams.get('kind'), url.searchParams.get('q')))
      } catch (error) {
        send(res, error.status || 502, { error: error.message, matches: [], complete: true })
      }
      return
    }

    const detail = url.pathname.match(/^\/api\/concerts\/([^/]+)$/)
    if (detail) {
      try {
        const concertId = decodeURIComponent(detail[1])
        const concertRes = await api.concert(concertId)
        const cache = getAllProgramsCache()
        const cachedPrograms = cache[concertId]

        if (cachedPrograms) {
          send(res, 200, {
            configured: true,
            concert: {
              ...concertRes.concert,
              programs: cachedPrograms,
              programPending: false,
              programSource: 'cache',
            },
          })
        } else {
          // If not in cache, return concert immediately without blocking on Gemini AI!
          const isUpcoming = concertRes.concert.state === '공연예정'
          send(res, 200, {
            configured: true,
            concert: {
              ...concertRes.concert,
              programs: null,
              programPending: isUpcoming,
              programSource: 'pending',
            },
          })
        }
      } catch (error) {
        send(res, error.status || 502, { error: error.message })
      }
      return
    }

    send(res, 404, { error: '없는 API입니다.' })
  }

  const attach = (server) => {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next()
      handle(req, res).catch((error) => {
        if (res.writableEnded) return
        send(res, 500, { error: error.message || 'API 오류' })
      })
    })
  }

  return {
    name: 'kopis-api',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}
