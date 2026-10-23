// 模型能力矩阵 + 类型定义

export type ModelVersion = '1.0-lite' | '1.5-lite' | '1.0-pro' | '1.0-pro-fast' | '1.0-pro-mini' | '1.5-pro'

export type RefCat = 'Image' | 'Video' | 'Audio'

export interface ModelSpec {
  version: ModelVersion
  label: string
  isLite: boolean
  resolutions: string[]
  durationMin: number
  durationMax: number
  durationAuto: boolean // 支持 -1 自动时长
  // ExtInfo 默认值差异：Lite 默认开 prompt 优化，pro 默认关
  enhancePromptDefault: 'enable' | 'disable'
  /** 是否支持 GenerateMode / VideoQualityMode / ModerationMode / ReturnVegaUsage（仅 1.0-Lite） */
  extInfoModes?: boolean
  /** 多模态参考数量上限 */
  refLimits: Record<RefCat, number> & { total: number }
  /** 单文件大小上限（MB），未声明则不校验 */
  maxSizeMB?: Partial<Record<RefCat, number>>
  /** 参考视频 / 音频总时长上限（秒） */
  maxRefMediaSec?: number
  /** 所有生成模式都可选 adaptive 宽高比（否则仅多模态参考可选） */
  adaptiveAll?: boolean
  /** 支持的固定宽高比（不含 adaptive），未声明则用 ASPECT_RATIOS */
  aspectRatios?: string[]
}

const PRO_LIMITS = { Image: 9, Video: 3, Audio: 3, total: 12 }

export const MODELS: ModelSpec[] = [
  {
    version: '1.0-lite', label: 'Vega-Video 1.0-Lite', isLite: true,
    resolutions: ['480P', '768P', '1080P', '2K', '4K'],
    durationMin: 4, durationMax: 15, durationAuto: false,
    enhancePromptDefault: 'enable',
    extInfoModes: true,
    refLimits: { Image: 9, Video: 3, Audio: 3, total: 12 },
    maxSizeMB: { Image: 30, Video: 50, Audio: 15 },
    maxRefMediaSec: 15,
  },
  {
    version: '1.5-lite', label: 'Vega-Video 1.5-Lite', isLite: true,
    resolutions: ['480P', '720P', '1080P'],
    durationMin: 2, durationMax: 30, durationAuto: true,
    enhancePromptDefault: 'disable',
    refLimits: { Image: 10, Video: 5, Audio: 5, total: 20 },
    maxSizeMB: { Image: 20, Video: 100, Audio: 15 },
    maxRefMediaSec: 15,
    adaptiveAll: true,
    // 接口实测不支持 21:9
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16'],
  },
  {
    version: '1.0-pro', label: 'Vega-Video 1.0-Pro', isLite: false,
    resolutions: ['720P', '1080P', '2K', '4K'],
    durationMin: 4, durationMax: 15, durationAuto: true,
    enhancePromptDefault: 'disable',
    refLimits: PRO_LIMITS,
  },
  {
    version: '1.0-pro-fast', label: 'Vega-Video 1.0-Pro-Fast', isLite: false,
    resolutions: ['720P', '1080P', '2K', '4K'],
    durationMin: 4, durationMax: 15, durationAuto: true,
    enhancePromptDefault: 'disable',
    refLimits: PRO_LIMITS,
  },
  {
    version: '1.0-pro-mini', label: 'Vega-Video 1.0-Pro-Mini', isLite: false,
    resolutions: ['720P', '1080P', '2K', '4K'],
    durationMin: 4, durationMax: 15, durationAuto: true,
    enhancePromptDefault: 'disable',
    refLimits: PRO_LIMITS,
  },
  {
    version: '1.5-pro', label: 'Vega-Video 1.5-Pro', isLite: false,
    resolutions: ['720P', '1080P', '2K', '4K'],
    durationMin: 4, durationMax: 30, durationAuto: true,
    enhancePromptDefault: 'disable',
    refLimits: { Image: 30, Video: 10, Audio: 10, total: 50 },
  },
]

/** 模型版本下拉里的一行说明 */
export const modelBrief = (m: ModelSpec) =>
  `${m.durationMin}-${m.durationMax}s${m.durationAuto ? ' / 智能' : ''} · ${m.resolutions[0]}-${m.resolutions[m.resolutions.length - 1]}`

export const ASPECT_RATIOS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']

export type GenMode = 't2v' | 'frames' | 'reference' | 'editExtend'

export interface GenModeDef {
  key: GenMode
  label: string
  /** 分段按钮里用的短名（左栏宽度有限） */
  short: string
  desc: string
  needFirst?: boolean
  /** 尾帧可选：不传即首帧生视频，传了即首尾帧生视频 */
  optionalLast?: boolean
  needRefs?: boolean
  proOnly?: boolean
}

