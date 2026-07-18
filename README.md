# General Stream Subtitle

面向 **Surge、Loon 与 Shadowrocket** 的轻量流媒体字幕中间件。项目通过 HTTPS MITM 拦截 HLS 主播放清单，在字幕菜单中注入一个可见的 **`Translate-zh`** 轨道；只有用户选择该轨道后，脚本才获取原字幕并调用翻译引擎生成双语字幕。

当前版本为 **v0.3.0**。项目不修改视频、音频、DRM、账号鉴权或播放授权。

## v0.3.0 重点变化

- 源语言默认改为 `auto`。
- 可指定 `en`、`ja`、`ko`、`es`、`fr` 或其他 BCP-47 语言代码。
- `auto` 会从非强制字幕中只挑选一条，避免字幕菜单出现大量重复轨道。
- 新增平台注册表和平台开关。
- 新增 Apple TV、Apple TV+ 与 **Apple Fitness+**。
- 新增 Disney+、Prime Video HLS、Hulu、Paramount+、Peacock、Discovery+、Fubo 与 TED。
- 本地管理页可分别启用或关闭平台。

## 自动源语言选择

当 `source=auto` 时，候选字幕按以下顺序评分：

1. 排除 `FORCED=YES` 的强制字幕；
2. 优先 `DEFAULT=YES`；
3. 优先 `AUTOSELECT=YES`；
4. 再按 `sourcePriority` 排序，默认 `en,ja,ko,es,fr,de,it,pt`；
5. 普通字幕优先于 SDH、CC、描述性字幕。

选定轨道带有 `LANGUAGE` 时，会把实际语言代码传给 Google；没有语言标记时才让 Google 自动检测。

## 当前支持范围

| 平台 | 平台 ID | 当前范围 |
|---|---|---|
| Max / HBO Max | `max` | HLS + WebVTT |
| Apple TV | `apple-tv` | HLS + WebVTT |
| Apple TV+ | `apple-tv-plus` | HLS + WebVTT |
| Apple Fitness+ | `apple-fitness` | HLS + WebVTT |
| Disney+ | `disney` | HLS + WebVTT |
| Prime Video | `prime` | HLS + WebVTT；TTML/DASH 暂不支持 |
| Hulu | `hulu` | HLS + WebVTT |
| Paramount+ | `paramount` | HLS + WebVTT |
| Peacock | `peacock` | HLS + WebVTT |
| Discovery+ | `discovery` | HLS + WebVTT |
| Fubo | `fubo` | HLS + WebVTT |
| TED | `ted` | HLS + WebVTT |

这些平台的域名与清单形态可能随地区、App 版本和 CDN 调整，因此除自动测试外仍需要真机逐个平台验证。

## 尚未支持

- Netflix：主要需要 DASH/MPD、TTML/IMSC 与额外播放接口适配。
- YouTube：字幕与播放清单结构不是当前通用 HLS 适配器。
- Plex、Jellyfin、Emby 的非 HLS 字幕模式。
- Prime Video 的 TTML2/DASH 字幕。
- 直播滚动字幕、OCR 与烧录字幕。

## 工作流程

```text
流媒体 master.m3u8
  └─ manifest.js 识别平台并挑选源字幕
       └─ 注入 Translate-zh
            └─ URI 指向 https://gss.local/playlist
                 └─ gateway.js 获取原字幕 playlist
                      └─ 将字幕分段虚拟化为 https://gss.local/subtitle
                           └─ 选择轨道后按需翻译并返回双语 WebVTT
```

## 安装链接

### Surge

```text
https://raw.githubusercontent.com/dxy0218/general-stream-subtitle/main/modules/GeneralStreamSubtitle.sgmodule
```

### Loon

```text
https://raw.githubusercontent.com/dxy0218/general-stream-subtitle/main/modules/GeneralStreamSubtitle.plugin
```

### Shadowrocket

```text
https://raw.githubusercontent.com/dxy0218/general-stream-subtitle/main/modules/GeneralStreamSubtitle.module
```

安装后需要：

1. 在对应软件中生成或安装 CA 证书；
2. 在系统中信任证书；
3. 开启 HTTPS 解密 / MITM；
4. 启用本模块；
5. 完全退出并重新打开要测试的流媒体 App；
6. 播放本身带字幕的点播内容；
7. 在字幕菜单选择 `Translate-zh`。

## 设置页面

优先打开：

```text
http://gss.local/
```

实验性回环入口：

```text
http://127.0.0.1:6170/gss/
```

可以设置：

- `auto` 或指定源语言；
- 自动源语言优先级；
- 目标语言；
- 字幕轨名称；
- 双语顺序；
- 是否显示纯翻译轨；
- 各平台开关；
- 缓存与调试日志。

配置保存在代理软件的 `$persistentStore` 中。此页面由请求脚本合成，并非设备上真正监听端口的常驻服务器。

## 模块参数

默认值：

```text
SOURCE=auto
TARGET=zh-CN
TRACK_NAME=Translate-zh
PLATFORMS=all
PURE_TRACK=false
ORDER=translation-first
CACHE=true
DEBUG=true
```

`PLATFORMS` 可以是 `all`，也可以填平台 ID；多个平台使用 `|` 分隔，例如：

```text
max|apple-tv-plus|apple-fitness|disney
```

## 免费 Google 翻译说明

当前使用无需 API Key 的 Google Translate Web 兼容端点，不是正式 Google Cloud Translation API，也没有稳定性或配额保证。项目内置批处理、备用域名、缓存和失败隔离。翻译失败只影响虚拟字幕轨，不应影响原视频和原始字幕。

## 构建与测试

```bash
npm run check
```

输出：

```text
dist/manifest.js
dist/gateway.js
modules/GeneralStreamSubtitle.sgmodule
modules/GeneralStreamSubtitle.plugin
modules/GeneralStreamSubtitle.module
```

## 调试

日志前缀：

```text
[GSS 0.3.0]
```

正常链路应出现：

```text
master manifest inspected
subtitle playlist virtualized
translation started
subtitle translated
```

主清单日志会包含：

```text
platform
selectedName
selectedLanguage
configuredSource
```

提交日志或 URL 时，请遮盖 Cookie、Authorization、签名令牌和设备标识。

## 许可证

MIT
