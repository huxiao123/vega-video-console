import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import { copyText } from './clipboard'
import ImageInput from './ImageInput'
import { SrcNote, UPLOAD_NOTE, MEDIA_NOTE } from './VodNote'
import MaterialAssetPicker from './MaterialAssetPicker'
import MediaPicker, { type PickedMedia } from './MediaPicker'
import { pickFile, uploadToVod, detectType, typeLabel, checkSize, probeDuration, type MediaCategory } from './upload'
import Select from './Select'
import { loadSettings } from './settings'
import { toVodPayload, type ProxyTaskBody } from './vodPayload'
import {
  MODELS, GEN_MODES, ASPECT_RATIOS, modelBrief,
  type ModelSpec, type GenMode, type FileInfoInput, type TaskCard, type TaskDetailResponse, type MaterialAsset, type GenParams,
} from './types'

type Family = 'lite' | 'pro'
type RightTab = 'result' | 'json'

const CATS: MediaCategory[] = ['Image', 'Video', 'Audio']
const CAT_ICON: Record<MediaCategory, string> = { Image: '🖼', Video: '🎬', Audio: '🎵' }
const SOURCE_LABEL = { url: 'URL', upload: '本地上传', media: '媒资', asset: '素材库' } as const
const AUTO_DURATION = -1
const DEFAULT_DURATION = 5
const DUR_MIGRATED_KEY = 'vega_dur_default_v5'
const ENH_DEFAULT_KEY = 'vega_enh_default_v2'

