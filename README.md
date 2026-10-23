# Vega-Video 控制台

基于腾讯云点播（VOD）的 Vega-Video 视频生成测试控制台：Vega-Video Lite / Pro 文生视频、首尾帧、多模态参考、编辑延长，以及 Vega-Video Pro 素材库管理。

## 支持的模型版本

接口 `CreateAigcVideoTask`，`ModelName` 固定 `wand-vega-video`：

| 显示名 | ModelVersion | 时长 | 说明 |
|---|---|---|---|
| Vega-Video 1.0-Lite | `1.0-lite` | 4~15 秒 | 不支持素材库 asset:// |
| Vega-Video 1.5-Lite | `1.5-lite` | 2~30 秒 / 智能 | 480P/720P/1080P，不支持 21:9，参考图 10 张、视频/音频各 5 段 |
| Vega-Video 1.0-Pro | `1.0-pro` | 4~15 秒 / 自动 | 支持素材库、编辑/延长 |
| Vega-Video 1.0-Pro-Fast | `1.0-pro-fast` | 4~15 秒 / 自动 | 同上 |
| Vega-Video 1.0-Pro-Mini | `1.0-pro-mini` | 4~15 秒 / 自动 | 同上 |
| Vega-Video 1.5-Pro | `1.5-pro` | 4~30 秒 | 参考图 30 张、视频/音频各 10 段 |

时长默认 5 秒；各模型的素材数量和大小限制在页面上会按所选版本自动校验。

ExtInfo 高级参数按版本区分：生成模式（GenerateMode）、画质模式（VideoQualityMode）、审核模式（ModerationMode）、返回 Vega 用量（ReturnVegaUsage）仅 **Vega-Video 1.0-Lite** 提供；Prompt 优化（EnhancePromptMode）1.0-Lite 默认开、其余版本默认关。

## 快速使用（只需 Node.js 18+）

压缩包已包含打包好的前端（`dist/`），无需 `npm install`：

- **macOS**：双击 `start.command`（首次如提示无法打开：右键 → 打开）
- **Windows**：双击 `start.bat`
- **命令行**：`node server/index.mjs`

然后浏览器打开 **http://localhost:8088**，点左下角「连接设置」填写 SecretId / SecretKey / SubAppId 即可。

> 端口被占用时：`PORT=8090 node server/index.mjs`（Windows：`set PORT=8090 && node server\index.mjs`）

## 密钥说明

- 密钥只保存在你自己浏览器的 localStorage，由本机代理签名后调用 VOD，不会上传到其他地方
- 也可用环境变量预置：`TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY` / `VEGA_SUB_APP_ID`
- 上传本地素材会存入所配置 VOD 应用的媒资库，产生存储费用

## 二次开发

```bash
npm install
npm run server   # 代理 :8088
npm run dev      # 前端 :5175（热更新，/api 自动转发到 8088）
npm run build    # 重新打包 dist/
```

目录：`server/index.mjs` 零依赖代理（TC3 签名、ExtInfo 转义、上传、素材库）；`src/` React + TypeScript 前端。
