// 本地素材组索引：VOD 无「查素材组列表」接口，用 localStorage 记录已知组，弥补组导航
export interface GroupIndexItem {
  groupId: string
  groupName?: string
  isRealPerson?: 'True' | 'False'
  updatedAt: number
}

const KEY = 'vega_material_groups'
const EVT = 'vega-groups-changed'

// 通知所有监听者（MaterialLibrary 等）重新读取索引
function emitChanged() {
  try {
    window.dispatchEvent(new CustomEvent(EVT))
  } catch { /* ignore */ }
}

export function loadGroups(): GroupIndexItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const list = JSON.parse(raw)
      if (Array.isArray(list)) return list
    }
  } catch { /* ignore */ }
  return []
}

export function registerGroup(item: Omit<GroupIndexItem, 'updatedAt'>): GroupIndexItem[] {
  const list = loadGroups().filter((g) => g.groupId !== item.groupId)
  list.unshift({ ...item, updatedAt: Date.now() })
  localStorage.setItem(KEY, JSON.stringify(list))
  emitChanged()
  return list
}

export function removeGroupFromIndex(groupId: string): GroupIndexItem[] {
  const list = loadGroups().filter((g) => g.groupId !== groupId)
  localStorage.setItem(KEY, JSON.stringify(list))
  emitChanged()
  return list
}

// 供 MaterialLibrary 订阅组索引变化
export function onGroupsChanged(cb: () => void): () => void {
  window.addEventListener(EVT, cb)
  return () => window.removeEventListener(EVT, cb)
}