export const GEN_MODES: GenModeDef[] = [
  { key: 't2v', label: '文生视频', short: '文生视频', desc: '纯文本生成' },
  { key: 'frames', label: '首尾帧生视频', short: '首尾帧', desc: '必传首帧；尾帧可选，不传即首帧生视频', needFirst: true, optionalLast: true },
  { key: 'reference', label: '多模态参考', short: '多模态参考', desc: '图/视频/音频混合参考', needRefs: true },
  { key: 'editExtend', label: '编辑/延长', short: '编辑/延长', desc: '视频编辑或前后延长（仅 Pro）', needRefs: true, proOnly: true },
]

export interface FileInfoInput {
  category: 'Image' | 'Video' | 'Audio'
  url: string
  usage: 'FirstFrame' | 'LastFrame' | 'Reference'
  /** 仅前端展示用（不提交）：素材名 / 来源 / 预览图 */
  name?: string
  source?: 'url' | 'upload' | 'media' | 'asset'
  preview?: string
  /** 本地上传时探测到的时长（秒），用于总时长校验 */
  durationSec?: number
}

// ---- 任务查询结果 ----
export interface AigcVideoFileInfoOut {
  FileUrl: string
  UsageType?: string
  StorageMode?: string
  ExpireTime?: string
  MetaData?: { Duration?: number; Width?: number; Height?: number; Size?: number } | null
}

export interface AigcVideoTask {
  Status: string
  /** 0 = 成功；FINISH 但非 0 即失败（已不推荐，优先看 ErrCodeExt） */
  ErrCode?: number
  /** 空串 = 成功，其他值 = 失败错误码 */
  ErrCodeExt?: string
  Message?: string
  Progress?: number
  TaskId?: string
  Input?: { ModelVersion?: string; Prompt?: string }
  Output?: {
    FileInfos?: AigcVideoFileInfoOut[]
    Usage?: { InputTokens?: number; ThoughtTokens?: number; CompletionTokens?: number; TotalTokens?: number }
  }
}

export interface TaskDetailResponse {
  Status: string
  TaskType?: string
  AigcVideoTask?: AigcVideoTask | null
  CreateAigcMaterialTask?: {
    Status: string
    ErrCode?: number
    ErrCodeExt?: string
    Message?: string
    Progress?: number
    Input?: { AssetName?: string; GroupId?: string; IsRealPerson?: string }
    Output?: { AssetId?: string; AssetUrl?: string; GroupId?: string }
  } | null
  CreateTime?: string
  FinishTime?: string
}

// ---- 前端任务卡片 ----
/** 生成页表单快照：草稿持久化 + 「复用此参数」共用 */
export interface GenParams {
  modelVersion: ModelVersion
  mode: GenMode
  prompt: string
  firstFrame: string
  lastFrame: string
  refs: FileInfoInput[]
  resolution: string
  aspectRatio: string
  duration: number
  audio: boolean
  storagePermanent: boolean
  seed: string
  enhancePrompt: 'enable' | 'disable'
  moderation: 'Moderation_L1' | 'Moderation_L2'
  returnUsage: boolean
  generateMode: 'Standard' | 'Fast' | 'StandardMovie'
  videoQuality: 'Standard' | 'Fast' | 'SuperFast'
  returnLastFrame: boolean
  omniType: 'auto' | 'reference' | 'edit' | 'extend'
}

export interface TaskCard {
  taskId: string
  modelVersion: string
  mode: GenMode
  prompt: string
  createdAt: number
  /** 提交时的完整参数（用于复用 / 展示 tag） */
  params?: GenParams
  status: 'WAITING' | 'PROCESSING' | 'FINISH' | 'FAIL'
  /** 任务详情返回的错误码（ErrCodeExt，缺省回退 ErrCode） */
  errCode?: string
  message?: string
  /** 已按 ErrCode 规则复核过（兼容旧记录：FINISH 无视频时补查一次） */
  checked?: boolean
  videoUrl?: string
  lastFrameUrl?: string
  tokens?: { input?: number; completion?: number; total?: number }
  meta?: { duration?: number; width?: number; height?: number }
}

// ---- 已有媒资（VOD 媒体库） ----
export interface MediaItem {
  FileId: string
  Name?: string
  Category?: string
  Type?: string
  MediaUrl?: string
  CoverUrl?: string
  CreateTime?: string
  Status?: string
}

// ---- 素材 ----
export interface MaterialAsset {
  AssetId: string
  AssetName?: string
  AssetType?: string
  GroupId?: string
  GroupName?: string
  Url?: string
  AssetUrl?: string
  CreateTime?: string
}

// ---- 素材组 ----
export interface MaterialGroupInfo {
  GroupId?: string
  GroupName?: string
  GroupDescription?: string
  GroupType?: string
  CreateTime?: string
  UpdateTime?: string
}
