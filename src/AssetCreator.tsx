import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { TaskDetailResponse, MediaItem } from './types'
import MediaPicker from './MediaPicker'
import { pickFile, uploadToVod, typeLabel } from './upload'
import Select from './Select'
import VodNote, { UPLOAD_NOTE, MEDIA_NOTE } from './VodNote'

type AssetType = 'Image' | 'Video' | 'Audio'

interface Props {
  groupId: string
  isRealPerson: 'True' | 'False'
  /** 仅新建组时传：随第一个素材一起把组名写入 VOD */
  groupName?: string
  /** 提交前额外校验，返回错误文案则拦截 */
  beforeSubmit?: () => Promise<string | null>
  disabled?: boolean
  submitLabel?: string
  onCreated: (assetId: string) => void
  copy: (t: string) => void
}


/** 素材表单：URL / 上传本地 / 选已有媒资 → 创建素材 → 轮询拿 AssetId。GroupId 与 IsRealPerson 由外部决定 */
export default function AssetCreator({
  groupId, isRealPerson, groupName, beforeSubmit, disabled, submitLabel, onCreated, copy,
}: Props) {
  const [url, setUrl] = useState('')
  const [type, setType] = useState<AssetType>('Image')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [hint, setHint] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [task, setTask] = useState<{ TaskId?: string; Status?: string; AssetId?: string; Message?: string } | null>(null)
  const [err, setErr] = useState('')
  const timer = useRef<number | null>(null)

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current) }, [])

  const reset = () => {
    setUrl('')
    setName('')
    setHint('')
    setTask(null)
    setErr('')
  }

  const uploadLocal = async () => {
    const f = await pickFile('image/*,video/*,audio/*')
    if (!f) return
    setUploading(true)
    setErr('')
    setHint('')
    try {
      const r = await uploadToVod(f)
      setUrl(r.url)
      setType(r.type)
      if (!name) setName(r.name)
      setHint(`已上传，识别为${typeLabel(r.type)}（FileId: ${r.fileId || '-'}）`)
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally {
      setUploading(false)
    }
  }

  const onPickMedia = (m: MediaItem) => {
    if (m.MediaUrl) setUrl(m.MediaUrl)
    if (m.Category === 'Video' || m.Category === 'Audio' || m.Category === 'Image') setType(m.Category)
    if (!name && m.Name) setName(m.Name)
    setHint(`已选择媒资（FileId: ${m.FileId || '-'}）`)
    setPickerOpen(false)
  }

  const create = async () => {
    setErr('')
    setTask(null)
    if (!groupId.trim()) return setErr('缺少 GroupId')
    if (!url.trim()) return setErr('请先上传本地文件、选择已有媒资或填写 URL')
    setCreating(true)
    try {
      if (beforeSubmit) {
        const msg = await beforeSubmit()
        if (msg) { setErr(msg); return }
      }
      const r = await api.createMaterial({
        url: url.trim(),
        assetType: type,
        groupId: groupId.trim(),
        isRealPerson,
        assetName: name.trim(),
        groupName: groupName?.trim() || '',
      })
      if (r.Error) throw new Error(`${r.Error.Code}: ${r.Error.Message}`)
      const taskId = r.TaskId as string
      setTask({ TaskId: taskId, Status: 'WAITING' })
      timer.current = window.setInterval(async () => {
        try {
          const d: TaskDetailResponse = await api.getTask(taskId)
          const mt = d.CreateAigcMaterialTask
          if (!mt) return
          // FINISH 只表示执行结束，成败看 ErrCodeExt / ErrCode
          const code = mt.ErrCodeExt || (mt.ErrCode ? String(mt.ErrCode) : '')
          const failed = mt.Status === 'FAIL' || mt.Status === 'ABORTED' || (mt.Status === 'FINISH' && (!!code || !mt.Output?.AssetId))
          const status = failed ? 'FAIL' : mt.Status
          const msg = [code, mt.Message].filter(Boolean).join(': ') || (failed ? '任务详情未返回错误描述' : '')
          setTask({ TaskId: taskId, Status: status, AssetId: mt.Output?.AssetId, Message: msg })
          if (status === 'FINISH' || status === 'FAIL') {
            if (timer.current) window.clearInterval(timer.current)
            if (status === 'FINISH' && mt.Output?.AssetId) onCreated(mt.Output.AssetId)
          }
        } catch { /* 下次重试 */ }
      }, 4000)
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally {
      setCreating(false)
    }
  }

  const running = !!task && task.Status !== 'FINISH' && task.Status !== 'FAIL'
  const done = task?.Status === 'FINISH' && task.AssetId

  return (
    <div>
      <div className="field">
        <div className="label">素材文件</div>
        <div className="asset-add">
          <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="上传 / 选择媒资，或粘贴 https://..." />
          <button className="btn btn-ghost btn-sm" onClick={uploadLocal} disabled={uploading} title={UPLOAD_NOTE}>
            {uploading ? '上传中…' : '上传本地文件'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPickerOpen(true)} title={MEDIA_NOTE}>选择已有媒资</button>
        </div>
        {hint && <div className="field-hint ok">✓ {hint}</div>}
        <VodNote style={{ marginTop: 8 }} />
      </div>
      <div className="row2" style={{ marginBottom: 14 }}>
        <div className="field">
          <div className="label">素材类型（自动识别）</div>
          <Select<AssetType>
            value={type}
            onChange={setType}
            options={[
              { value: 'Image' as AssetType, label: '🖼 图片' },
              { value: 'Video' as AssetType, label: '🎬 视频' },
              { value: 'Audio' as AssetType, label: '🎵 音频' },
            ]}
          />
        </div>
        <div className="field">
          <div className="label">素材名称（可选）</div>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：正脸照" />
        </div>
      </div>

      {done ? (
        <div className="asset-done">
          <span className="status finish">✓ 素材创建成功</span>
          <span className="asset-id-box" onClick={() => copy(`asset://${task!.AssetId}`)} title="点击复制">
            asset://{task!.AssetId} 📋
          </span>
          <button className="btn btn-ghost btn-sm" onClick={reset}>继续添加</button>
        </div>
      ) : (
        <button className="btn btn-primary btn-block" onClick={create} disabled={disabled || creating || running}>
          {creating ? '提交中…' : running ? '素材处理中…' : submitLabel || '添加素材'}
        </button>
      )}
      {running && (
        <div className="task-meta" style={{ marginTop: 10 }}>
          <span className="spinner" /> 素材任务处理中，每 4 秒查询一次… {task?.Message || ''}
        </div>
      )}
      {task?.Status === 'FAIL' && <div className="err-msg">素材创建失败：{task.Message || '未知原因'}</div>}
      {err && <div className="err-msg">{err}</div>}

      {pickerOpen && <MediaPicker initialType={type} onSelect={onPickMedia} onClose={() => setPickerOpen(false)} />}
    </div>
  )
}
