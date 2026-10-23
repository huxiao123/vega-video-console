// Vega Video 控制台 - 共享核心（本地 server 与 EdgeOne Cloud Functions 复用）
// 职责：TC3 签名、VOD API 转发、COS 上传、ExtInfo 封装、/api 路由分发
// 无 http server / Web Request 依赖：只接收纯参数，返回 { status, data }
import { createHash, createHmac } from 'node:crypto'
import https from 'node:https'

const HOST = 'vod.tencentcloudapi.com'
const SERVICE = 'vod'
const VERSION = '2018-07-17'
const ALGO = 'TC3-HMAC-SHA256'

// ---------- 凭据（优先级：请求 header > 环境变量） ----------
export function getCreds(headers = {}, env = {}) {
  const id = headers['x-vega-secret-id'] || env.TENCENTCLOUD_SECRET_ID || ''
  const key = headers['x-vega-secret-key'] || env.TENCENTCLOUD_SECRET_KEY || ''
  const sub = Number(headers['x-vega-sub-app-id'] || env.VEGA_SUB_APP_ID || 0)
  return { id: String(id || ''), key: String(key || ''), sub }
}

// ---------- 加解密工具 ----------
function sha256Hex(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex')
}
function hmacSha256(key, str) {
  return createHmac('sha256', key).update(str, 'utf8').digest()
}
function sha1Hex(str) {
  return createHash('sha1').update(str, 'utf8').digest('hex')
}
function hmacSha1(key, str) {
  return createHmac('sha1', key).update(str, 'utf8').digest('hex')
}

// TC3-HMAC-SHA256 签名
// region 可选：部分接口（如 ApplyUpload/CommitUpload）把 Region 列为必选公共参数，
// 需通过 X-TC-Region header 传并参与签名
function sign(action, payload, secretId, secretKey, region) {
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const httpRequestMethod = 'POST'
  const canonicalUri = '/'
  const canonicalQueryString = ''
  const contentType = 'application/json'
  let canonicalHeaders = `content-type:${contentType}\nhost:${HOST}\nx-tc-action:${action.toLowerCase()}\n`
  let signedHeaders = 'content-type;host;x-tc-action'
  if (region) {
    canonicalHeaders += `x-tc-region:${String(region).toLowerCase()}\n`
    signedHeaders += ';x-tc-region'
  }
  const hashedRequestPayload = sha256Hex(body)
  const canonicalRequest = [
    httpRequestMethod, canonicalUri, canonicalQueryString,
    canonicalHeaders, signedHeaders, hashedRequestPayload,
  ].join('\n')
  const credentialScope = `${date}/${SERVICE}/tc3_request`
  const stringToSign = [
    ALGO, timestamp, credentialScope, sha256Hex(canonicalRequest),
  ].join('\n')
  const secretDate = hmacSha256(`TC3${secretKey}`, date)
  const secretService = hmacSha256(secretDate, SERVICE)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = createHmac('sha256', secretSigning).update(stringToSign, 'utf8').digest('hex')
  const authorization =
    `${ALGO} Credential=${secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`
  const headers = {
    'Content-Type': contentType,
    'X-TC-Action': action,
    'X-TC-Version': VERSION,
    'X-TC-Timestamp': String(timestamp),
    'Authorization': authorization,
  }
  if (region) headers['X-TC-Region'] = region
  return { body, headers }
}

async function callVod(action, payload, secretId, secretKey, region) {
  const { body, headers } = sign(action, payload, secretId, secretKey, region)
  // 用 node:https 而非全局 fetch：EdgeOne Node Functions 运行时 fetch 外网可能挂起
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: HOST, method: 'POST', path: '/', headers, timeout: 25000 },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try { resolve(JSON.parse(data)) } catch { reject(new Error('bad response: ' + data.slice(0, 500))) }
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error('上游请求超时')))
    req.on('error', reject)
    req.end(body)
  })
}

