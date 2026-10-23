import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import type { MaterialAsset, MaterialGroupInfo } from './types'
import { loadGroups, onGroupsChanged, registerGroup, removeGroupFromIndex, type GroupIndexItem } from './materialStore'
import { copyText } from './clipboard'
import AddAssetModal from './AddAssetModal'
import NewGroupMenu from './NewGroupMenu'
import NewGroupModal, { type NewGroupMode } from './NewGroupModal'
import MaterialFlow from './MaterialFlow'

const PAGE_SIZE = 12

type GroupFilter = 'all' | 'real' | 'fake'
type TypeFilter = 'all' | 'Image' | 'Video' | 'Audio'
type RightTab = 'assets' | 'flow'

const TYPE_LABEL: Record<string, string> = { Image: '图片', Video: '视频', Audio: '音频' }

/** Vega Pro 素材库：左栏素材组（搜索/筛选/新建），右栏「素材 / 使用流程」 */
export default function MaterialPage() {
  const [groups, setGroups] = useState<GroupIndexItem[]>(loadGroups())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [groupDetail, setGroupDetail] = useState<MaterialGroupInfo | null>(null)
  const [materials, setMaterials] = useState<MaterialAsset[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [page, setPage] = useState(1)

  const [keyword, setKeyword] = useState('')
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  // 默认看流程；选中组后：有素材 → 素材页，无素材 → 使用流程
  const [rightTab, setRightTab] = useState<RightTab>('flow')

  const [newMode, setNewMode] = useState<NewGroupMode | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const [editing, setEditing] = useState<{ groupId: string } | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [deleting, setDeleting] = useState<{ groupId: string; groupName?: string; count?: number } | null>(null)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renamingName, setRenamingName] = useState('')

  const [toast, setToast] = useState('')
  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 1800)
  }
  const copy = (t: string) => {
    copyText(t).then((ok) => showToast(ok ? '已复制' : '复制失败，请手动复制'))
  }

  useEffect(() => onGroupsChanged(() => setGroups(loadGroups())), [])

  const loadGroup = useCallback(async (groupId: string, silent = false) => {
    setSelectedId(groupId)
    setErr('')
    if (!silent) {
      setLoading(true)
      setMaterials(null)
    }
    let detail: MaterialGroupInfo | null = null
    let list: MaterialAsset[] = []
    let detailErr = ''
    let listErr = ''
    try { detail = await api.getGroup(groupId) } catch (e: any) { detailErr = e.message || String(e) }
    try { const m = await api.listMaterials(groupId); list = (m.AssetInfoList || []) as MaterialAsset[] } catch (e: any) { listErr = e.message || String(e) }
    setGroupDetail(detail?.GroupId ? detail : null)
    setMaterials(list)
    // 详情和列表都失败才算真错误（如未配密钥）；组在 VOD 暂无记录只空展示
    if (detailErr && listErr) setErr(detailErr)
    setRightTab(list.length > 0 || (detailErr && listErr) ? 'assets' : 'flow')
    setLoading(false)
  }, [])

  const pickGroup = (groupId: string) => {
    setPage(1)
    setTypeFilter('all')
    setRenamingId(null)
    loadGroup(groupId)
  }

  const openEdit = (g: GroupIndexItem) => {
    const isSel = g.groupId === selectedId
    setEditing({ groupId: g.groupId })
    setEditName(isSel && groupDetail?.GroupName ? groupDetail.GroupName : g.groupName || '')
    setEditDesc(isSel && groupDetail?.GroupDescription ? groupDetail.GroupDescription : '')
  }

  const saveGroup = async () => {
    if (!editing) return
    try {
      const r = await api.modifyGroup(editing.groupId, editName.trim(), editDesc.trim())
      if (r?.Error) throw new Error(`${r.Error.Code}: ${r.Error.Message}`)
      const prev = loadGroups().find((g) => g.groupId === editing.groupId)
      registerGroup({ groupId: editing.groupId, groupName: editName.trim() || undefined, isRealPerson: prev?.isRealPerson })
      if (selectedId === editing.groupId) loadGroup(editing.groupId, true)
      setEditing(null)
      showToast('素材组已更新')
    } catch (e: any) {
      setErr(e.message || String(e))
      setEditing(null)
    }
  }

  const openDelete = (g: GroupIndexItem) => {
    const count = selectedId === g.groupId && materials ? materials.length : undefined
    setDeleting({ groupId: g.groupId, groupName: g.groupName, count })
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      const r = await api.deleteGroup(deleting.groupId)
      if (r?.Error) throw new Error(`${r.Error.Code}: ${r.Error.Message}`)
      removeGroupFromIndex(deleting.groupId)
      if (selectedId === deleting.groupId) {
        setSelectedId(null)
        setGroupDetail(null)
        setMaterials(null)
        setPage(1)
      }
      showToast('素材组已删除')
    } catch (e: any) {
      setErr(e.message || String(e))
    }
    setDeleting(null)
  }

  const renameAsset = async (assetId: string) => {
    try {
      const r = await api.modifyMaterial(assetId, renamingName.trim())
      if (r?.Error) throw new Error(`${r.Error.Code}: ${r.Error.Message}`)
      setRenamingId(null)
      showToast('已改名')
      if (selectedId) loadGroup(selectedId, true)
    } catch (e: any) {
      setErr(e.message || String(e))
    }
  }

  const deleteAsset = async (assetId: string, groupId: string) => {
    if (!confirm(`确认删除素材 ${assetId}？`)) return
    try {
      const r = await api.deleteMaterial(assetId, groupId)
      if (r?.Error) throw new Error(`${r.Error.Code}: ${r.Error.Message}`)
      showToast('已删除')
      if (selectedId) loadGroup(selectedId, true)
    } catch (e: any) {
      setErr(e.message || String(e))
    }
  }

  // ---- 左栏：组筛选 ----
  const groupCounts = useMemo(() => ({
    all: groups.length,
    real: groups.filter((g) => g.isRealPerson === 'True').length,
    fake: groups.filter((g) => g.isRealPerson !== 'True').length,
  }), [groups])

  const shownGroups = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return groups.filter((g) => {
      if (groupFilter === 'real' && g.isRealPerson !== 'True') return false
      if (groupFilter === 'fake' && g.isRealPerson === 'True') return false
      if (!kw) return true
      return (g.groupName || '').toLowerCase().includes(kw) || g.groupId.toLowerCase().includes(kw)
    })
  }, [groups, groupFilter, keyword])

  // ---- 右栏：素材按类型筛选 + 分页 ----
  const typeCounts = useMemo(() => {
    const c = { all: 0, Image: 0, Video: 0, Audio: 0 } as Record<TypeFilter, number>
    for (const m of materials || []) {
      c.all++
      if (m.AssetType === 'Image' || m.AssetType === 'Video' || m.AssetType === 'Audio') c[m.AssetType]++
    }
    return c
  }, [materials])

  const filtered = useMemo(
    () => (materials || []).filter((m) => typeFilter === 'all' || m.AssetType === typeFilter),
    [materials, typeFilter],
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // 删除素材 / 切换筛选后当前页可能越界，自动回退
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const selected = groups.find((g) => g.groupId === selectedId)
  const isReal = selected?.isRealPerson === 'True'
  const displayName = groupDetail?.GroupName || selected?.groupName || '未命名组'

  return (
    <div className="gen mlib">
      {/* ================= 左：素材组 ================= */}
      <aside className="gen-left">
        <div className="gen-form">
          <div className="mlib-head">
            <span>素材组</span>
            <span className="gen-tab-n">{groups.length}</span>
          </div>

          <input
            type="text"
            className="mlib-search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="🔍 搜索组名 / GroupId"
          />

          <div className="gseg" style={{ marginTop: 10 }}>
            {([
              ['all', '全部'],
              ['real', '真人'],
              ['fake', '非真人'],
            ] as [GroupFilter, string][]).map(([k, label]) => (
              <button key={k} className={`gseg-item ${groupFilter === k ? 'on' : ''}`} onClick={() => setGroupFilter(k)}>
                {label} {groupCounts[k]}
              </button>
            ))}
          </div>

          <div className="mlib-groups">
            {groups.length === 0 && (
              <div className="mlib-empty-side">
                还没有素材组<br />点击下方「+ 新建素材组」开始
              </div>
            )}
            {groups.length > 0 && shownGroups.length === 0 && (
              <div className="mlib-empty-side">没有匹配的素材组</div>
            )}
            {shownGroups.map((g) => (
              <div key={g.groupId} className={`mgroup ${selectedId === g.groupId ? 'on' : ''}`}>
                <button className="mgroup-main" onClick={() => pickGroup(g.groupId)}>
                  <span className={`mgroup-icon ${g.isRealPerson === 'True' ? 'real' : ''}`}>
                    {g.isRealPerson === 'True' ? '👤' : '🧩'}
                  </span>
                  <span className="mgroup-text">
                    <span className="mgroup-name">{g.groupName || '未命名组'}</span>
                    <span className="mgroup-id">{g.groupId}</span>
                  </span>
                </button>
                <span className="mgroup-actions">
                  <button className="icon-btn" title="编辑组" onClick={() => openEdit(g)}>✏️</button>
                  <button className="icon-btn danger" title="删除组" onClick={() => openDelete(g)}>🗑</button>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="gen-foot">
          <NewGroupMenu onPick={setNewMode} btnClass="btn btn-primary btn-block gen-submit" />
        </div>
      </aside>

      {/* ================= 右：素材 / 使用流程 ================= */}
      <section className="gen-right">
        <div className="gen-tabs">
          <button className={`gen-tab ${rightTab === 'assets' ? 'on' : ''}`} onClick={() => setRightTab('assets')}>
            素材 {materials && <span className="gen-tab-n">{materials.length}</span>}
          </button>
          <button className={`gen-tab ${rightTab === 'flow' ? 'on' : ''}`} onClick={() => setRightTab('flow')}>
            使用流程
          </button>
        </div>

        <div className="gen-content">
          {rightTab === 'flow' && <MaterialFlow embedded />}

          {rightTab === 'assets' && !selectedId && (
            <div className="gen-empty">
              <div className="gen-empty-icon">📁</div>
              <div className="gen-empty-title">{groups.length ? '请选择左侧素材组' : '还没有素材组'}</div>
              <div className="gen-empty-sub">
                {groups.length ? '选中后可查看、添加、改名、删除素材' : '先新建一个素材组，'}
                <button className="link-btn" onClick={() => setRightTab('flow')}>查看使用流程 →</button>
              </div>
            </div>
          )}

          {rightTab === 'assets' && selectedId && (
            <>
              {/* 组信息 */}
              <div className="mlib-ghead">
                <div className="mlib-ghead-main">
                  <div className="mlib-gtitle">
                    {displayName}
                    {isReal ? <span className="real-tag">👤 真人-已活体认证</span> : <span className="fake-tag">🧩 非真人</span>}
                  </div>
                  <div className="mlib-gmeta">
                    <span className="mlib-gid" onClick={() => copy(selectedId)} title="复制 GroupId">
                      GroupId：<b>{selectedId}</b> 📋
                    </span>
                    {groupDetail?.GroupType && <span>类型：{groupDetail.GroupType}</span>}
                    {groupDetail?.CreateTime && <span>创建：{groupDetail.CreateTime.slice(0, 10)}</span>}
                    {groupDetail?.GroupDescription && <span>描述：{groupDetail.GroupDescription}</span>}
                    {!groupDetail && !loading && <span className="muted">VOD 暂无该组记录，添加第一个素材后自动创建</span>}
                  </div>
                </div>
                <div className="mlib-gactions">
                  <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>+ 添加素材</button>
                </div>
              </div>

              {/* 类型筛选 */}
              <div className="mlib-toolbar">
                <div className="gseg mlib-typeseg">
                  {(['all', 'Image', 'Video', 'Audio'] as TypeFilter[]).map((k) => (
                    <button
                      key={k}
                      className={`gseg-item ${typeFilter === k ? 'on' : ''}`}
                      onClick={() => { setTypeFilter(k); setPage(1) }}
                    >
                      {k === 'all' ? '全部' : TYPE_LABEL[k]} {materials ? typeCounts[k] : ''}
                    </button>
                  ))}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => loadGroup(selectedId, true)} disabled={loading}>↻ 刷新</button>
              </div>

              {err && <div className="err-msg" style={{ marginBottom: 12 }}>{err}</div>}

              {loading && (
                <div className="mgrid">
                  {Array.from({ length: 6 }).map((_, i) => <div className="mcard mcard-skel" key={i} />)}
                </div>
              )}

              {!loading && materials && filtered.length === 0 && (
                <div className="gen-empty">
                  <div className="gen-empty-icon">🗂</div>
                  <div className="gen-empty-title">
                    {materials.length === 0 ? '该组暂无素材' : `暂无${TYPE_LABEL[typeFilter] || ''}素材`}
                  </div>
                  <div className="gen-empty-sub">
                    <button className="link-btn" onClick={() => setAddOpen(true)}>+ 添加素材</button>
                  </div>
                </div>
              )}

              {!loading && pageItems.length > 0 && (
                <div className="mgrid">
                  {pageItems.map((m) => {
                    const url = m.AssetUrl || m.Url
                    const t = m.AssetType || ''
                    return (
                      <div className="mcard" key={m.AssetId}>
                        <div className={`mcard-cover ${t.toLowerCase()}`}>
                          {t === 'Image' && url && <img src={url} alt="" />}
                          {t === 'Video' && url && <video src={url} muted preload="metadata" />}
                          {(t === 'Audio' || !url) && <span className="mcard-cover-icon">{t === 'Video' ? '🎞' : t === 'Image' ? '🖼' : '🎵'}</span>}
                          <span className={`mcard-type ${t.toLowerCase()}`}>{TYPE_LABEL[t] || t || '未知'}</span>
                        </div>
                        <div className="mcard-body">
                          {renamingId === m.AssetId ? (
                            <div className="mcard-rename">
                              <input
                                type="text"
                                value={renamingName}
                                onChange={(e) => setRenamingName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') renameAsset(m.AssetId)
                                  if (e.key === 'Escape') setRenamingId(null)
                                }}
                                autoFocus
                              />
                              <button className="btn btn-primary btn-sm" onClick={() => renameAsset(m.AssetId)}>保存</button>
                            </div>
                          ) : (
                            <div className="mcard-name" title={m.AssetName || m.AssetId}>{m.AssetName || m.AssetId}</div>
                          )}
                          <div className="mcard-id" title={m.AssetId}>{m.AssetId}</div>
                          <div className="mcard-actions">
                            <button className="mcard-copy" onClick={() => copy(`asset://${m.AssetId}`)} title={`复制 asset://${m.AssetId}`}>
                              📋 复制 asset://
                            </button>
                            <button
                              className="icon-btn"
                              title="改名"
                              onClick={() => { setRenamingId(m.AssetId); setRenamingName(m.AssetName || '') }}
                            >✏️</button>
                            <button className="icon-btn danger" title="删除" onClick={() => deleteAsset(m.AssetId, m.GroupId || selectedId)}>🗑</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {!loading && filtered.length > PAGE_SIZE && (
                <div className="pager">
                  <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
                  <span className="pager-info">{page} / {totalPages}</span>
                  <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="gen-disclaimer">
          素材与素材组存储在腾讯云 VOD；组列表索引保存在当前浏览器，换设备请用「补录已有组」
        </div>
      </section>

      {/* 新建组 / 补录 */}
      {newMode && (
        <NewGroupModal
          mode={newMode}
          onClose={() => setNewMode(null)}
          onGroupReady={(id) => { setPage(1); loadGroup(id, id === selectedId) }}
          copy={copy}
        />
      )}

      {/* 往当前组添加素材：GroupId / IsRealPerson 继承当前组 */}
      {addOpen && selectedId && (
        <AddAssetModal
          groupId={selectedId}
          groupName={displayName}
          isReal={isReal}
          onCreated={() => loadGroup(selectedId, true)}
          onClose={() => setAddOpen(false)}
          copy={copy}
        />
      )}

      {/* 编辑组 */}
      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">编辑素材组</div>
              <button className="modal-close" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <div className="label">GroupId（不可改）</div>
                <input type="text" value={editing.groupId} disabled />
              </div>
              <div className="field">
                <div className="label">组名</div>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="组名" autoFocus />
              </div>
              <div className="field">
                <div className="label">描述</div>
                <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="组描述（可选）" />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="btn btn-primary" onClick={saveGroup}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除组确认 */}
      {deleting && (
        <div className="modal-mask" onClick={() => setDeleting(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">删除素材组</div>
              <button className="modal-close" onClick={() => setDeleting(null)}>×</button>
            </div>
            <div className="modal-body">
              <p>确认删除素材组「<span className="del-group-name">{deleting.groupName || deleting.groupId}</span>」？</p>
              <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text2)' }}>
                将删除该组内{deleting.count != null ? ` ${deleting.count} 条` : '全部'}素材，此操作不可恢复。
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setDeleting(null)}>取消</button>
              <button className="btn btn-danger-solid" onClick={confirmDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="copy-toast">{toast}</div>}
    </div>
  )
}
