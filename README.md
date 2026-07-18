# General Stream Subtitle

面向 Surge、Loon 与 Shadowrocket 的模块化字幕翻译中间件。v0.5.0 新增 YouTube 系字幕适配，同时保留 HLS/DASH、多字幕格式和多翻译 Provider。

## YouTube v0.5.0

- 普通 YouTube 视频与 Shorts：读取 `youtubei/v1/player` 的 `captionTracks`，加入 `Translate-zh`。
- 自动字幕：支持 YouTube 已生成的 ASR 轨道；默认人工字幕优先。
- 直播与 YouTube TV：处理播放器暴露的 timedtext/JSON3/srv3 文本字幕，并保留直播轮询参数。
- 字幕格式：YouTube transcript XML、srv3 XML、JSON3、WebVTT。
- 两种策略：`direct` 直接拦截 YouTube timedtext；`virtual` 使用 `gss.local` 网关。
- 没有 `captionTracks` 的内容不会凭空生成字幕。只有嵌入视频流、未暴露成文本轨的 CEA-608/708 暂不解码，Whisper/本地音频识别后续处理。

## 安装

- Shadowrocket: `https://raw.githubusercontent.com/dxy0218/general-stream-subtitle/main/modules/GeneralStreamSubtitle.module`
- Loon: `https://raw.githubusercontent.com/dxy0218/general-stream-subtitle/main/modules/GeneralStreamSubtitle.plugin`
- Surge: `https://raw.githubusercontent.com/dxy0218/general-stream-subtitle/main/modules/GeneralStreamSubtitle.sgmodule`

打开 `http://gss.local/` 配置源语言、翻译引擎、YouTube ASR/直播和字幕接管策略。

## 构建与测试

```bash
npm run check
```

## 限制

本项目不修改 DRM、账号鉴权或视频音频内容。YouTube 内部接口和 CDN 可能随客户端版本调整，真机测试仍是必要环节。