// ---------- COS 上传（HMAC-SHA1，临时密钥） ----------
function cosPutAuth(secretId, secretKey, host, path, contentLength) {
  const now = Math.floor(Date.now() / 1000)
  const expire = now + 600
  const keyTime = `${now};${expire}`
  const signKey = hmacSha1(secretKey, keyTime)
  const headerList = 'content-length;host'
  const httpHeaders = `content-length=${contentLength}&host=${host}`
  const httpString = `put\n${path}\n\n${httpHeaders}\n`
  const sha1HttpString = sha1Hex(httpString)
  const stringToSign = `sha1\n${keyTime}\n${sha1HttpString}\n`
  const signature = hmacSha1(signKey, stringToSign)
  const authorization =
    `q-sign-algorithm=sha1&q-ak=${secretId}&q-sign-time=${keyTime}` +
    `&q-key-time=${keyTime}&q-header-list=${headerList}` +
    `&q-url-param-list=&q-signature=${signature}`
  return authorization
}

function cosPut(secretId, secretKey, token, bucket, region, path, body) {
  const host = `${bucket}.cos.${region}.myqcloud.com`
  const authorization = cosPutAuth(secretId, secretKey, host, path, Buffer.byteLength(body))
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: host,
        method: 'PUT',
        path,
        headers: {
          Authorization: authorization,
          'x-cos-security-token': token,
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 25000,
      },
      (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => {
          if (res.statusCode === 200) return resolve(d)
          reject(new Error(`COS 上传失败 ${res.statusCode}: ${d.slice(0, 300)}`))
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error('COS 上传超时')))
    req.on('error', reject)
    req.end(body)
  })
}

function mediaTypeFrom(filename, assetType) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename || '')
  if (m) return m[1].toLowerCase()
  return assetType === 'Video' ? 'mp4' : assetType === 'Audio' ? 'mp3' : 'jpg'
}

async function uploadMedia({ filename, assetType, buffer, secretId, secretKey, subAppId, region }) {
  const mediaType = mediaTypeFrom(filename, assetType)
  const regionVal = region || 'ap-guangzhou'

  const apply = await callVod('ApplyUpload', { SubAppId: subAppId, MediaType: mediaType, MediaName: filename }, secretId, secretKey, regionVal)
  const r1 = apply.Response || apply
  if (r1.Error) throw new Error(`${r1.Error.Code}: ${r1.Error.Message}`)
  const { StorageBucket, StorageRegion, MediaStoragePath, VodSessionKey, TempCertificate } = r1
  if (!StorageBucket || !MediaStoragePath || !TempCertificate?.SecretKey) {
    throw new Error('ApplyUpload 返回缺少上传元信息')
  }

  await cosPut(
    TempCertificate.SecretId,
    TempCertificate.SecretKey,
    TempCertificate.Token,
    StorageBucket,
    StorageRegion,
    MediaStoragePath,
    buffer,
  )

  const commit = await callVod('CommitUpload', { SubAppId: subAppId, VodSessionKey }, secretId, secretKey, regionVal)
  const r2 = commit.Response || commit
  if (r2.Error) throw new Error(`${r2.Error.Code}: ${r2.Error.Message}`)
  return { FileId: r2.FileId, MediaUrl: r2.MediaUrl, CoverUrl: r2.CoverUrl }
}

