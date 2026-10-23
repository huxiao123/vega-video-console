// EdgeOne Cloud Functions 入口（catch-all）：承接所有 /api/* 请求
// 文件即路由：cloud-functions/api/[[default]].js -> /api/*
import { handleRequest } from './vod.js'

export default async function onRequest(context) {
  const request = context.request
  const url = new URL(request.url)
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
