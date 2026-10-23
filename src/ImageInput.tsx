import { useEffect, useState } from 'react'
import MaterialAssetPicker from './MaterialAssetPicker'
import MediaPicker from './MediaPicker'
import { pickFile, uploadToVod, checkSize } from './upload'
import { UPLOAD_NOTE, MEDIA_NOTE } from './VodNote'

type Source = 'url' | 'upload' | 'media' | 'asset'
const SOURCE_LABEL: Record<Source, string> = { url: 'URL', upload: '本地上传', media: '媒资', asset: '素材库' }

interface Props {
  label: string
  required?: boolean
  /** 标题右侧的小字（如「可选」） */
  tag?: string
  value: string
  onChange: (v: string) => void
  /** 是否允许从 Vega-Video Pro 素材库选（asset://AssetId，仅 Pro 可用） */
  allowAsset?: boolean
  /** 单张图片大小上限（MB） */
  maxMB?: number
}

/** 单张图片槽位（首帧 / 尾帧）：空态平铺 4 种来源，选中后显示预览 + 来源角标 */
export default function ImageInput({ label, required, tag, value, onChange, allowAsset, maxMB }: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [urlMode, setUrlMode] = useState(false)
  const [draft, setDraft] = useState('')
  const [meta, setMeta] = useState<{ source: Source; name?: string; preview?: string } | null>(null)
  const [imgBroken, setImgBroken] = useState(false)
  const [assetOpen, setAssetOpen] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)

  // 外部清空（如切模式）时同步清掉本地元信息
  useEffect(() => { if (!value) setMeta(null) }, [value])
  useEffect(() => setImgBroken(false), [value, meta?.preview])

  const set = (url: string, m: { source: Source; name?: string; preview?: string }) => {
    setErr('')
    setMeta(m)
    onChange(url)
  }

  const upload = async () => {
    const f = await pickFile('image/*')
    if (!f) return
    const sizeErr = checkSize(f, 'Image', maxMB)
    if (sizeErr) { setErr(sizeErr); return }
    setBusy(true)
    setErr('')
    try {
      const r = await uploadToVod(f, ['Image'])
      set(r.url, { source: 'upload', name: f.name, preview: r.url })
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const confirmUrl = () => {
    const v = draft.trim()
    if (!v) return
    if (v.startsWith('asset://') && !allowAsset) { setErr('Vega-Video Lite 不支持 asset:// 素材引用'); return }
    set(v, { source: v.startsWith('asset://') ? 'asset' : 'url', name: v.split('/').pop() })
    setUrlMode(false)
  }

  const clear = () => { onChange(''); setMeta(null); setErr('') }

  const source: Source = meta?.source || (value.startsWith('asset://') ? 'asset' : 'url')
  const preview = meta?.preview || (/^https?:\/\//.test(value) ? value : '')

  return (
    <div className="fslot">
      <div className="fslot-head">
        <span>{label}</span>
        <span className={`tag ${required ? 'req' : ''}`}>{required ? '必填' : tag}</span>
      </div>

      {value ? (
        <div className="fslot-box filled">
          {preview && !imgBroken ? (
            <img src={preview} alt="" onError={() => setImgBroken(true)} />
          ) : (
            <div className="fslot-ph">
              {source === 'asset' ? '📚' : '🖼'}
              <small title={value}>{value}</small>
            </div>
          )}
          <span className={`src-tag ${source}`}>{SOURCE_LABEL[source]}</span>
          <button className="tile-rm" title="移除" onClick={clear}>✕</button>
        </div>
      ) : busy ? (
        <div className="fslot-box"><div className="fslot-busy"><span className="spinner" /> 上传中…</div></div>
      ) : urlMode ? (
        <div className="fslot-box">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={allowAsset ? '图片 URL 或 asset://AssetId' : '图片 URL'}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmUrl() } }}
          />
          <div className="fslot-ops">
            <button className="btn btn-ghost btn-sm" onClick={() => { setUrlMode(false); setErr('') }}>取消</button>
            <button className="btn btn-primary btn-sm" onClick={confirmUrl}>确定</button>
          </div>
        </div>
      ) : (
        <div className="fslot-box">
          <button className="src-btn" onClick={upload} title={UPLOAD_NOTE}>⬆ 本地上传</button>
          <button className="src-btn" onClick={() => { setErr(''); setMediaOpen(true) }} title={MEDIA_NOTE}>🗂 已有媒资</button>
          {allowAsset && <button className="src-btn" onClick={() => { setErr(''); setAssetOpen(true) }}>📚 素材库</button>}
          <button className="src-btn" onClick={() => { setDraft(''); setUrlMode(true) }}>🔗 填写 URL</button>
        </div>
      )}

      {value && meta?.name && <div className="fslot-name" title={meta.name}>{meta.name}</div>}
      {err && <div className="err-msg" style={{ marginTop: 6 }}>{err}</div>}

      {mediaOpen && (
        <MediaPicker
          initialType="Image"
          types={['Image']}
          onClose={() => setMediaOpen(false)}
          onSelect={(m) => {
            setMediaOpen(false)
            if (!m.MediaUrl) { setErr('该媒资没有可用的 MediaUrl'); return }
            set(m.MediaUrl, { source: 'media', name: m.Name || m.FileId, preview: m.MediaUrl })
          }}
        />
      )}
      {assetOpen && (
        <MaterialAssetPicker
          allowed={['Image']}
          onClose={() => setAssetOpen(false)}
          onSelect={([m]) => {
            setAssetOpen(false)
            set(`asset://${m.AssetId}`, { source: 'asset', name: m.AssetName || m.AssetId, preview: m.AssetUrl || m.Url })
          }}
        />
      )}
    </div>
  )
}
