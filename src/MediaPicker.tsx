import { useEffect, useState } from 'react'
import { api } from './api'
import type { MediaItem } from './types'
import { MEDIA_NOTE } from './VodNote'

type MediaType = 'Image' | 'Video' | 'Audio'
export interface PickedMedia { item: MediaItem; type: MediaType }

const TABS: { key: MediaType; label: string; icon: string }[] = [
  { key: 'Image', label: '图片', icon: '🖼' },
  { key: 'Video', label: '视频', icon: '🎬' },
  { key: 'Audio', label: '音频', icon: '🎵' },
]

interface Props {
  initialType: MediaType
  /** 限定可选类型（首尾帧只允许图片）；默认三类全开 */
  types?: MediaType[]
  /** 单选：点一下即选中并返回 */
  onSelect?: (item: MediaItem, type: MediaType) => void
  /** 多选：跨 tab 勾选，底部「添加 N 个」一次性返回 */
  multiple?: boolean
  onSelectMany?: (items: PickedMedia[]) => void
  /** 已添加的 MediaUrl，置灰不可重复选 */
  excludeUrls?: string[]
  onClose: () => void
}

export default function MediaPicker({ initialType, types, onSelect, multiple, onSelectMany, excludeUrls = [], onClose }: Props) {
  const tabs = types ? TABS.filter((t) => types.includes(t.key)) : TABS
  const [type, setType] = useState<MediaType>(initialType)
  const [list, setList] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [picked, setPicked] = useState<Map<string, PickedMedia>>(new Map())

  useEffect(() => {
    let alive = true
    setLoading(true)
    setErr('')
    setList([])
    api
      .listMedia(type, 0, 100)
      .then((r) => {
        if (!alive) return
        if (r.Error) throw new Error(`${r.Error.Code}: ${r.Error.Message}`)
        const items = (r.MediaInfoSet || [])
          .map((m: any) => ({ ...m.BasicInfo, FileId: m.BasicInfo?.FileId || m.FileId }))
        setList(items)
      })
      .catch((e: any) => alive && setErr(e.message || String(e)))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [type])

  const fmtDate = (iso?: string) => (iso ? iso.slice(0, 10) : '')
  const countOf = (t: MediaType) => [...picked.values()].filter((p) => p.type === t).length

  const toggle = (m: MediaItem) => {
    setPicked((prev) => {
      const next = new Map(prev)
      if (next.has(m.FileId)) next.delete(m.FileId)
      else next.set(m.FileId, { item: m, type })
      return next
    })
  }

  const click = (m: MediaItem) => {
    if (multiple) toggle(m)
    else onSelect?.(m, type)
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">
            选择已有媒资{tabs.length === 1 ? ` · ${tabs[0].label}` : ''}{multiple ? '（可多选）' : ''}
          </span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="vod-note" style={{ marginBottom: 14 }}>🗂 {MEDIA_NOTE}</div>
          {tabs.length > 1 && (
            <div className="page-tabs" style={{ marginBottom: 16 }}>
              {tabs.map((t) => {
                const n = multiple ? countOf(t.key) : 0
                return (
                  <button
                    key={t.key}
                    className={`page-tab ${type === t.key ? 'active' : ''}`}
                    onClick={() => setType(t.key)}
                  >
                    {t.icon} {t.label}{n > 0 ? ` · 已选 ${n}` : ''}
                  </button>
                )
              })}
            </div>
          )}

          {err && <div className="err-msg" style={{ marginBottom: 12 }}>{err}</div>}

          {loading ? (
            <div className="media-empty"><span className="spinner" /> 加载中…</div>
          ) : list.length === 0 ? (
            <div className="media-empty">该类型下暂无媒资，可先「上传本地文件」</div>
          ) : (
            <div className="media-list">
              {list.map((m) => {
                const added = !!m.MediaUrl && excludeUrls.includes(m.MediaUrl)
                const on = picked.has(m.FileId)
                return (
                  <button
                    key={m.FileId}
                    className={`media-item ${on ? 'picked' : ''} ${added ? 'added' : ''}`}
                    disabled={added}
                    onClick={() => click(m)}
                  >
                    {multiple && <span className={`ap-check ${on ? 'on' : ''}`}>{on ? '✓' : ''}</span>}
                    <span className="media-thumb">
                      {(type === 'Image' || type === 'Video') && (m.MediaUrl || m.CoverUrl) ? (
                        <img src={type === 'Video' ? m.CoverUrl || m.MediaUrl : m.MediaUrl || m.CoverUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="media-thumb-icon">{type === 'Audio' ? '🎵' : '🎬'}</span>
                      )}
                    </span>
                    <span className="media-info">
                      <span className="media-name">{m.Name || '未命名'}{added ? '（已添加）' : ''}</span>
                      <span className="media-meta">
                        {m.Type || type} · {fmtDate(m.CreateTime)}
                        {m.Status && m.Status !== 'Normal' ? ` · ${m.Status}` : ''}
                      </span>
                      <span className="media-id">{m.FileId}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="modal-foot">
          {multiple && <span className="ap-picked-count">已选 {picked.size} 个{picked.size > 0 ? '（可切换类型继续选）' : ''}</span>}
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          {multiple && (
            <button className="btn btn-primary" disabled={picked.size === 0} onClick={() => onSelectMany?.([...picked.values()])}>
              添加 {picked.size || ''} 个
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
