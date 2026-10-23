import { loadSettings } from './settings'

const authHeaders = (): Record<string, string> => {
  const s = loadSettings()
  return {
    'x-vega-secret-id': s.secretId || '',
    'x-vega-secret-key': s.secretKey || '',
    'x-vega-sub-app-id': s.subAppId || '',
  }
}

const j = async (r: Response) => {
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as any).error || `HTTP ${r.status}`)
  return data
}

export const api = {
  health: () => fetch('/api/health', { headers: authHeaders() }).then(j),

  createTask: (body: any) =>
    fetch('/api/task', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j),

  getTask: (taskId: string) =>
    fetch(`/api/task?taskId=${encodeURIComponent(taskId)}`, { headers: authHeaders() }).then(j),

  createLiveness: () => fetch('/api/liveness', { method: 'POST', headers: authHeaders() }).then(j),

  getLiveness: (token: string) =>
    fetch(`/api/liveness?token=${encodeURIComponent(token)}`, { headers: authHeaders() }).then(j),

  // 本地上传：文件二进制直传代理，代理走 VOD 上传链返回可访问 URL
  uploadFile: (file: File, assetType: string) =>
    fetch(`/api/upload?filename=${encodeURIComponent(file.name)}&assetType=${encodeURIComponent(assetType)}`, {
      method: 'POST',
      headers: authHeaders(),
      body: file,
    }).then(j),

  // 查询已有媒资（按类型：Video/Audio/Image）
  listMedia: (type: string, offset = 0, limit = 100) =>
    fetch(`/api/media/list?type=${encodeURIComponent(type)}&offset=${offset}&limit=${limit}`, { headers: authHeaders() }).then(j),

  createMaterial: (body: any) =>
    fetch('/api/material', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j),

  listMaterials: (groupId: string) =>
    fetch(`/api/materials?groupId=${encodeURIComponent(groupId)}`, { headers: authHeaders() }).then(j),

  getMaterial: (assetId: string) =>
    fetch(`/api/material/detail?assetId=${encodeURIComponent(assetId)}`, { headers: authHeaders() }).then(j),

  modifyMaterial: (assetId: string, assetName: string) =>
    fetch('/api/material', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId, assetName }),
    }).then(j),

  deleteMaterial: (assetId: string, groupId: string) =>
    fetch(
      `/api/material?assetId=${encodeURIComponent(assetId)}&groupId=${encodeURIComponent(groupId)}`,
      { method: 'DELETE', headers: authHeaders() },
    ).then(j),

  getGroup: (groupId: string) =>
    fetch(`/api/group?groupId=${encodeURIComponent(groupId)}`, { headers: authHeaders() }).then(j),

  modifyGroup: (groupId: string, groupName: string, groupDescription: string) =>
    fetch('/api/group', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, groupName, groupDescription }),
    }).then(j),

  deleteGroup: (groupId: string) =>
    fetch(`/api/group?groupId=${encodeURIComponent(groupId)}`, { method: 'DELETE', headers: authHeaders() }).then(j),
}
