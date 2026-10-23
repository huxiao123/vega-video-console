/**
 * 前端预览用：把代理请求体转成实际发往 VOD 的 CreateAigcVideoTask 参数。
 * 拼装规则与 server/index.mjs 中 `/api/task` POST + buildExtInfo 保持一致，改一边记得同步另一边。
 */
export interface ProxyTaskBody {
  modelVersion: string
  prompt: string
  fileInfos?: { category: string; url: string; usage?: string }[]
  outputConfig: Record<string, unknown>
  seed?: number
  wandVega?: Record<string, unknown>
  additional?: Record<string, unknown>
}

export function buildExtInfo(wandVega: Record<string, unknown> = {}, additional: Record<string, unknown> = {}) {
  const ext: Record<string, string> = {}
  if (Object.keys(wandVega).length) ext.WandVegaParameters = JSON.stringify(wandVega)
  if (Object.keys(additional).length) ext.AdditionalParameters = JSON.stringify(additional)
  return Object.keys(ext).length ? JSON.stringify(ext) : undefined
}

export function toVodPayload(body: ProxyTaskBody, subAppId: string) {
  const payload: Record<string, unknown> = {
    SubAppId: subAppId ? Number(subAppId) : '<SubAppId>',
    ModelName: 'wand-vega-video',
    ModelVersion: body.modelVersion,
    Prompt: body.prompt || '',
  }
  if (body.fileInfos?.length) {
    payload.FileInfos = body.fileInfos.map((f) => {
      const item: Record<string, string> = { Type: 'Url', Category: f.category, Url: f.url }
      if (f.usage) item.Usage = f.usage
      return item
    })
  }
  payload.OutputConfig = body.outputConfig
  if (body.seed != null) payload.Seed = body.seed
  const ext = buildExtInfo(body.wandVega, body.additional)
  if (ext) payload.ExtInfo = ext
  return payload
}
