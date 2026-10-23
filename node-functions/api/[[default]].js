// EdgeOne Node Functions 入口（catch-all）：承接所有 /api/* 请求
// 文件即路由：node-functions/api/[[default]].js -> /api/*
// 注意：国内站 Node Functions 的 context.request 是 Node IncomingMessage 风格
//   - request.url 是相对路径（如 /api/task）
//   - request.headers 是普通对象（无 .entries()）
//   - body 需用流读取（无 .json()/.arrayBuffer()）
import { handleRequest } from './vod.js'

// 流式读取 body（Node IncomingMessage 风格）
function readStream(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', (c) => chunks.push(Buffer.from(c)))
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

export default async function onRequest(context) {
  const request = context.request || context
  // request.url 可能是相对路径（如 /api/task），带 base 才能解析
  const url = new URL(request.url || '/', 'http://localhost')

  // headers：兼容普通对象（IncomingMessage，key 小写）与 Web Headers 对象
  let headers = {}
  const h = request.headers
  if (h) {
    if (typeof h.entries === 'function') {
      for (const [k, v] of h.entries()) headers[k] = v
    } else {
      headers = Object.assign({}, h)
    }
  }

  const method = (request.method || 'GET').toUpperCase()

  // 惰性读取 body（缓存，避免重复消费流）
  let cachedBody
  const readRawBody = () => {
    if (cachedBody) return cachedBody
    if (request && typeof request.arrayBuffer === 'function') {
      cachedBody = request.arrayBuffer().then((buf) => Buffer.from(buf))
    } else if (request && request.body && Buffer.isBuffer(request.body)) {
      cachedBody = Promise.resolve(request.body)
    } else if (request && typeof request.on === 'function') {
      cachedBody = readStream(request)
    } else {
      cachedBody = Promise.resolve(Buffer.alloc(0))
    }
    return cachedBody
  }

  const { status, data } = await handleRequest({
    method,
    pathname: url.pathname,
    searchParams: url.searchParams,
    headers,
    env: context.env || {},
    readJsonBody: async () => {
      const buf = await readRawBody()
      try { return JSON.parse(buf.toString('utf8') || '{}') } catch { return {} }
    },
    readRawBody,
  })

  if (status === 204) return new Response(null, { status: 204 })
  return new Response(JSON.stringify(data ?? {}), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
