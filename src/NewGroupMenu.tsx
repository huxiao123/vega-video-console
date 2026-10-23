import { useState } from 'react'
import type { NewGroupMode } from './NewGroupModal'

interface Props {
  onPick: (mode: NewGroupMode) => void
  /** 按钮样式，默认蓝色通栏 */
  btnClass?: string
  label?: string
  /** 菜单向上弹（按钮在底部时） */
  up?: boolean
}

/** 「+ 新建素材组」按钮 + 菜单（真人 / 非真人 / 补录），素材库页与素材选择弹窗共用 */
export default function NewGroupMenu({ onPick, btnClass = 'btn btn-primary btn-block', label = '+ 新建素材组', up = true }: Props) {
  const [open, setOpen] = useState(false)
  const pick = (m: NewGroupMode) => {
    setOpen(false)
    onPick(m)
  }
  return (
    <div className="dropdown">
      <button className={btnClass} onClick={() => setOpen((v) => !v)}>{label}</button>
      {open && (
        <>
          <div className="dropdown-mask" onClick={() => setOpen(false)} />
          <div className={`dropdown-menu ${up ? 'up' : ''}`}>
            <button className="dropdown-item" onClick={() => pick('real')}>
              <span className="di-title">👤 新建真人组</span>
              <span className="di-desc">国内站真人人脸，需活体认证</span>
            </button>
            <button className="dropdown-item" onClick={() => pick('fake')}>
              <span className="di-title">🧩 新建非真人组</span>
              <span className="di-desc">国际站真人 / 虚拟人 / 物品场景，免认证</span>
            </button>
            <div className="dropdown-sep" />
            <button className="dropdown-item" onClick={() => pick('import')}>
              <span className="di-title">↩ 补录已有组</span>
              <span className="di-desc">换设备或已有 GroupId 时登记</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
