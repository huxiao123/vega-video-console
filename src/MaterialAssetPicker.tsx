import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { loadGroups, onGroupsChanged, type GroupIndexItem } from './materialStore'
import type { MaterialAsset } from './types'
import { typeLabel, type MediaCategory } from './upload'
import { copyText } from './clipboard'
import NewGroupMenu from './NewGroupMenu'
import NewGroupModal, { type NewGroupMode } from './NewGroupModal'
import AddAssetModal from './AddAssetModal'

interface Props {
  /** 允许选择的素材类型（首尾帧只能选图片） */
  allowed: MediaCategory[]
  /** 多选模式（多模态参考）；默认单选，点击即返回 */
  multiple?: boolean
  /** 已添加的 AssetId，置灰不可重复选 */
  excludeIds?: string[]
  onSelect: (assets: MaterialAsset[]) => void
  onClose: () => void
}

const TYPE_ICON: Record<string, string> = { Video: '🎬', Audio: '🎵', Image: '🖼' }

/** 从 Vega Pro 素材库选素材：左侧素材组（可新建），右侧该组素材（可添加）；调用方填 asset://AssetId */
export default function MaterialAssetPicker({ allowed, multiple, excludeIds = [], onSelect, onClose }: Props) {
  const [groups, setGroups] = useState<GroupIndexItem[]>(loadGroups())
  const [groupId, setGroupId] = useState(groups[0]?.groupId || '')
  const [list, setList] = useState<MaterialAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [typeFilter, setTypeFilter] = useState<'All' | MediaCategory>('All')
  // 跨组多选：按 AssetId 记录
  const [picked, setPicked] = useState<Record<string, MaterialAsset>>({})
  const [reloadKey, setReloadKey] = useState(0)

  // 新建组 / 添加素材（与素材库页同一套弹窗）
  const [newMode, setNewMode] = useState<NewGroupMode | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  /** 弹窗内刚创建的素材，列表刷新后自动勾选（多选模式） */
  const justCreated = useRef<string[]>([])

  const [toast, setToast] = useState('')
  const copy = (t: string) => {
    copyText(t).then((ok) => {
      setToast(ok ? '已复制' : '复制失败，请手动复制')
      window.setTimeout(() => setToast(''), 1800)
    })
  }

  useEffect(() => onGroupsChanged(() => setGroups(loadGroups())), [])

  useEffect(() => {
    if (!groupId) return
    let alive = true
    setLoading(true)
    setErr('')
    api
      .listMaterials(groupId)
      .then((r) => {
        if (!alive) return
        if (r.Error) throw new Error(`${r.Error.Code}: ${r.Error.Message}`)
        const next = (r.AssetInfoList || []) as MaterialAsset[]
        setList(next)
        if (multiple && justCreated.current.length) {
          const ids = justCreated.current
          justCreated.current = []
          setPicked((p) => {
            const n = { ...p }
            next
              .filter((m) => ids.includes(m.AssetId) && allowed.includes(m.AssetType as MediaCategory) && !excludeIds.includes(m.AssetId))
              .forEach((m) => { n[m.AssetId] = m })
            return n
          })
        }
      })
      .catch((e: any) => alive && setErr(e.message || String(e)))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, reloadKey])

  const switchGroup = (id: string) => {
    if (id === groupId) return
    setList([])
    setGroupId(id)
  }

  const usable = useMemo(() => list.filter((m) => allowed.includes(m.AssetType as MediaCategory)), [list, allowed])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    usable.forEach((m) => { c[m.AssetType || ''] = (c[m.AssetType || ''] || 0) + 1 })
    return c
  }, [usable])
  const visible = typeFilter === 'All' ? usable : usable.filter((m) => m.AssetType === typeFilter)
  const hidden = list.length - usable.length
  const pickedList = Object.values(picked)
  const current = groups.find((g) => g.groupId === groupId)
  const isReal = current?.isRealPerson === 'True'
  const allowedText = allowed.map(typeLabel).join(' / ')

  const click = (m: MaterialAsset) => {
    if (excludeIds.includes(m.AssetId)) return
    if (!multiple) { onSelect([m]); return }
    setPicked((p) => {
      const n = { ...p }
      if (n[m.AssetId]) delete n[m.AssetId]
      else n[m.AssetId] = m
      return n
    })
  }

  const onGroupReady = (id: string) => {
    setList([])
    setGroupId(id)
    setReloadKey((k) => k + 1)
  }

  const onAssetCreated = (assetId: string) => {
    justCreated.current.push(assetId)
    setReloadKey((k) => k + 1)
  }

  return (
    <>
      <div className="modal-mask" onClick={onClose}>
        <div className="modal modal-wide ap-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <span className="modal-title">从素材库选择{allowed.length === 1 ? typeLabel(allowed[0]) : '素材'}</span>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body">
            {groups.length === 0 ? (
              <div className="ap-empty">
                <div className="gen-empty-icon">📁</div>
                <div className="gen-empty-title">素材库还没有素材组</div>
                <div className="gen-empty-sub">新建一个素材组并添加素材后，即可在这里选用</div>
                <div className="ap-empty-btn">
                  <NewGroupMenu onPick={setNewMode} btnClass="btn btn-primary" up={false} />
                </div>
              </div>
            ) : (
              <div className="ap-layout">
                <div className="ap-side">
                  <div className="ap-col-title">素材组 {groups.length}</div>
                  <div className="ap-groups">
                    {groups.map((g) => (
                      <button
                        key={g.groupId}
                        className={`ap-group ${groupId === g.groupId ? 'active' : ''}`}
                        onClick={() => switchGroup(g.groupId)}
                      >
                        <span className="ap-group-name">{g.groupName || '未命名组'}</span>
                        {g.isRealPerson === 'True' && <span className="real-tag">👤 真人-已活体认证</span>}
                        <span className="ap-group-id">{g.groupId}</span>
                      </button>
                    ))}
                  </div>
                  <div className="ap-side-foot">
                    <NewGroupMenu onPick={setNewMode} btnClass="btn btn-ghost btn-sm btn-block" />
                  </div>
                </div>
                <div className="ap-assets">
                  {groupId && (
                    <div className="ap-ghead">
                      <span className="ap-gname">
                        {current?.groupName || '未命名组'}
                        {isReal ? <span className="real-tag">👤 真人</span> : <span className="fake-tag">🧩 非真人</span>}
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>↻ 刷新</button>
                      <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>+ 添加素材</button>
                    </div>
                  )}
                  {allowed.length > 1 && (
                    <div className="ap-filter">
                      {(['All', ...allowed] as const).map((t) => (
                        <button
                          key={t}
                          className={`ap-filter-item ${typeFilter === t ? 'on' : ''}`}
                          onClick={() => setTypeFilter(t)}
                        >
                          {t === 'All' ? `全部 ${usable.length}` : `${typeLabel(t)} ${counts[t] || 0}`}
                        </button>
                      ))}
                    </div>
                  )}
                  {err && <div className="err-msg" style={{ marginBottom: 10 }}>{err}</div>}
                  {loading && list.length === 0 ? (
                    <div className="media-empty"><span className="spinner" /> 加载中…</div>
                  ) : visible.length === 0 ? (
                    <div className="media-empty">
                      该组暂无可用{typeFilter === 'All' ? allowedText : typeLabel(typeFilter)}素材
                      {hidden > 0 && `（另有 ${hidden} 个不可用类型）`}
                      <div style={{ marginTop: 10 }}>
                        <button className="link-btn" onClick={() => setAddOpen(true)}>+ 添加素材到该组</button>
                      </div>
                    </div>
                  ) : (
                    <div className="media-list ap-list">
                      {visible.map((m) => {
                        const added = excludeIds.includes(m.AssetId)
                        const on = !!picked[m.AssetId]
                        const url = m.AssetUrl || m.Url
                        return (
                          <button
                            key={m.AssetId}
                            className={`media-item ${on ? 'picked' : ''} ${added ? 'added' : ''}`}
                            onClick={() => click(m)}
                            disabled={added}
                          >
                            {multiple && <span className={`ap-check ${on || added ? 'on' : ''}`}>{on || added ? '✓' : ''}</span>}
                            <span className="media-thumb">
                              {m.AssetType === 'Image' && url ? (
                                <img src={url} alt="" loading="lazy" />
                              ) : (
                                <span className="media-thumb-icon">{TYPE_ICON[m.AssetType || ''] || '📄'}</span>
                              )}
                            </span>
                            <span className="media-info">
                              <span className="media-name">{m.AssetName || m.AssetId}</span>
                              <span className="media-meta">{typeLabel(m.AssetType || '')}{added && ' · 已添加'}</span>
                              <span className="media-id">asset://{m.AssetId}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="modal-foot">
            {multiple && <span className="ap-picked-count">已选 {pickedList.length} 个</span>}
            <button className="btn btn-ghost" onClick={onClose}>取消</button>
            {multiple && (
              <button className="btn btn-primary" disabled={pickedList.length === 0} onClick={() => onSelect(pickedList)}>
                添加{pickedList.length ? ` ${pickedList.length} 个` : ''}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 叠在选择弹窗之上：和素材库页同一套新建组 / 添加素材流程 */}
      {newMode && (
        <NewGroupModal mode={newMode} onClose={() => setNewMode(null)} onGroupReady={onGroupReady} copy={copy} />
      )}
      {addOpen && groupId && (
        <AddAssetModal
          groupId={groupId}
          groupName={current?.groupName || '未命名组'}
          isReal={isReal}
          onCreated={onAssetCreated}
          onClose={() => setAddOpen(false)}
          copy={copy}
        />
      )}
      {toast && <div className="copy-toast">{toast}</div>}
    </>
  )
}
