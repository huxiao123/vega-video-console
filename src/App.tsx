import { useCallback, useEffect, useState } from 'react'
import GeneratePage from './GeneratePage'
import MaterialPage from './MaterialPage'
import SettingsModal from './SettingsModal'
import { api } from './api'
import { loadSettings } from './settings'

type Tab = 'gen' | 'material'

const TABS: { key: Tab; icon: string; label: string; desc: string }[] = [
  { key: 'gen', icon: '🎬', label: '视频生成', desc: 'Vega 生视频测试' },
  { key: 'material', icon: '👤', label: 'Vega Pro 素材库', desc: '素材组 · 真人 / 非真人素材' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('gen')
  const [showSettings, setShowSettings] = useState(false)
  const [health, setHealth] = useState<{ configured: boolean; subAppId: number } | null>(null)
  const [subAppId, setSubAppId] = useState(loadSettings().subAppId)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('vega_side_collapsed') === '1')
  const toggleSide = () => setCollapsed((v) => {
    localStorage.setItem('vega_side_collapsed', v ? '0' : '1')
    return !v
  })

  const refreshHealth = useCallback(() => {
    api.health()
      .then((h) => {
        setHealth(h)
        if (h.subAppId) setSubAppId(String(h.subAppId))
      })
      .catch(() => setHealth(null))
  }, [])

  useEffect(refreshHealth, [refreshHealth])

  const active = TABS.find((t) => t.key === tab)!

  return (
    <div className="app">
      {/* 左侧菜单 */}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="side-brand">
          <span className="side-logo">▶</span>
          <div>
            <div className="side-title">Vega Video</div>
            <div className="side-sub">控制台</div>
          </div>
        </div>
        <nav className="side-menu">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`side-item ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
              title={collapsed ? t.label : undefined}
            >
              <span className="side-icon">{t.icon}</span>
              <span className="side-text">
                <span className="side-label">{t.label}</span>
                <span className="side-desc">{t.desc}</span>
              </span>
            </button>
          ))}
        </nav>
        <button className="side-collapse" onClick={toggleSide} title={collapsed ? '展开侧边栏' : '收起侧边栏'}>
          <span className="side-icon">{collapsed ? '»' : '«'}</span>
          <span className="side-collapse-text">收起侧边栏</span>
        </button>
        <button
          className={`side-settings ${health?.configured ? '' : 'warn'}`}
          onClick={() => setShowSettings(true)}
          title={collapsed ? `连接设置 · ${health?.configured ? '已配置' : '未配置密钥'}` : undefined}
        >
          <span className="side-icon">⚙</span>
          <span className="side-text">
            <span className="side-label">连接设置</span>
            <span className="side-desc">{health?.configured ? '已配置' : '未配置密钥'}</span>
          </span>
        </button>
      </aside>

      {/* 右侧主区 */}
      <div className="body">
        <header className="topbar">
          <div>
            <div className="topbar-title">{active.label}</div>
            <div className="topbar-sub">{active.desc} · wand-vega-video</div>
          </div>
          <div className="topbar-right">
            {health && (
              <span className={`badge ${health.configured ? 'ok' : 'warn'}`}>
                {health.configured ? `SubAppId ${subAppId}` : '未配置密钥'}
              </span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(true)}>⚙ 设置</button>
          </div>
        </header>
        <main className="main main-flush">
          {tab === 'gen' ? <GeneratePage /> : <MaterialPage />}
        </main>
      </div>

      {showSettings && (
        <SettingsModal
          onClose={() => {
            setShowSettings(false)
            refreshHealth()
          }}
        />
      )}
    </div>
  )
}