/* ---------- 本地持久化：表单草稿 + 任务记录（刷新 / 切页不丢） ---------- */
const DRAFT_KEY = 'vega_gen_draft'
const TASKS_KEY = 'vega_gen_tasks'
const MAX_TASKS = 50
function loadJson<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}
const isPending = (t: TaskCard) => t.status === 'WAITING' || t.status === 'PROCESSING'
/** 旧记录：FINISH 但没视频、也没按 ErrCode 复核过 → 补查一次拿错误信息 */
const needsRecheck = (t: TaskCard) => t.status === 'FINISH' && !t.videoUrl && !t.checked
const shouldPoll = (t: TaskCard) => isPending(t) || needsRecheck(t)
const pad = (n: number) => String(n).padStart(2, '0')
const fmtDate = (ts: number) => {
  const d = new Date(ts)
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
/** 结果占位 / 视频框的宽高比 */
const ratioCss = (ar?: string) => {
  const m = /^(\d+):(\d+)$/.exec(ar || '')
  return m ? `${m[1]} / ${m[2]}` : '16 / 9'
}
/** 占位框尺寸：横屏按宽 520 铺，竖屏按高 400 定宽，保持比例不变形 */
const phStyle = (ar?: string) => {
  const m = /^(\d+):(\d+)$/.exec(ar || '')
  const w = m ? Number(m[1]) : 16, h = m ? Number(m[2]) : 9
  return w >= h ? { aspectRatio: `${w} / ${h}` } : { aspectRatio: `${w} / ${h}`, height: 400, width: 'auto' }
}


/* ---------- 小组件：分段选择 / 开关 / 分区 ---------- */
interface SegOpt<T extends string> { value: T; label: ReactNode; disabled?: boolean; title?: string }
function Seg<T extends string>({ options, value, onChange, size, accent }: {
  options: SegOpt<T>[]; value: T; onChange: (v: T) => void; size?: 'lg'; accent?: 'orange' | 'blue'
}) {
  return (
    <div className={`gseg ${size === 'lg' ? 'lg' : ''} ${accent || ''}`}>
      {options.map((o) => (
        <button
          key={o.value}
          className={`gseg-item ${value === o.value ? 'on' : ''}`}
          disabled={o.disabled}
          title={o.title}
          onClick={() => !o.disabled && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="gtgl-row">
      <button className={`gtgl ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked}>
        <span className="gtgl-dot" />
      </button>
      <div className="gtgl-text" onClick={() => onChange(!checked)}>
        <span className="gtgl-label">{label}</span>
        {desc && <span className="gtgl-desc">{desc}</span>}
      </div>
    </div>
  )
}

function Sec({ title, required, extra, children }: { title: string; required?: boolean; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="gsec">
      <div className="gsec-title">
        <span>{title}{required && <span className="req"> *</span>}</span>
        {extra && <span className="gsec-extra">{extra}</span>}
      </div>
      {children}
    </div>
  )
}

export default function GeneratePage() {
  const [draft] = useState(() => loadJson<Partial<GenParams>>(DRAFT_KEY) || {})
  const [model, setModel] = useState<ModelSpec>(() => MODELS.find((m) => m.version === draft.modelVersion) || MODELS[0])
  const [mode, setMode] = useState<GenMode>(draft.mode || 't2v')
  const [prompt, setPrompt] = useState(draft.prompt || '')
  const [firstFrame, setFirstFrame] = useState(draft.firstFrame || '')
  const [lastFrame, setLastFrame] = useState(draft.lastFrame || '')
  const [refs, setRefs] = useState<FileInfoInput[]>(draft.refs || [])
  const [refCategory, setRefCategory] = useState<MediaCategory>('Image')
  const [refUrl, setRefUrl] = useState('')
  const [refBusy, setRefBusy] = useState(false)
  const [refErr, setRefErr] = useState('')
  const [libOpen, setLibOpen] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)

  // OutputConfig
  const [resolution, setResolution] = useState(draft.resolution || '1080P')
  const [aspectRatio, setAspectRatio] = useState(draft.aspectRatio || '16:9')
  /** 输出时长（秒），-1 = 由模型自动决定 */
  const [duration, setDuration] = useState(() => {
    // 默认时长统一 5 秒；旧草稿里的默认 8 秒一次性迁移到 5
    if (!localStorage.getItem(DUR_MIGRATED_KEY)) {
      localStorage.setItem(DUR_MIGRATED_KEY, '1')
      return DEFAULT_DURATION
    }
    return draft.duration ?? DEFAULT_DURATION
  })
  const [audio, setAudio] = useState(draft.audio ?? true)
  const [storagePermanent, setStoragePermanent] = useState(draft.storagePermanent ?? false)

  // ExtInfo 高级
  const [seed, setSeed] = useState(draft.seed || '')
  const [enhancePrompt, setEnhancePrompt] = useState<'enable' | 'disable'>(() => {
    // 1.5-Lite 默认关 Prompt 优化：旧草稿里的 enable 一次性迁移到新默认值
    if (!localStorage.getItem(ENH_DEFAULT_KEY)) {
      localStorage.setItem(ENH_DEFAULT_KEY, '1')
      if (model.enhancePromptDefault === 'disable') return 'disable'
    }
    return draft.enhancePrompt ?? model.enhancePromptDefault
  })
  const [moderation, setModeration] = useState<'Moderation_L1' | 'Moderation_L2'>(draft.moderation || 'Moderation_L1')
  const [returnUsage, setReturnUsage] = useState(draft.returnUsage ?? true)
  const [generateMode, setGenerateMode] = useState<'Standard' | 'Fast' | 'StandardMovie'>(draft.generateMode || 'Standard')
  const [videoQuality, setVideoQuality] = useState<'Standard' | 'Fast' | 'SuperFast'>(draft.videoQuality || 'Standard')
  const [returnLastFrame, setReturnLastFrame] = useState(draft.returnLastFrame ?? false)
  const [omniType, setOmniType] = useState<'auto' | 'reference' | 'edit' | 'extend'>(draft.omniType || 'auto')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [tasks, setTasks] = useState<TaskCard[]>(() => loadJson<TaskCard[]>(TASKS_KEY) || [])
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [rightTab, setRightTab] = useState<RightTab>('result')
  const [copied, setCopied] = useState(false)

  const isLite = model.isLite
  /** 1.0-Lite 才有生成模式 / 画质模式 / 审核模式 / 返回用量这些 ExtInfo 参数 */
  const extModes = !!model.extInfoModes
  /** 返回 Vega 用量：Lite 仅 1.0-Lite 支持，Pro 保留 */
  const allowReturnUsage = !isLite || extModes
  const family: Family = isLite ? 'lite' : 'pro'
  const isEditExtend = mode === 'editExtend'
  const familyModels = MODELS.filter((m) => m.isLite === (family === 'lite'))

  // 切模型时同步默认值
  const pickModel = (m: ModelSpec) => {
    setModel(m)
    setEnhancePrompt(m.enhancePromptDefault)
    if (!m.resolutions.includes(resolution)) setResolution(m.resolutions[1])
    // 切模型时长回到默认 5 秒（所有模型都支持）
    setDuration(DEFAULT_DURATION)
    if (m.isLite && GEN_MODES.find((g) => g.key === mode)?.proOnly) setMode('t2v')
  }

  const pickFamily = (f: Family) => {
    if (f === family) return
    pickModel(MODELS.find((m) => m.isLite === (f === 'lite'))!)
  }

  const modeDef = GEN_MODES.find((g) => g.key === mode)!
  // edit 任务文档要求 duration 必须为 -1
  const durationLocked = isEditExtend && omniType === 'edit'
  const durationOptions = Array.from({ length: model.durationMax - model.durationMin + 1 }, (_, i) => model.durationMin + i)
  const aspectOptions = useMemo<string[]>(
    () => {
      const fixed = model.aspectRatios || ASPECT_RATIOS
      return isEditExtend ? ['adaptive'] : mode === 'reference' || model.adaptiveAll ? [...fixed, 'adaptive'] : fixed
    },
    [mode, isEditExtend, model],
  )
  useEffect(() => {
    if (!aspectOptions.includes(aspectRatio)) setAspectRatio(aspectOptions[0])
  }, [aspectOptions]) // eslint-disable-line

  const limits = model.refLimits
  const sizeMB = model.maxSizeMB || {}
  const refsByCat = useMemo(() => {
    const m: Record<MediaCategory, { r: FileInfoInput; i: number }[]> = { Image: [], Video: [], Audio: [] }
    refs.forEach((r, i) => m[r.category].push({ r, i }))
    return m
  }, [refs])

  /** 已知时长的参考视频/音频总时长（只统计本地上传探测到的） */
  const refMediaSec = (c: MediaCategory) => refsByCat[c].reduce((n, { r }) => n + (r.durationSec || 0), 0)

  /** 统一入口：校验上限 + 去重后追加 */
  const pushRefs = (items: FileInfoInput[]): boolean => {
    const next = [...refs]
    for (const it of items) {
      if (next.some((x) => x.url === it.url)) continue
      const n = next.filter((x) => x.category === it.category).length
      if (n >= limits[it.category]) { setRefErr(`${typeLabel(it.category)}最多 ${limits[it.category]} 个`); return false }
      if (next.length >= limits.total) { setRefErr(`参考素材总数最多 ${limits.total} 个`); return false }
      next.push(it)
    }
    setRefErr('')
    setRefs(next)
    return true
  }

  const addRef = () => {
    const url = refUrl.trim()
    if (!url) return
    if (url.startsWith('asset://') && isLite) { setRefErr('Vega-Video Lite 不支持 asset:// 素材引用'); return }
    if (pushRefs([{ category: refCategory, url, usage: 'Reference', source: url.startsWith('asset://') ? 'asset' : 'url' }])) setRefUrl('')
  }

  // 参考素材本地上传：自动识别类型
  const uploadRef = async () => {
    const f = await pickFile('image/*,video/*,audio/*')
    if (!f) return
    setRefErr('')
    const t = detectType(f)
    if (!t) { setRefErr('无法识别文件类型，请上传图片 / 视频 / 音频'); return }
    if (refsByCat[t].length >= limits[t]) { setRefErr(`${typeLabel(t)}最多 ${limits[t]} 个`); return }
    const sizeErr = checkSize(f, t, sizeMB[t], model.label)
    if (sizeErr) { setRefErr(sizeErr); return }
    let durationSec: number | undefined
    if (t !== 'Image' && model.maxRefMediaSec) {
      durationSec = await probeDuration(f)
      const used = refMediaSec(t)
      if (durationSec && used + durationSec > model.maxRefMediaSec + 0.05) {
        setRefErr(`${model.label} 参考${typeLabel(t)}总时长不能超过 ${model.maxRefMediaSec} 秒（已用 ${used.toFixed(1)}s，本段 ${durationSec.toFixed(1)}s）`)
        return
      }
    }
    setRefBusy(true)
    try {
      const r = await uploadToVod(f)
      pushRefs([{ category: r.type, url: r.url, usage: 'Reference', source: 'upload', name: f.name, preview: r.type === 'Image' ? r.url : undefined, durationSec }])
    } catch (e: any) {
      setRefErr(e.message || String(e))
    } finally {
      setRefBusy(false)
    }
  }

  // 从已有媒资多选（类型取勾选时所在 tab）
  const addFromMedia = (picked: PickedMedia[]) => {
    const noUrl = picked.filter((p) => !p.item.MediaUrl).length
    const ok = pushRefs(
      picked
        .filter((p) => p.item.MediaUrl)
        .map(({ item: m, type: t }) => ({
          category: t, url: m.MediaUrl!, usage: 'Reference' as const, source: 'media' as const,
          name: m.Name || m.FileId,
          preview: t === 'Image' ? m.MediaUrl : t === 'Video' ? m.CoverUrl : undefined,
        })),
    )
    if (ok) {
      setMediaOpen(false)
      if (noUrl) setRefErr(`${noUrl} 个媒资没有可用的 MediaUrl，已跳过`)
    }
  }

  // 从素材库多选
  const addFromLibrary = (assets: MaterialAsset[]) => {
    const ok = pushRefs(
      assets
        .filter((a) => CATS.includes(a.AssetType as MediaCategory))
        .map((a) => ({
          category: a.AssetType as MediaCategory,
          url: `asset://${a.AssetId}`,
          usage: 'Reference' as const,
          source: 'asset' as const,
          name: a.AssetName || a.AssetId,
          preview: a.AssetType === 'Image' ? a.AssetUrl || a.Url : undefined,
        })),
    )
    if (ok) setLibOpen(false)
  }

  // Lite 不支持 asset://，切回 Lite 时提示
  const liteAssetRefs = isLite ? refs.filter((r) => r.url.startsWith('asset://')).length : 0

  /** 当前表单快照 */
  const params: GenParams = {
    modelVersion: model.version, mode, prompt, firstFrame, lastFrame, refs,
    resolution, aspectRatio, duration, audio, storagePermanent,
    seed, enhancePrompt, moderation, returnUsage, generateMode, videoQuality, returnLastFrame, omniType,
  }

  // 草稿持久化：任何改动都写回 localStorage，刷新 / 切页 / 提交后都保留
  const paramsJson = JSON.stringify(params)
  useEffect(() => {
    const id = window.setTimeout(() => localStorage.setItem(DRAFT_KEY, paramsJson), 300)
    return () => window.clearTimeout(id)
  }, [paramsJson])

  useEffect(() => {
    try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks.slice(0, MAX_TASKS))) } catch { /* 超限忽略 */ }
  }, [tasks])

  /** 复用某次任务的参数（直接整体回填，不走 pickModel 的默认值重置） */
  const applyParams = (p: GenParams, from?: TaskCard) => {
    setModel(MODELS.find((m) => m.version === p.modelVersion) || MODELS[0])
    setMode(p.mode); setPrompt(p.prompt); setFirstFrame(p.firstFrame); setLastFrame(p.lastFrame); setRefs(p.refs || [])
    setResolution(p.resolution); setAspectRatio(p.aspectRatio); setDuration(p.duration); setAudio(p.audio)
    setStoragePermanent(p.storagePermanent); setSeed(p.seed); setEnhancePrompt(p.enhancePrompt); setModeration(p.moderation)
    setReturnUsage(p.returnUsage); setGenerateMode(p.generateMode); setVideoQuality(p.videoQuality)
    setReturnLastFrame(p.returnLastFrame); setOmniType(p.omniType)
    setError(''); setRefErr(''); setUrlOpen(false)
    setNotice(from ? `已填入 ${fmtDate(from.createdAt)} 任务的参数` : '已填入参数')
    window.setTimeout(() => setNotice(''), 2500)
  }

  const validate = (): string | null => {
    if (modeDef.needFirst && !firstFrame.trim()) return '请上传首帧图片或填写首帧 URL'
    if (modeDef.needRefs && refs.length === 0) return '请至少添加一个参考素材'
    if (modeDef.needRefs) {
      if (liteAssetRefs > 0) return `Vega-Video Lite 不支持素材库引用，请移除 ${liteAssetRefs} 个 asset:// 素材`
      for (const c of CATS) if (refsByCat[c].length > limits[c]) return `${model.label} ${typeLabel(c)}最多 ${limits[c]} 个`
      if (refs.length > limits.total) return `${model.label} 参考素材总数最多 ${limits.total} 个`
      if (model.maxRefMediaSec) {
        for (const c of ['Video', 'Audio'] as const) {
          if (refMediaSec(c) > model.maxRefMediaSec + 0.05) return `${model.label} 参考${typeLabel(c)}总时长不能超过 ${model.maxRefMediaSec} 秒`
        }
      }
    }
    if (isLite && (firstFrame.startsWith('asset://') || lastFrame.startsWith('asset://'))) return 'Vega-Video Lite 不支持 asset:// 素材引用'
    if (!modeDef.needRefs && !modeDef.needFirst && !prompt.trim()) return '请填写提示词'
    if (modeDef.needRefs && refs.every((r) => r.category === 'Audio')) return '音频必须搭配图片或视频输入'
    if (prompt.length > 7000) return '提示词超过 7000 字符上限'
    if (isEditExtend && !refs.some((r) => r.category === 'Video')) return '编辑/延长模式必须包含一个参考视频'
    return null
  }

  /** 由当前表单拼出代理请求体：提交与「API 请求 JSON」预览共用 */
  const buildBody = (): ProxyTaskBody => {
    const fileInfos: ProxyTaskBody['fileInfos'] = []
    if (modeDef.needFirst && firstFrame.trim()) {
      fileInfos.push({ category: 'Image', url: firstFrame.trim(), usage: 'FirstFrame' })
      // 尾帧可选：填了才传 → 首尾帧生视频；不传即首帧生视频
      if (modeDef.optionalLast && lastFrame.trim()) fileInfos.push({ category: 'Image', url: lastFrame.trim(), usage: 'LastFrame' })
    }
    if (modeDef.needRefs) refs.forEach((r) => fileInfos.push({ category: r.category, url: r.url, usage: 'Reference' }))

    const outputConfig: Record<string, unknown> = {
      StorageMode: storagePermanent ? 'Permanent' : 'Temporary',
      Resolution: resolution,
      AspectRatio: isEditExtend ? 'adaptive' : aspectRatio,
      Duration: durationLocked ? AUTO_DURATION : duration,
      AudioGeneration: audio ? 'Enabled' : 'Disabled',
    }

    const wandVega: Record<string, unknown> = { EnhancePromptMode: enhancePrompt }
    if (allowReturnUsage) wandVega.ReturnVegaUsage = returnUsage
    if (extModes) {
      // 生成模式 / 画质模式 / 审核模式仅 1.0-Lite 提供
      wandVega.ModerationMode = moderation
      wandVega.GenerateMode = generateMode
      wandVega.VideoQualityMode = videoQuality
    }

    const additional: Record<string, unknown> = {}
    if (!isLite && returnLastFrame) additional.return_last_frame = true
    if (!isLite && (isEditExtend || (mode === 'reference' && omniType !== 'auto'))) additional.omni_reference_task_type = omniType

    return {
      modelVersion: model.version,
      prompt,
      fileInfos: fileInfos.length ? fileInfos : undefined,
      outputConfig,
      seed: !isLite && seed ? Number(seed) : undefined,
      wandVega,
      additional: Object.keys(additional).length ? additional : undefined,
    }
  }

  const submit = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setSubmitting(true)
    try {
      const r = await api.createTask(buildBody())
      if (r.Error) throw new Error(`${r.Error.Code}: ${r.Error.Message}`)
      setTasks((ts) => [
        { taskId: r.TaskId as string, modelVersion: model.label, mode, prompt, createdAt: Date.now(), status: 'WAITING' as const, params },
        ...ts,
      ].slice(0, MAX_TASKS))
      setRightTab('result')
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSubmitting(false)
    }
  }

  // 轮询：用 ref 读最新任务列表，避免闭包拿到旧状态；全部结束即停
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const hasPending = tasks.some(shouldPoll)
  useEffect(() => {
    if (!hasPending) return
    const tick = async () => {
      for (const t of tasksRef.current.filter(shouldPoll)) {
        try {
          const r: TaskDetailResponse = await api.getTask(t.taskId)
          const v = r.AigcVideoTask
          if (!v) continue
          setTasks((ts) =>
            ts.map((item) => {
              if (item.taskId !== t.taskId) return item
              // VOD 异步任务约定：Status=FINISH 只表示「执行结束」，成败看 ErrCodeExt（空串成功）/ ErrCode（0 成功）
              const errCode = v.ErrCodeExt || (v.ErrCode ? String(v.ErrCode) : '')
              const failed = v.Status === 'ABORTED' || v.Status === 'FAIL' || (v.Status === 'FINISH' && !!errCode)
              const status = (failed ? 'FAIL' : v.Status) as TaskCard['status']
              const next: TaskCard = {
                ...item,
                status,
                errCode: errCode || undefined,
                message: v.Message || undefined,
                checked: status === 'FINISH' || status === 'FAIL',
              }
              if (status === 'FINISH' && v.Output) {
                const files = v.Output.FileInfos || []
                const last = files.find((f) => f.UsageType === 'last_frame_url')
                const video = files.find((f) => f.UsageType !== 'last_frame_url' && f.FileUrl)
                if (video) {
                  next.videoUrl = video.FileUrl
                  next.meta = { duration: video.MetaData?.Duration, width: video.MetaData?.Width, height: video.MetaData?.Height }
                }
                if (last) next.lastFrameUrl = last.FileUrl
                if (v.Output.Usage) {
                  next.tokens = { input: v.Output.Usage.InputTokens, completion: v.Output.Usage.CompletionTokens, total: v.Output.Usage.TotalTokens }
                }
              }
              return next
            }),
          )
        } catch {
          /* 单次查询失败忽略，下轮重试 */
        }
      }
    }
    tick()
    const id = window.setInterval(tick, 6000)
    return () => window.clearInterval(id)
  }, [hasPending])

  const removeTask = (id: string) => setTasks((ts) => ts.filter((t) => t.taskId !== id))
  const copy = (txt: string) => copyText(txt).then((ok) => { if (!ok) alert('复制失败，请手动复制') })

  const requestJson = rightTab === 'json'
    ? JSON.stringify(toVodPayload(buildBody(), loadSettings().subAppId), null, 2)
    : ''

  const copyJson = () => copyText(requestJson).then((ok) => {
    if (!ok) return alert('复制失败，请手动复制')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  })

  const hasInputs = modeDef.needFirst || modeDef.needRefs

  return (
    <div className="gen">
      {/* ===== 左侧：参数面板 ===== */}
      <aside className="gen-left">
        <div className="gen-form">
          <Seg<Family>
            size="lg"
            accent={isLite ? 'orange' : 'blue'}
            value={family}
            onChange={pickFamily}
            options={[{ value: 'lite', label: 'Vega-Video Lite' }, { value: 'pro', label: 'Vega-Video Pro' }]}
          />

          <Sec title="生成类型">
            <Seg<GenMode>
              value={mode}
              onChange={setMode}
              options={GEN_MODES.map((g) => ({
                value: g.key,
                label: g.short,
                title: g.proOnly && isLite ? '仅 Vega-Video Pro 支持' : g.desc,
                disabled: !!g.proOnly && isLite,
              }))}
            />
            <div className="gsec-hint">{modeDef.desc}</div>
          </Sec>

          {isEditExtend && (
            <Sec title="任务类型" extra="omni_reference_task_type">
              <Seg
                value={omniType}
                onChange={setOmniType}
                options={(['auto', 'reference', 'edit', 'extend'] as const).map((t) => ({
                  value: t, label: { auto: '自动', reference: '参考', edit: '编辑', extend: '延长' }[t],
                }))}
              />
            </Sec>
          )}

          <Sec title="模型版本">
            <Select
              value={model.version}
              onChange={(v) => pickModel(MODELS.find((m) => m.version === v)!)}
              options={familyModels.map((m) => ({ value: m.version, label: m.label, desc: `${m.version} · ${modelBrief(m)}` }))}
            />
            <div className="gsec-hint">
              {modelBrief(model)} · {isLite
                ? `${extModes ? '生成/画质/审核模式可选' : '无生成/画质模式'} · 不支持 Seed / 素材库引用`
                : '支持 Seed · 支持 asset:// 素材引用'}
            </div>
          </Sec>

          {modeDef.needFirst && (
            <Sec title="首尾帧" required extra={`不传尾帧即首帧生视频${sizeMB.Image ? ` · 单张≤${sizeMB.Image}MB` : ''}`}>
              <div className="frame-row">
                <ImageInput label="首帧" required value={firstFrame} onChange={setFirstFrame} allowAsset={!isLite} maxMB={sizeMB.Image} />
                <ImageInput label="尾帧" tag="可选" value={lastFrame} onChange={setLastFrame} allowAsset={!isLite} maxMB={sizeMB.Image} />
              </div>
              <SrcNote />
            </Sec>
          )}

          {modeDef.needRefs && (
            <Sec title="参考素材" required extra={`${refs.length}/${limits.total} · 音频须搭配图片或视频`}>
              <div className="src-btns">
                <button className="src-btn" onClick={uploadRef} disabled={refBusy} title={`${UPLOAD_NOTE}（自动识别图片 / 视频 / 音频）`}>
                  {refBusy ? '上传中…' : '⬆ 本地上传'}
                </button>
                <button className="src-btn" onClick={() => { setRefErr(''); setMediaOpen(true) }} title={MEDIA_NOTE}>🗂 已有媒资</button>
                {!isLite && (
                  <button className="src-btn" onClick={() => { setRefErr(''); setLibOpen(true) }}>📚 素材库</button>
                )}
                <button className={`src-btn ${urlOpen ? 'on' : ''}`} onClick={() => setUrlOpen((v) => !v)}>🔗 URL</button>
              </div>
              {urlOpen && (
                <div className="src-url">
                  <Select<MediaCategory>
                    size="sm"
                    value={refCategory}
                    onChange={setRefCategory}
                    menuMinWidth={96}
                    options={CATS.map((c) => ({ value: c, label: `${CAT_ICON[c]} ${typeLabel(c)}` }))}
                  />
                  <input
                    type="text"
                    value={refUrl}
                    autoFocus
                    onChange={(e) => setRefUrl(e.target.value)}
                    placeholder={isLite ? '粘贴 URL，回车添加' : 'URL 或 asset://AssetId'}
                    onKeyDown={(e) => e.key === 'Enter' && addRef()}
                  />
                  <button className="btn btn-primary btn-sm" onClick={addRef}>添加</button>
                </div>
              )}
              <SrcNote />

              {(model.maxSizeMB || model.maxRefMediaSec) && (
                <div className="gsec-hint">
                  {model.maxSizeMB && <div>单文件：{CATS.filter((c) => sizeMB[c]).map((c) => `${typeLabel(c)}≤${sizeMB[c]}MB`).join(' · ')}</div>}
                  {model.maxRefMediaSec && <div>总时长：视频≤{model.maxRefMediaSec}s · 音频≤{model.maxRefMediaSec}s（本地上传自动校验）</div>}
                </div>
              )}

              {refs.length === 0 ? (
                <div className="ref-empty-box">暂无参考素材，通过上方任一方式添加<br />本地上传会自动识别图片 / 视频 / 音频</div>
              ) : (
                CATS.filter((c) => refsByCat[c].length > 0).map((c) => (
                  <div className="ref-cat" key={c}>
                    <div className="ref-cat-head">
                      {typeLabel(c)}
                      <span className={`ref-cat-count ${refsByCat[c].length >= limits[c] ? 'full' : ''}`}>
                        {refsByCat[c].length}/{limits[c]}
                      </span>
                    </div>
                    <div className="ref-grid">
                      {refsByCat[c].map(({ r, i }) => {
                        const src = r.source || 'url'
                        const img = r.preview || (c === 'Image' && /^https?:/.test(r.url) ? r.url : '')
                        return (
                          <div className="rtile" key={r.url} title={r.url}>
                            <div className={`rtile-cover ${c.toLowerCase()}`}>
                              {img ? <img src={img} alt="" loading="lazy" /> : <span>{CAT_ICON[c]}</span>}
                              <span className={`src-tag ${src}`}>{SOURCE_LABEL[src]}</span>
                              <button className="tile-rm" title="移除" onClick={() => setRefs((rs) => rs.filter((_, j) => j !== i))}>✕</button>
                            </div>
                            <div className="rtile-name">{r.name || r.url.split('/').pop() || r.url}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}

              {liteAssetRefs > 0 && (
                <div className="err-msg" style={{ marginTop: 8 }}>Vega-Video Lite 不支持素材库引用，请移除 {liteAssetRefs} 个「素材库」来源的素材或切回 Vega-Video Pro</div>
              )}
              {refErr && <div className="err-msg" style={{ marginTop: 8 }}>{refErr}</div>}
              {mediaOpen && (
                <MediaPicker
                  initialType={refCategory}
                  multiple
                  excludeUrls={refs.map((r) => r.url)}
                  onClose={() => setMediaOpen(false)}
                  onSelectMany={addFromMedia}
                />
              )}
              {libOpen && (
                <MaterialAssetPicker
                  allowed={CATS}
                  multiple
                  excludeIds={refs.filter((r) => r.url.startsWith('asset://')).map((r) => r.url.slice(8))}
                  onClose={() => setLibOpen(false)}
                  onSelect={addFromLibrary}
                />
              )}
            </Sec>
          )}

          <Sec title="提示词" required={!hasInputs}>
            <div className="gtext">
              <textarea
                value={prompt}
                maxLength={7000}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={hasInputs ? '描述画面运动 / 编辑要求（可选），如"镜头缓慢推近，人物转身微笑"' : '描述想要生成的视频画面，如"清晨的海边，一只金毛在沙滩上奔跑，电影感"'}
              />
              <span className="gtext-count">{prompt.length}/7000</span>
            </div>
          </Sec>

          <Sec title="分辨率">
            <Seg value={resolution} onChange={setResolution} options={model.resolutions.map((r) => ({ value: r, label: r }))} />
          </Sec>

          <Sec title="宽高比">
            <Seg
              value={isEditExtend ? 'adaptive' : aspectRatio}
              onChange={setAspectRatio}
              options={aspectOptions.map((a) => ({ value: a, label: a === 'adaptive' ? '自动' : a, disabled: isEditExtend && a !== 'adaptive' }))}
            />
          </Sec>

          <Sec title="时长" extra={durationLocked ? '编辑任务固定由模型决定' : `${model.label} 支持 ${model.durationMin}-${model.durationMax} 秒`}>
            <Select<number>
              value={durationLocked ? AUTO_DURATION : duration}
              disabled={durationLocked}
              onChange={setDuration}
              options={[
                ...(model.durationAuto || durationLocked ? [{ value: AUTO_DURATION, label: '智能时长', desc: 'Duration = -1，由模型决定' }] : []),
                ...durationOptions.map((d) => ({ value: d, label: `${d} 秒` })),
              ]}
            />
          </Sec>

          <Sec title="输出设置">
            <Toggle checked={audio} onChange={setAudio} label="音画同出" desc="开启后同步生成音频（AudioGeneration）" />
            <Toggle
              checked={storagePermanent}
              onChange={setStoragePermanent}
              label="结果永久存储至当前应用"
              desc="开启后生成结果保存至所配置 VOD 应用的媒资库（产生存储费用）；否则返回临时链接"
            />
          </Sec>

          <div className="gfold" onClick={() => setShowAdvanced((s) => !s)}>
            <span className={`fold-arrow ${showAdvanced ? 'open' : ''}`}>▶</span> 高级参数
            <span className="gsec-extra">ExtInfo{!isLite ? ' / Seed' : ''}</span>
          </div>
          {showAdvanced && (
            <div className="gadv">
              {!isLite && (
                <Sec title="Seed" extra="随机种子，留空不传">
                  <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="如 123" />
                </Sec>
              )}
              <Sec title="Prompt 优化" extra={`默认${model.enhancePromptDefault === 'enable' ? '开' : '关'}（EnhancePromptMode）`}>
                <Seg value={enhancePrompt} onChange={setEnhancePrompt} options={[{ value: 'enable', label: '开启' }, { value: 'disable', label: '关闭' }]} />
              </Sec>
              {extModes && (
                <>
                  <Sec title="生成模式" extra="GenerateMode">
                    <Seg
                      value={generateMode}
                      onChange={setGenerateMode}
                      options={[
                        { value: 'Standard', label: '通用' },
                        { value: 'Fast', label: '快速' },
                        { value: 'StandardMovie', label: '去油腻', title: 'StandardMovie' },
                      ]}
                    />
                  </Sec>
                  <Sec title="画质模式" extra="VideoQualityMode">
                    <Seg
                      value={videoQuality}
                      onChange={setVideoQuality}
                      options={[
                        { value: 'Standard', label: '标准' },
                        { value: 'Fast', label: '极速' },
                        { value: 'SuperFast', label: '超极速' },
                      ]}
                    />
                  </Sec>
                  <Sec title="审核模式" extra="ModerationMode">
                    <Seg
                      value={moderation}
                      onChange={setModeration}
                      options={[{ value: 'Moderation_L1', label: 'L1 基础' }, { value: 'Moderation_L2', label: 'L2 增强' }]}
                    />
                  </Sec>
                </>
              )}
              {allowReturnUsage && (
                <Toggle checked={returnUsage} onChange={setReturnUsage} label="返回 Vega 用量" desc="结果中返回 Token 用量（ReturnVegaUsage）" />
              )}
              {!isLite && (
                <Toggle checked={returnLastFrame} onChange={setReturnLastFrame} label="返回尾帧图" desc="额外输出视频最后一帧图片（return_last_frame）" />
              )}
            </div>
          )}
        </div>

        <div className="gen-foot">
          {error && <div className="err-msg" style={{ marginBottom: 10 }}>{error}</div>}
          {notice && !error && <div className="gen-notice">✓ {notice}</div>}
          <button className={`btn btn-primary btn-block gen-submit ${isLite ? 'lite' : ''}`} disabled={submitting} onClick={submit}>
            {submitting ? '提交中…' : `立即生成 · ${model.label}`}
          </button>
        </div>
      </aside>

      {/* ===== 右侧：结果 / JSON ===== */}
      <section className="gen-right">
        <div className="gen-tabs">
          <button className={`gen-tab ${rightTab === 'result' ? 'on' : ''}`} onClick={() => setRightTab('result')}>
            生成结果{tasks.length > 0 && <span className="gen-tab-n">{tasks.length}</span>}
          </button>
          <button className={`gen-tab ${rightTab === 'json' ? 'on' : ''}`} onClick={() => setRightTab('json')}>
            API 请求 JSON
          </button>
        </div>

        <div className="gen-content">
          {rightTab === 'json' ? (
            <div className="gjson">
              <div className="gjson-head">
                <span>
                  <b>CreateAigcVideoTask</b> · 按当前左侧参数实时生成，ExtInfo 已按接入要求转义
                </span>
                <button className="btn btn-ghost btn-sm" onClick={copyJson}>{copied ? '✓ 已复制' : '复制'}</button>
              </div>
              <pre className="gjson-code">{requestJson}</pre>
            </div>
          ) : tasks.length === 0 ? (
            <div className="gen-empty">
              <div className="gen-empty-icon">🎬</div>
              <div className="gen-empty-title">暂无数据</div>
              <div className="gen-empty-sub">可在左边进行参数选择与 AI 生成～</div>
            </div>
          ) : (
            <div className="gen-tasks">
              {tasks.map((t) => <ResultItem key={t.taskId} t={t} onReuse={applyParams} onRemove={removeTask} onCopy={copy} />)}
            </div>
          )}
        </div>

        <div className="gen-disclaimer">内容由人工智能模型生成，不代表平台立场</div>
      </section>
    </div>
  )
}

/* ---------- 生成结果：单条任务 ---------- */
function ResultItem({ t, onReuse, onRemove, onCopy }: {
  t: TaskCard
  onReuse: (p: GenParams, from: TaskCard) => void
  onRemove: (id: string) => void
  onCopy: (txt: string) => void
}) {
  const p = t.params
  const pending = isPending(t)
  const modeLabel = GEN_MODES.find((g) => g.key === t.mode)?.label || t.mode
  const tags = [
    t.modelVersion,
    p?.resolution,
    p && (p.mode === 'editExtend' || p.aspectRatio === 'adaptive' ? '自动比例' : p.aspectRatio),
    p && (p.duration === AUTO_DURATION ? '智能时长' : `${p.duration}s`),
    p && (p.storagePermanent ? '永久存储' : '临时存储'),
  ].filter(Boolean) as string[]

  // 输入素材缩略图（首尾帧 / 参考素材）
  const inputs: { key: string; img?: string; icon: string; label: string }[] = []
  if (p?.mode === 'frames') {
    if (p.firstFrame) inputs.push({ key: 'ff', img: /^https?:/.test(p.firstFrame) ? p.firstFrame : undefined, icon: '🖼', label: '首帧' })
    if (p.lastFrame) inputs.push({ key: 'lf', img: /^https?:/.test(p.lastFrame) ? p.lastFrame : undefined, icon: '🖼', label: '尾帧' })
  } else if (p && (p.mode === 'reference' || p.mode === 'editExtend')) {
    p.refs.forEach((r) => inputs.push({
      key: r.url,
      img: r.preview || (r.category === 'Image' && /^https?:/.test(r.url) ? r.url : undefined),
      icon: CAT_ICON[r.category],
      label: r.name || typeLabel(r.category),
    }))
  }

  return (
    <div className="ritem">
      <div className="ritem-head">
        <span className="ritem-time">{fmtDate(t.createdAt)}</span>
        <span className="rtag main">{modeLabel}</span>
        {tags.map((x) => <span className="rtag" key={x}>{x}</span>)}
        <span className="ritem-sp" />
        {p && <button className="ritem-btn" onClick={() => onReuse(p, t)} title="把这次任务的参数填回左侧">↺ 复用此参数</button>}
        <button className="ritem-btn icon" onClick={() => onRemove(t.taskId)} title="移除这条记录（不影响 VOD 中的任务）">✕</button>
      </div>

      {t.prompt && <div className="ritem-prompt">{t.prompt}</div>}

      {inputs.length > 0 && (
        <div className="ritem-inputs">
          {inputs.slice(0, 12).map((x) => (
            <div className="ritem-in" key={x.key} title={x.label}>
              {x.img ? <img src={x.img} alt="" loading="lazy" /> : <span>{x.icon}</span>}
            </div>
          ))}
          {inputs.length > 12 && <div className="ritem-in more">+{inputs.length - 12}</div>}
        </div>
      )}

      {pending && (
        <>
          <div className="ritem-ph" style={phStyle(p?.aspectRatio)} />
          <div className="ritem-status">{t.status === 'WAITING' ? '排队中' : '生成中'}<span className="ritem-dots" /></div>
        </>
      )}

      {t.status === 'FAIL' && (
        <div className="ritem-fail">
          <div className="ritem-fail-title">
            生成失败{t.errCode && <span className="ritem-errcode">{t.errCode}</span>}
          </div>
          <div className="ritem-fail-msg">{t.message || '任务详情未返回错误描述'}</div>
          {(t.errCode || t.message) && (
            <button className="ritem-link" onClick={() => onCopy([t.errCode, t.message].filter(Boolean).join(': '))}>复制错误信息</button>
          )}
        </div>
      )}
      {t.status === 'FINISH' && !t.videoUrl && (
        <div className="ritem-fail">
          {t.checked
            ? <>任务已结束，但未返回视频文件{t.message ? `：${t.message}` : ''}</>
            : <>正在查询任务详情<span className="ritem-dots" /></>}
        </div>
      )}

      {t.videoUrl && (
        <div className="ritem-media">
          <video
            src={t.videoUrl}
            controls loop muted playsInline
            style={{ aspectRatio: t.meta?.width && t.meta?.height ? `${t.meta.width} / ${t.meta.height}` : ratioCss(p?.aspectRatio) }}
          />
          {t.lastFrameUrl && (
            <div className="ritem-last">
              <img src={t.lastFrameUrl} alt="尾帧" />
              <span>尾帧图</span>
            </div>
          )}
        </div>
      )}

      <div className="ritem-foot">
        <span className="mono" title="点击复制 TaskId" onClick={() => onCopy(t.taskId)}>TaskId {t.taskId}</span>
        {t.meta?.duration ? <span>{t.meta.duration.toFixed(1)}s</span> : null}
        {t.meta?.width ? <span>{t.meta.width}×{t.meta.height}</span> : null}
        {t.tokens?.total != null && <span>Token 输入 {t.tokens.input ?? '-'} · 输出 {t.tokens.completion ?? '-'} · 总计 {t.tokens.total}</span>}
        {t.videoUrl && (
          <>
            <span className="ritem-sp" />
            <a className="ritem-link" href={t.videoUrl} download target="_blank" rel="noreferrer">下载视频</a>
            <button className="ritem-link" onClick={() => onCopy(t.videoUrl!)}>复制链接</button>
          </>
        )}
      </div>
    </div>
  )
}
