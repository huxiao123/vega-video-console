import { api } from './api'

export type MediaCategory = 'Image' | 'Video' | 'Audio'

/** 根据文件自动识别类型（MIME 优先，扩展名兜底） */
export function detectType(f: File): MediaCategory | null {
  if (f.type.startsWith('image/')) return 'Image'
  if (f.type.startsWith('video/')) return 'Video'
  if (f.type.startsWith('audio/')) return 'Audio'
  const ext = f.name.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'Image'
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'm4v'].includes(ext)) return 'Video'
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'wma'].includes(ext)) return 'Audio'
  return null
}

export const typeLabel = (t: string) => (t === 'Image' ? '图片' : t === 'Video' ? '视频' : '音频')

export interface UploadResult {
  url: string
  type: MediaCategory
  name: string
  fileId?: string
}

/** 弹出文件选择框（用户取消返回 null） */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] || null)
    input.click()
  })
}

/** 本地文件 → VOD 上传链（ApplyUpload → COS → CommitUpload）→ 公网 MediaUrl */
export async function uploadToVod(f: File, allowed: MediaCategory[] = ['Image', 'Video', 'Audio']): Promise<UploadResult> {
  const type = detectType(f)
  if (!type) throw new Error('无法识别文件类型，请上传图片 / 视频 / 音频文件')
  if (!allowed.includes(type)) throw new Error(`这里只能上传${allowed.map(typeLabel).join(' / ')}，当前文件是${typeLabel(type)}`)
  const r = await api.uploadFile(f, type)
  if (r.Error) throw new Error(`${r.Error.Code}: ${r.Error.Message}`)
  if (!r.MediaUrl) throw new Error('上传成功但未返回 MediaUrl')
  return { url: r.MediaUrl, type, name: f.name.replace(/\.[^.]+$/, ''), fileId: r.FileId }
}

export const acceptOf = (allowed: MediaCategory[]) =>
  allowed.map((t) => (t === 'Image' ? 'image/*' : t === 'Video' ? 'video/*' : 'audio/*')).join(',')

/** 单文件大小校验：超限返回错误文案 */
export function checkSize(f: File, t: MediaCategory, maxMB?: number, modelLabel = ''): string | null {
  if (!maxMB) return null
  if (f.size > maxMB * 1024 * 1024) {
    return `${modelLabel ? modelLabel + ' ' : ''}${typeLabel(t)}单个文件不能超过 ${maxMB}MB（当前 ${(f.size / 1024 / 1024).toFixed(1)}MB）`
  }
  return null
}

/** 读取本地视频 / 音频时长（秒），失败返回 undefined */
export function probeDuration(f: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const el = document.createElement(f.type.startsWith('audio/') ? 'audio' : 'video')
    const url = URL.createObjectURL(f)
    const done = (v?: number) => { URL.revokeObjectURL(url); resolve(v) }
    el.preload = 'metadata'
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : undefined)
    el.onerror = () => done(undefined)
    window.setTimeout(() => done(undefined), 5000)
    el.src = url
  })
}
