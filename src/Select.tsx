import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface SelectOption<T extends string | number> {
  value: T
  label: ReactNode
  /** 选项右侧/下方的灰色说明 */
  desc?: ReactNode
  disabled?: boolean
}

interface Props<T extends string | number> {
  value: T
  options: SelectOption<T>[]
  onChange: (v: T) => void
  disabled?: boolean
  placeholder?: string
  /** 紧凑尺寸（行内小下拉） */
  size?: 'sm'
  className?: string
  /** 菜单最小宽度（默认与触发器同宽） */
  menuMinWidth?: number
}

const MENU_MAX_H = 280

/**
 * 自定义下拉：替代原生 <select>（原生弹层在 macOS 上无法美化）
 * 菜单用 fixed 定位，不受滚动容器 overflow 裁剪；空间不足时向上弹
 */
export default function Select<T extends string | number>({
  value, options, onChange, disabled, placeholder = '请选择', size, className = '', menuMinWidth,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxH: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const current = options.find((o) => o.value === value)

  /** 只滚菜单自身（scrollIntoView 会连带滚外层容器，触发关闭） */
  const reveal = (el?: HTMLElement | null) => {
    const m = menuRef.current
    if (!m || !el) return
    if (el.offsetTop < m.scrollTop) m.scrollTop = el.offsetTop - 5
    else if (el.offsetTop + el.offsetHeight > m.scrollTop + m.clientHeight) m.scrollTop = el.offsetTop + el.offsetHeight - m.clientHeight + 5
  }

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const want = Math.min(MENU_MAX_H, options.length * 40 + 10)
    const width = Math.max(r.width, menuMinWidth || 0)
    const left = Math.min(r.left, window.innerWidth - width - 8)
    if (below >= want || below >= above) setPos({ left, top: r.bottom + 4, width, maxH: Math.min(MENU_MAX_H, below) })
    else setPos({ left, bottom: window.innerHeight - r.top + 4, width, maxH: Math.min(MENU_MAX_H, above) })
  }

  useLayoutEffect(() => { if (open) place() }, [open]) // eslint-disable-line

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    // 外层滚动时关闭（fixed 菜单不会跟着走）
    const onScroll = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false) }
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  // 打开时把当前项滚到可见
  useEffect(() => {
    if (!open || !menuRef.current) return
    reveal(menuRef.current.querySelector<HTMLElement>('.sel-opt.on'))
  }, [open, pos])

  const toggle = () => {
    if (disabled) return
    setActive(options.findIndex((o) => o.value === value))
    setOpen((v) => !v)
  }

  const choose = (o: SelectOption<T>) => {
    if (o.disabled) return
    onChange(o.value)
    setOpen(false)
    btnRef.current?.focus()
  }

  const move = (d: number) => {
    if (!options.length) return
    let i = active
    for (let n = 0; n < options.length; n++) {
      i = (i + d + options.length) % options.length
      if (!options[i].disabled) break
    }
    setActive(i)
    reveal(menuRef.current?.querySelectorAll<HTMLElement>('.sel-opt')[i])
  }

  const onKey = (e: KeyboardEvent) => {
    if (disabled) return
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { toggle(); return }
      move(e.key === 'ArrowDown' ? 1 : -1)
    }
    if ((e.key === 'Enter' || e.key === ' ') && open && options[active]) {
      e.preventDefault()
      choose(options[active])
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`sel ${size === 'sm' ? 'sm' : ''} ${open ? 'open' : ''} ${className}`}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={onKey}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`sel-val ${current ? '' : 'ph'}`}>{current ? current.label : placeholder}</span>
        <svg className="sel-arrow" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && pos && (
        <div
          ref={menuRef}
          className={`sel-menu ${pos.bottom !== undefined ? 'up' : ''}`}
          role="listbox"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxH }}
        >
          {options.map((o, i) => (
            <div
              key={String(o.value)}
              role="option"
              aria-selected={o.value === value}
              className={`sel-opt ${o.value === value ? 'on' : ''} ${i === active ? 'act' : ''} ${o.disabled ? 'dis' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
            >
              <span className="sel-opt-main">
                <span className="sel-opt-label">{o.label}</span>
                {o.desc && <span className="sel-opt-desc">{o.desc}</span>}
              </span>
              {o.value === value && (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <path d="M3 7.2 5.8 10 11 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
