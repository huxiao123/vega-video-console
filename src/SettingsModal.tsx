import { useState } from 'react'
import { type VegaSettings, loadSettings, saveSettings, isConfigured } from './settings'

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<VegaSettings>(loadSettings())
  const [showKey, setShowKey] = useState(false)

  const save = () => {
    saveSettings({
      secretId: s.secretId.trim(),
      secretKey: s.secretKey.trim(),
      subAppId: s.subAppId.trim(),
    })
    onClose()
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">连接设置</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="notice" style={{ marginBottom: 16 }}>
            <b>凭据仅保存在本机浏览器 localStorage</b>，随请求发给本地代理（localhost:8088）完成签名，不上传任何云端。不放心可改用环境变量启动代理（TENCENTCLOUD_SECRET_ID / SECRET_KEY / VEGA_SUB_APP_ID）。
          </div>
          <div className="field">
            <div className="label">SecretId（AK）</div>
            <input
              type="text"
              value={s.secretId}
              onChange={(e) => setS({ ...s, secretId: e.target.value })}
              placeholder="AKIDxxxxxxxx"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <div className="label">SecretKey（SK）</div>
            <div className="key-row">
              <input
                type={showKey ? 'text' : 'password'}
                value={s.secretKey}
                onChange={(e) => setS({ ...s, secretKey: e.target.value })}
                placeholder="输入 SecretKey"
                autoComplete="new-password"
              />
              <button className="btn btn-ghost btn-sm" onClick={() => setShowKey((v) => !v)}>
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
          </div>
          <div className="field">
            <div className="label">SubAppId（点播应用 ID）</div>
            <input
              type="number"
              value={s.subAppId}
              onChange={(e) => setS({ ...s, subAppId: e.target.value })}
              placeholder="如 1500044236"
            />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={!isConfigured(s)}>保存</button>
        </div>
      </div>
    </div>
  )
}
