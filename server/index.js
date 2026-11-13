import 'dotenv/config'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { kopisPlugin } from './plugin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../dist')
const port = Number(process.env.PORT || 4000)
const serviceKey = process.env.KOPIS_API_KEY || ''

const plugin = kopisPlugin(serviceKey)

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

let apiMiddleware = null
plugin.configureServer({
  middlewares: {
    use(fn) {
      apiMiddleware = fn
    },
  },
})

const server = http.createServer((req, res) => {
  const serveStaticOrSpa = () => {
    const urlPath = (req.url || '/').split('?')[0]
    const safePath = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[\/\\])+/, '')
    let filePath = path.join(distDir, safePath)

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase()
      res.statusCode = 200
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream')
      fs.createReadStream(filePath).pipe(res)
      return
    }

    const indexHtml = path.join(distDir, 'index.html')
    if (fs.existsSync(indexHtml)) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      fs.createReadStream(indexHtml).pipe(res)
      return
    }

    res.statusCode = 404
    res.end('Not found')
  }

  if (apiMiddleware) {
    apiMiddleware(req, res, serveStaticOrSpa)
  } else {
    serveStaticOrSpa()
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`[Cloudcon] Server listening on http://0.0.0.0:${port}`)
})