// ExtInfo 最终值形如 {"WandVegaParameters":"{\"EnhancePromptMode\":\"disable\"}"}
// （作为 payload 字段由 JSON.stringify 整体再转义一次，与文档示例一致）
function buildExtInfo({ wandVega = {}, additional = {} }) {
  const parts = []
  if (Object.keys(wandVega).length > 0) {
    const inner = JSON.stringify(wandVega).replace(/"/g, '\\"')
    parts.push(`"WandVegaParameters":"${inner}"`)
  }
  if (Object.keys(additional).length > 0) {
    const inner = JSON.stringify(additional).replace(/"/g, '\\"')
    parts.push(`"AdditionalParameters":"${inner}"`)
  }
  if (parts.length === 0) return undefined
  return `{${parts.join(',')}}`
}

// ---------- /api 路由分发（本地与线上共用） ----------
// 入参约定：
//   method       HTTP 方法（大写）
//   pathname     路径（如 /api/task）
//   searchParams URLSearchParams
//   headers      普通对象（key 小写）
//   env          环境变量对象（本地 process.env，线上 context.env）
//   readJsonBody 解析 JSON body（失败返回 {}），等价原 readBody
//   readRawBody  读取二进制 body 为 Buffer，等价原 readRawBody
export async function handleRequest({ method, pathname, searchParams, headers = {}, env = {}, readJsonBody, readRawBody }) {
  if (method === 'OPTIONS') return { status: 204, data: null }

  const creds = getCreds(headers, env)
  const configured = Boolean(creds.id && creds.key && creds.sub)
  const vod = (action, payload) => {
    if (!configured) throw new Error('未配置密钥：请先在「连接设置」填写 SecretId / SecretKey / SubAppId')
    return callVod(action, payload, creds.id, creds.key)
  }

  try {
    // ---------- 健康检查 / 配置 ----------
    if (pathname === '/api/health' && method === 'GET') {
      return { status: 200, data: { ok: true, configured, subAppId: creds.sub } }
    }

    // ---------- 发起生视频任务 ----------
    if (pathname === '/api/task' && method === 'POST') {
      const input = await readJsonBody()
      const payload = {
        SubAppId: creds.sub,
        ModelName: 'wand-vega-video',
        ModelVersion: input.modelVersion,
        Prompt: input.prompt || '',
      }
      if (Array.isArray(input.fileInfos) && input.fileInfos.length > 0) {
        payload.FileInfos = input.fileInfos.map((f) => {
          const item = { Type: 'Url', Category: f.category, Url: f.url }
          if (f.usage) item.Usage = f.usage
          return item
        })
      }
      payload.OutputConfig = input.outputConfig || {}
      if (input.seed != null && input.seed !== '') payload.Seed = Number(input.seed)
      const ext = buildExtInfo({ wandVega: input.wandVega || {}, additional: input.additional || {} })
      if (ext) payload.ExtInfo = ext
      const r = await vod('CreateAigcVideoTask', payload)
      return { status: 200, data: r.Response || r }
    }

    // ---------- 查询任务详情 ----------
    if (pathname === '/api/task' && method === 'GET') {
      const taskId = searchParams.get('taskId')
      const r = await vod('DescribeTaskDetail', { TaskId: taskId, SubAppId: creds.sub })
      return { status: 200, data: r.Response || r }
    }

    // ---------- 发起活体认证 ----------
    if (pathname === '/api/liveness' && method === 'POST') {
      const r = await vod('CreateAigcLivenessValidate', { SubAppId: creds.sub })
      return { status: 200, data: r.Response || r }
    }

    // ---------- 查询活体认证结果 ----------
    if (pathname === '/api/liveness' && method === 'GET') {
      const token = searchParams.get('token')
      const r = await vod('DescribeAigcLivenessValidateResult', { SubAppId: creds.sub, LivenessToken: token })
      return { status: 200, data: r.Response || r }
    }

    // ---------- 本地上传（本地文件 -> VOD 媒体库 -> 可访问 URL） ----------
    if (pathname === '/api/upload' && method === 'POST') {
      if (!configured) throw new Error('未配置密钥：请先在「连接设置」填写 SecretId / SecretKey / SubAppId')
      const filename = searchParams.get('filename') || 'file'
      const assetType = searchParams.get('assetType') || 'Image'
      const buffer = await readRawBody()
      if (!buffer.length) throw new Error('上传内容为空')
      const result = await uploadMedia({ filename, assetType, buffer, secretId: creds.id, secretKey: creds.key, subAppId: creds.sub })
      return { status: 200, data: result }
    }

    // ---------- 查询已有媒资列表（按类型：Video/Audio/Image） ----------
    if (pathname === '/api/media/list' && method === 'GET') {
      const type = searchParams.get('type') || 'Image'
      const offset = Number(searchParams.get('offset') || 0)
      const limit = Number(searchParams.get('limit') || 100)
      const r = await vod('SearchMedia', {
        SubAppId: creds.sub,
        Categories: [type],
        Filters: ['basicInfo'],
        Offset: offset,
        Limit: limit,
      })
      return { status: 200, data: r.Response || r }
    }

    // ---------- 创建素材 ----------
    if (pathname === '/api/material' && method === 'POST') {
      const input = await readJsonBody()
      const payload = {
        SubAppId: creds.sub,
        FileInfo: { Type: 'Url', Url: input.url },
        AssetType: input.assetType || 'Image',
        GroupId: input.groupId,
        AssetName: input.assetName || '',
        IsRealPerson: input.isRealPerson,
        GroupName: input.groupName || '',
        GroupDescription: input.groupDescription || '',
        SessionId: input.sessionId || '',
        SessionContext: input.sessionContext || '',
        TasksPriority: input.tasksPriority ?? 10,
      }
      if (input.ext) {
        payload.ExtInfo = buildExtInfo({ additional: { asset_group_id: input.ext.assetGroupId } })
      }
      const r = await vod('CreateAigcMaterial', payload)
      return { status: 200, data: r.Response || r }
    }

    // ---------- 查单素材 ----------
    if (pathname === '/api/material/detail' && method === 'GET') {
      const assetId = searchParams.get('assetId')
      const r = await vod('DescribeAigcMaterial', { SubAppId: creds.sub, AssetId: assetId })
      return { status: 200, data: r.Response || r }
    }

    // ---------- 修改素材（改名） ----------
    if (pathname === '/api/material' && method === 'PUT') {
      const input = await readJsonBody()
      const r = await vod('ModifyAigcMaterial', { SubAppId: creds.sub, AssetId: input.assetId, AssetName: input.assetName })
      return { status: 200, data: r.Response || r }
    }

    // ---------- 素材列表 ----------
    if (pathname === '/api/materials' && method === 'GET') {
      const groupId = searchParams.get('groupId') || ''
      const payload = { SubAppId: creds.sub, Limit: 300 }
      if (groupId) payload.GroupId = groupId
      const r = await vod('DescribeAigcMaterialList', payload)
      return { status: 200, data: r.Response || r }
    }

    // ---------- 删除素材 ----------
    if (pathname === '/api/material' && method === 'DELETE') {
      const assetId = searchParams.get('assetId')
      const groupId = searchParams.get('groupId')
      const r = await vod('DeleteAigcMaterial', { SubAppId: creds.sub, AssetId: assetId, GroupId: groupId })
      return { status: 200, data: r.Response || r }
    }

    // ---------- 查素材组 ----------
    if (pathname === '/api/group' && method === 'GET') {
      const groupId = searchParams.get('groupId')
      const r = await vod('DescribeAigcMaterialGroup', { SubAppId: creds.sub, GroupId: groupId })
      return { status: 200, data: r.Response || r }
    }

    // ---------- 修改素材组 ----------
    if (pathname === '/api/group' && method === 'PUT') {
      const input = await readJsonBody()
      const payload = { SubAppId: creds.sub, GroupId: input.groupId }
      if (input.groupName !== undefined) payload.GroupName = input.groupName
      if (input.groupDescription !== undefined) payload.GroupDescription = input.groupDescription
      const r = await vod('ModifyAigcMaterialGroup', payload)
      return { status: 200, data: r.Response || r }
    }

    // ---------- 删除素材组（删整组素材） ----------
    if (pathname === '/api/group' && method === 'DELETE') {
      const groupId = searchParams.get('groupId')
      const r = await vod('DeleteAigcMaterial', { SubAppId: creds.sub, GroupId: groupId })
      return { status: 200, data: r.Response || r }
    }

    return { status: 404, data: { error: 'not found: ' + pathname } }
  } catch (e) {
    return { status: 500, data: { error: e.message } }
  }
}
