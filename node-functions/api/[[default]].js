// EdgeOne Cloud Functions 入口（catch-all）：承接所有 /api/* 请求
// 文件即路由：cloud-functions/api/[[default]].js -> /api/*
import { handleRequest } from './vod.js'

export default async function onRequest(context) {
  const request = context.request
  // request.url 在 EdgeOne 运行时可能是相对路径（如 /api/task），需带 base 才能解析
  const url = new URL(request.url, 'http://localhost')
  const headers = Object.fromEntries(request.headers.entries())

  const { status, data } = await handleRequest({
    method: request.method,
    pathname: url.pathname,
    searchParams: url.searchParams,
    headers,
    env: context.env || {},
    readJsonBody: async () => {
      try { return await request.json() } catch { return {} }
    },
    readRawBody: async () => Buffer.from(await request.arrayBuffer()),
  })

  if (status === 204) return new Response(null, { status: 204 })
  return new Response(JSON.stringify(data ?? {}), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
