import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { loadGroups, registerGroup } from './materialStore'
import AssetCreator from './AssetCreator'

export type NewGroupMode = 'real' | 'fake' | 'import'

interface Props {
  mode: NewGroupMode
  onClose: () => void
  /** 组已落到本地索引，通知外层选中并刷新 */
  onGroupReady: (groupId: string) => void
  copy: (t: string) => void
}

const TITLE: Record<NewGroupMode, string> = {
  real: '新建真人组（需活体认证）',
  fake: '新建非真人组',
  import: '补录已有组',
}

export default function NewGroupModal({ mode, onClose, onGroupReady, copy }: Props) {
  const [groupName, setGroupName] = useState('')
  const groupNameRef = useRef('')
  groupNameRef.current = groupName
  const [groupId, setGroupId] = useState('')
  const [createdOnce, setCreatedOnce] = useState(false)
  const [err, setErr] = useState('')

  // ---- 真人：活体认证 ----
  const [livStarting, setLivStarting] = useState(false)
  const [liv, setLiv] = useState<{ H5Link?: string; LivenessToken?: string } | null>(null)

  const startLiveness = async () => {
    setErr('')
    setLivStarting(true)
    try {
      const r = await api.createLiveness()
      if (r.Error) throw new Error(`${r.Error.Code}: ${r.Error.Message}`)
      setLiv({ H5Link: r.H5Link, LivenessToken: r.LivenessToken })
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally {
      setLivStarting(false)
    }
  }

  // 发起后每 5 秒查结果；拿到 GroupId 立即登记到本地索引，防止关掉弹窗后丢失
  useEffect(() => {
    if (mode !== 'real' || !liv?.LivenessToken || groupId) return
    const token = liv.LivenessToken
    const id = window.setInterval(async () => {
      try {
        const r = await api.getLiveness(token)
        if (r.Error) throw new Error(`${r.Error.Code}: ${r.Error.Message}`)
        if (r.Status === 'DONE' && r.GroupId) {
          setGroupId(r.GroupId)
          registerGroup({ groupId: r.GroupId, groupName: groupNameRef.current.trim() || undefined, isRealPerson: 'True' })
          window.clearInterval(id)
        }
      } catch (e: any) {
        setErr(e.message || String(e))
      }
    }, 5000)
    return () => window.clearInterval(id)
  }, [mode, liv?.LivenessToken, groupId])

  // ---- 非真人：新组 GroupId 不能和已有组重复 ----
  const checkNewGroup = async (): Promise<string | null> => {
    if (createdOnce) return null
    const id = groupId.trim()
    if (loadGroups().some((g) => g.groupId === id)) {
      return `GroupId「${id}」已在素材库中，请关闭弹窗，在左侧选中该组后点「+ 添加素材」`
    }
    try {
      const g = await api.getGroup(id)
      if (g?.GroupId) return `GroupId「${id}」在 VOD 中已存在（组名：${g.GroupName || '未命名'}），请用「补录已有组」`
    } catch { /* 组不存在，放行 */ }
    return null
  }

  const onAssetCreated = () => {
    const isReal = mode === 'real' ? 'True' : 'False'
    registerGroup({ groupId: groupId.trim(), groupName: groupName.trim() || undefined, isRealPerson: isReal })
    setCreatedOnce(true)
    onGroupReady(groupId.trim())
  }

  // ---- 补录 ----
  const [importReal, setImportReal] = useState<'True' | 'False'>('False')
  const [importing, setImporting] = useState(false)
  const doImport = async () => {
    const id = groupId.trim()
    if (!id) return setErr('请填写 GroupId')
    setErr('')
    setImporting(true)
    let name = groupName.trim()
    try {
      const g = await api.getGroup(id)
      if (!name && g?.GroupName) name = g.GroupName
    } catch { /* VOD 暂无记录也允许补录 */ }
    registerGroup({ groupId: id, groupName: name || undefined, isRealPerson: importReal })
    setImporting(false)
    onGroupReady(id)
    onClose()
  }

  const closeAndSelect = () => {
    if (groupId.trim() && loadGroups().some((g) => g.groupId === groupId.trim())) onGroupReady(groupId.trim())
    onClose()
  }

  return (
    <div className="modal-mask" onClick={closeAndSelect}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{TITLE[mode]}</div>
          <button className="modal-close" onClick={closeAndSelect}>×</button>
        </div>

        <div className="modal-body modal-scroll">
          {mode === 'import' && (
            <>
              <div className="notice">换设备或已有 GroupId（如之前活体认证拿到的）时用这里登记回素材库，不会改动 VOD 数据。</div>
              <div className="field">
                <div className="label">GroupId</div>
                <input type="text" value={groupId} onChange={(e) => setGroupId(e.target.value)} placeholder="如 group-xxx" autoFocus />
              </div>
              <div className="field">
                <div className="label">组名（留空则从 VOD 读取）</div>
                <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="可选" />
              </div>
              <div className="field">
                <div className="label">组类型</div>
                <div className="toggle">
                  <button className={`toggle-item ${importReal === 'True' ? 'active' : ''}`} onClick={() => setImportReal('True')}>👤 真人组</button>
                  <button className={`toggle-item ${importReal === 'False' ? 'active' : ''}`} onClick={() => setImportReal('False')}>非真人组</button>
                </div>
              </div>
            </>
          )}

          {mode === 'real' && (
            <>
              <div className="step">
                <div className="step-head"><span className="step-no">1</span>活体认证，获取 GroupId</div>
                <div className="step-body">
                  {!groupId && (
                    <>
                      <div className="field-hint" style={{ marginTop: 0, marginBottom: 10 }}>
                        GroupId 与认证人脸一一对应，此组只能放认证本人的素材。同一人认证一次即可长期复用。
                      </div>
                      {!liv?.H5Link ? (
                        <button className="btn btn-primary btn-sm" onClick={startLiveness} disabled={livStarting}>
                          {livStarting ? '发起中…' : '发起活体认证'}
                        </button>
                      ) : (
                        <>
                          <div className="asset-item">
                            <span className="url">{liv.H5Link}</span>
                            <button className="btn btn-ghost btn-sm" onClick={() => copy(liv.H5Link!)}>复制</button>
                            <a className="btn btn-ghost btn-sm" href={liv.H5Link} target="_blank" rel="noreferrer">打开</a>
                          </div>
                          <div className="task-meta" style={{ marginTop: 8 }}>
                            <span className="spinner" /> 用手机打开链接完成认证，每 5 秒自动查询结果…
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {groupId && (
                    <div className="task-meta">
                      <span className="status finish">✓ 认证完成</span>
                      <span>GroupId：<span className="asset-id-box" onClick={() => copy(groupId)}>{groupId} 📋</span></span>
                      <span>已登记到素材库</span>
                    </div>
                  )}
                </div>
              </div>

              <div className={`step ${groupId ? '' : 'step-disabled'}`}>
                <div className="step-head"><span className="step-no">2</span>填写组名并添加第一个素材</div>
                <div className="step-body">
                  <div className="field">
                    <div className="label">组名</div>
                    <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="如：张三真人库" disabled={createdOnce} />
                  </div>
                  <AssetCreator
                    groupId={groupId}
                    isRealPerson="True"
                    groupName={createdOnce ? undefined : groupName}
                    disabled={!groupId}
                    submitLabel="创建素材（真人）"
                    onCreated={onAssetCreated}
                    copy={copy}
                  />
                </div>
              </div>
            </>
          )}

          {mode === 'fake' && (
            <>
              <div className="field-hint" style={{ marginTop: 0, marginBottom: 14 }}>
                适用于非真人 / 虚拟人素材，以及开白免活体、国际站场景。VOD 没有单独建组接口，组会随第一个素材一起创建。
              </div>
              <div className="row2" style={{ marginBottom: 14 }}>
                <div className="field">
                  <div className="label">GroupId（自定义）</div>
                  <input type="text" value={groupId} onChange={(e) => setGroupId(e.target.value)} placeholder="如 virtual-anchor" disabled={createdOnce} autoFocus />
                </div>
                <div className="field">
                  <div className="label">组名</div>
                  <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="如：虚拟主播库" disabled={createdOnce} />
                </div>
              </div>
              <AssetCreator
                groupId={groupId}
                isRealPerson="False"
                groupName={createdOnce ? undefined : groupName}
                beforeSubmit={checkNewGroup}
                disabled={!groupId.trim()}
                submitLabel={createdOnce ? '添加素材' : '创建组并添加第一个素材'}
                onCreated={onAssetCreated}
                copy={copy}
              />
            </>
          )}

          {err && <div className="err-msg">{err}</div>}
        </div>

        <div className="modal-foot">
          {mode === 'import' ? (
            <>
              <button className="btn btn-ghost" onClick={onClose}>取消</button>
              <button className="btn btn-primary" onClick={doImport} disabled={importing}>{importing ? '登记中…' : '登记'}</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={closeAndSelect}>{createdOnce ? '完成' : '关闭'}</button>
          )}
        </div>
      </div>
    </div>
  )
}
