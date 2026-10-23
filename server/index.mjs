// Vega Video 控制台 - 本地代理（零依赖）
// 职责：静态托管 dist/ + 把 /api/* 转发给共享核心 handleRequest
// 凭据来源优先级：请求 header（前端设置页传入）> 环境变量
//   环境变量：TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY / VEGA_SUB_APP_ID
//   header：x-vega-secret-id / x-vega-secret-key / x-vega-sub-app-id
import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleRequest } from '../cloud-functions/api/vod.js'

const PORT = Number(process.env.PORT || 8088)

// ---------- 静态托管 dist ----------
const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
}
function serveStatic(pathname, res) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '')
  let file = join(DIST, rel)
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
  if (!existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('未找到 dist/，请先执行 npm install && npm run build')
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] || 'application/octet-stream',
    'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000',
  })
  createReadStream(file).pipe(res)
}

const readBody = (req) =>
  new Promise((resolve) => {
    let d = ''
    req.on('data', (c) => (d += c))
    req.on('end', () => {
      try { resolve(JSON.parse(d || '{}')) } catch { resolve({}) }
    })
  })

const readRawBody = (req) =>
  new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const pathname = url.pathname

  // 非 /api 请求：托管打包好的前端（dist），同事无需 npm install 即可使用
  if (!pathname.startsWith('/api/') && req.method === 'GET') return serveStatic(pathname, res)

  const { status, data } = await handleRequest({
    method: req.method,
    pathname,
    searchParams: url.searchParams,
    headers: req.headers,
    env: process.env,
    readJsonBody: () => readBody(req),
    readRawBody: () => readRawBody(req),
  })

  if (status === 204) { res.writeHead(204); return res.end() }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data ?? {}))
})

server.listen(PORT, () => {
  const envLoaded = process.env.TENCENTCLOUD_SECRET_ID && process.env.TENCENTCLOUD_SECRET_KEY && process.env.VEGA_SUB_APP_ID
  console.log(`[vega-proxy] listening on http://localhost:${PORT}`)
  console.log(`[vega-proxy] 浏览器打开 http://localhost:${PORT} 使用控制台`)
  console.log(`[vega-proxy] env credentials: ${envLoaded ? 'LOADED' : 'none (use in-app 连接设置)'}`)
})
