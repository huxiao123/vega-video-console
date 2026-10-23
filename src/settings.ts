export interface VegaSettings {
  secretId: string
  secretKey: string
  subAppId: string
}

const KEY = 'vega_settings'

export function loadSettings(): VegaSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { secretId: '', secretKey: '', subAppId: '', ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { secretId: '', secretKey: '', subAppId: '' }
}

export function saveSettings(s: VegaSettings) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function isConfigured(s: VegaSettings) {
  return Boolean(s.secretId.trim() && s.secretKey.trim() && s.subAppId.trim())
}
