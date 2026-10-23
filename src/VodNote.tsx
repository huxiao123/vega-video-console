/** 上传本地 / 已有媒资 的计费与数据来源说明（素材库、首尾帧、多模态参考共用） */
export const UPLOAD_NOTE = '文件将上传至「连接设置」中所配置 VOD 应用（SubAppId）的媒资库，会按 VOD 标准产生存储费用。'
export const MEDIA_NOTE = '展示该 VOD 应用媒资库中已存储的内容，直接引用，不会重复上传。'

/** 醒目版（浅黄提示条）：素材库添加素材弹窗用 */
export default function VodNote({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="vod-note" style={style}>
      <div><b>⬆ 上传本地：</b>{UPLOAD_NOTE}</div>
      <div><b>🗂 已有媒资：</b>{MEDIA_NOTE}</div>
    </div>
  )
}

/** 紧凑版（灰色小字）：紧贴在来源按钮下方 */
export function SrcNote() {
  return (
    <div className="src-note">
      <div><b>本地上传</b><span>存入所配置 VOD 应用的媒资库，产生存储费用</span></div>
      <div><b>已有媒资</b><span>展示该应用媒资库中已有内容，直接引用不重复上传</span></div>
    </div>
  )
}
