import AssetCreator from './AssetCreator'

interface Props {
  groupId: string
  groupName: string
  isReal: boolean
  onCreated: (assetId: string) => void
  onClose: () => void
  copy: (t: string) => void
}

/** 往指定组添加素材：GroupId / IsRealPerson 继承该组。素材库页与素材选择弹窗共用 */
export default function AddAssetModal({ groupId, groupName, isReal, onCreated, onClose, copy }: Props) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">添加素材到「{groupName}」</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body modal-scroll">
          <div className="inherit-bar">
            <span>GroupId：<b>{groupId}</b></span>
            <span>IsRealPerson：<b>{isReal ? 'True（真人）' : 'False'}</b></span>
          </div>
          {isReal && (
            <div className="field-hint" style={{ marginTop: 0, marginBottom: 12 }}>真人组只能添加活体认证本人的人脸素材。</div>
          )}
          <AssetCreator groupId={groupId} isRealPerson={isReal ? 'True' : 'False'} onCreated={onCreated} copy={copy} />
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  )
}
