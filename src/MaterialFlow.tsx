import { useState } from 'react'

interface Node { icon: string; title: string; desc: string }

const REAL: Node[] = [
  { icon: '👤', title: '新建真人组', desc: '「+ 新建素材组」→ 新建真人组' },
  { icon: '📱', title: '活体认证', desc: '复制 / 打开 H5 链接，手机完成认证' },
  { icon: '🔑', title: '获得 GroupId', desc: '绑定认证人脸，自动登记到素材库' },
]
const FAKE: Node[] = [
  { icon: '🧩', title: '新建非真人组', desc: '「+ 新建素材组」→ 新建非真人组' },
  { icon: '✍️', title: '自定义 GroupId', desc: '自己起 GroupId + 组名，免认证' },
  { icon: '📁', title: '组随首个素材创建', desc: 'VOD 无独立建组接口，建首个素材即建组' },
]
const SHARED: Node[] = [
  { icon: '⬆️', title: '添加素材', desc: '上传本地 / 选已有媒资 / 填 URL，类型自动识别' },
  { icon: '⏳', title: '素材处理', desc: '异步任务，自动轮询拿 AssetId' },
  { icon: '📋', title: '复制 asset://', desc: '素材卡片一键复制引用' },
  { icon: '🎬', title: '生成视频引用', desc: '生成页「从素材库选择」或粘贴 asset://' },
]

const KEY = 'vega_flow_collapsed'

function FlowNode({ n, tone }: { n: Node; tone: 'real' | 'fake' | 'shared' }) {
  return (
    <div className={`flow-node flow-${tone}`}>
      <span className="flow-icon">{n.icon}</span>
      <span className="flow-text">
        <span className="flow-title">{n.title}</span>
        <span className="flow-desc">{n.desc}</span>
      </span>
    </div>
  )
}

function Chain({ nodes, tone }: { nodes: Node[]; tone: 'real' | 'fake' | 'shared' }) {
  return (
    <div className="flow-chain">
      {nodes.map((n, i) => (
        <span className="flow-step" key={n.title}>
          {i > 0 && <span className="flow-arrow">→</span>}
          <FlowNode n={n} tone={tone} />
        </span>
      ))}
    </div>
  )
}

/** Vega Pro 素材库整体流程图：① 建组（两条分支二选一）→ ② 添加素材与引用（共用） */
export default function MaterialFlow({ embedded = false }: { embedded?: boolean }) {
  const [collapsed, setCollapsed] = useState(() => !embedded && localStorage.getItem(KEY) === '1')
  const toggle = () => {
    const v = !collapsed
    setCollapsed(v)
    localStorage.setItem(KEY, v ? '1' : '0')
  }

  return (
    <div className={embedded ? 'flow-embedded' : 'card flow-card'}>
      {!embedded && (
        <div className="card-head">
          <div className="card-title" style={{ marginBottom: 0 }}>
            素材库流程
            <span className="title-count">素材与素材组都存在腾讯云 VOD</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={toggle}>{collapsed ? '展开' : '收起'}</button>
        </div>
      )}

      {!collapsed && (
        <div className="flow-scroll">
          <div className="flow-board">
            <div className="flow-stage-label"><span className="step-no">1</span>建组（按素材类型二选一）</div>
            <div className="flow-lane">
              <span className="flow-lane-tag flow-tag-real">国内站真人</span>
              <Chain nodes={REAL} tone="real" />
            </div>
            <div className="flow-lane">
              <span className="flow-lane-tag flow-tag-fake">国际站真人 / 虚拟人 / 国内站开免活体认证</span>
              <Chain nodes={FAKE} tone="fake" />
            </div>

            <div className="flow-merge-down">
              <span className="flow-merge-arrow">↓</span>
              <span>两条路径汇合；已有 GroupId 可用「补录已有组」跳过建组</span>
            </div>

            <div className="flow-stage-label"><span className="step-no">2</span>添加素材与引用（真人 / 非真人共用）</div>
            <div className="flow-lane">
              <span className="flow-lane-tag flow-tag-shared">当前选中组</span>
              <Chain nodes={SHARED} tone="shared" />
            </div>

            <div className="flow-foot">
              <span>👤 同一人认证一次，真人组可长期复用；真人组只能放认证本人的人脸</span>
              <span>⚠️ 国内站直接用含人脸的 URL 生成会被拒，必须走 <b>asset://</b> 引用</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
