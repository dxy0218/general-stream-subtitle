# General Stream Subtitle

面向 **Surge、Loon 与 Shadowrocket** 的模块化流媒体字幕翻译中间件。

项目通过 HTTPS MITM 读取播放器清单、播放器响应或文本字幕，在原有字幕菜单中加入一个可见的 **`Translate-zh`** 轨道。只有当用户选择该轨道后，模块才获取原字幕、调用翻译 Provider，并返回双语或纯翻译字幕。

> 当前版本：**v0.6.10**
> 支持系统：iOS、iPadOS、macOS、tvOS（具体能力取决于代理客户端与流媒体 App）  
> 开源协议：MIT

## 目录

- [主要能力](#主要能力)
- [工作原理](#工作原理)
- [支持的客户端](#支持的客户端)
- [安装与首次设置](#安装与首次设置)
- [MITM 与域名](#mitm-与域名)
- [支持的平台](#支持的平台)
- [支持的字幕与清单格式](#支持的字幕与清单格式)
- [支持的翻译引擎](#支持的翻译引擎)
- [设置方式](#设置方式)
- [常用配置示例](#常用配置示例)
- [版本更新记录](#版本更新记录)
- [测试与排错](#测试与排错)
- [已知限制](#已知限制)
- [开发与构建](#开发与构建)
- [安全与隐私](#安全与隐私)

## 主要能力

- 在播放器字幕菜单中注入 `Translate-zh` 双语字幕轨。
- 只有选中翻译轨后才开始翻译，尽量减少无效 API 调用。
- 支持自动选择源字幕，也可以指定 `en`、`ja`、`ko`、`fr` 等语言代码。
- 默认优先人工字幕，再考虑 SDH、CC 和自动生成字幕。
- 支持 HLS、部分 DASH，以及多种文本字幕格式。
- 支持 YouTube 普通视频、Shorts、YouTube Live 和 YouTube TV 的文本字幕轨。
- 支持多种翻译 Provider、备用 Provider 链和自定义 API。
- 提供由脚本合成的本地管理页面，设置会保存在代理软件的持久化存储中。
- 提供可复制、可清空的脱敏运行日志，覆盖清单、字幕网关、翻译和安全放行阶段。
- 不修改视频、音频、DRM、账号鉴权或播放授权。

## 工作原理

### HLS / DASH 平台

```text
流媒体 master.m3u8 / manifest.mpd
  └─ manifest.js 识别平台和字幕轨
       └─ 选择最合适的源字幕
            └─ 注入 Translate-zh
                 └─ URI 指向脚本合成的虚拟字幕网关
                      └─ gateway.js 获取原字幕
                           └─ 解析字幕 → 翻译 → 返回双语字幕
```

### YouTube 系平台

```text
youtubei/v1/player
  └─ 读取 captions.captionTracks
       └─ 优先人工字幕，可回退到 YouTube ASR
            └─ 注入 Translate-zh
                 └─ direct：直接拦截 /api/timedtext
                 └─ virtual：通过虚拟字幕网关获取并翻译
```

模块只能处理播放器已经暴露出来的文本字幕。没有 `captionTracks` 的内容不会凭空生成字幕；Whisper 本地语音识别计划留到后续版本。

## 支持的客户端

| 客户端 | 模块文件 | 主要设置方式 |
|---|---|---|
| Shadowrocket | `GeneralStreamSubtitle.module` | 模块参数 + `gss.local` |
| Loon | `GeneralStreamSubtitle.plugin` | `gss.local` 为主 |
| Surge | `GeneralStreamSubtitle.sgmodule` | 模块参数 + `gss.local` |

## 安装与首次设置

### 安装链接

#### Shadowrocket

```text
https://raw.githubusercontent.com/dxy0218/general-stream-subtitle/main/modules/GeneralStreamSubtitle.module
```

#### Loon

```text
https://raw.githubusercontent.com/dxy0218/general-stream-subtitle/main/modules/GeneralStreamSubtitle.plugin
```

#### Surge

```text
https://raw.githubusercontent.com/dxy0218/general-stream-subtitle/main/modules/GeneralStreamSubtitle.sgmodule
```

### 首次使用步骤

1. 添加并启用对应模块或插件。
2. 在代理软件中生成或安装 HTTPS 解密 CA 证书。
3. 在系统设置中信任该证书。
4. 开启 MITM / HTTPS 解密。
5. 打开 `https://example.com/`，确认 GSS 管理页面能够显示。
6. 保持默认的 `source=auto`、`target=zh-CN` 和 `provider=google-free`，先进行基础测试。
7. 完全退出目标流媒体 App，然后重新打开。
8. 播放本身带有字幕的内容。
9. 在字幕菜单中选择 `Translate-zh`。

在 iPhone 或 iPad 上，安装证书后通常还需要前往：

```text
设置 → 通用 → 关于本机 → 证书信任设置 → 开启完全信任
```

## MITM 与域名

**必须开启 MITM / HTTPS 解密。** 未开启时，模块无法读取加密后的播放器响应、播放清单和字幕内容。

正常通过模块安装时，所需域名已经使用 `%APPEND%` 自动加入 MITM 列表，一般不需要手动填写。

YouTube 相关的关键域名包括：

```text
*.youtube.com
youtubei.googleapis.com
gss.local
```

当前模块不需要对 `*.googlevideo.com` 做 MITM，因为它不修改 YouTube 视频或音频流。给视频 CDN 强制解密可能增加性能消耗或导致播放异常。

在 Apple TV + Shadowrocket 上使用 Discovery+ 时，默认开关为关闭。即使打开，也只检查可识别媒体 CDN 上的 HLS 主清单；`*.discoveryplus.com`、`*.disco-api.com`、Max/Discovery 的账户、设备、GraphQL、播放会话和 DRM 接口都会绕过脚本规则。不要为了扩大匹配范围而手动把这些整站域名加入 MITM。

如果使用 `customDomains` 接入自定义平台，还需要在代理软件的 MITM hostname 中手动加入对应域名。管理页面能够保存自定义域名，但无法动态改写客户端的 MITM 域名列表。

## 支持的平台

“稳定”表示已经具有专用识别规则和通用字幕处理链路，不代表所有地区、App 版本和 CDN 都已完成真机覆盖。“实验性”表示依赖通用适配器或内部接口，平台调整后可能需要更新规则。

### 稳定适配

| 平台 | 平台 ID | 当前处理范围 |
|---|---|---|
| Max / HBO Max | `max` | HLS/DASH + WebVTT；Shadowrocket 安全预设只处理 HLS |
| Apple TV | `apple-tv` | HLS + WebVTT |
| Apple TV+ | `apple-tv-plus` | HLS + WebVTT |
| Apple Fitness+ | `apple-fitness` | HLS workout 清单 + WebVTT |
| Disney+ | `disney` | HLS + WebVTT |
| Prime Video | `prime` | 专用 HLS 主清单规则 + 文本字幕；DASH/DRM 原样放行 |
| Hulu | `hulu` | 点播与直播 HLS 主清单 + WebVTT |
| Paramount+ | `paramount` | HLS + WebVTT |
| Peacock | `peacock` | HLS + WebVTT |
| Discovery+ | `discovery` | Shadowrocket 默认关闭且仅处理 HLS；Surge/Loon 可处理媒体 CDN 的 HLS/DASH |
| Fubo | `fubo` | HLS + WebVTT |
| TED | `ted` | HLS + WebVTT |

### 实验性适配

| 平台 | 平台 ID | 当前处理范围 |
|---|---|---|
| YouTube / Shorts / Live | `youtube` | `youtubei/v1/player`、captionTracks、timedtext、JSON3、srv3 |
| YouTube TV | `youtube-tv` | TVHTML5 播放器暴露的文本 CC；不解码视频流内嵌 CEA-608/708 |
| BBC iPlayer | `bbc` | 通用 HLS / 文本字幕适配 |
| Rakuten Viki | `viki` | 通用 HLS / 文本字幕适配 |
| Tubi | `tubi` | 通用 HLS / 文本字幕适配 |
| Pluto TV | `pluto` | 专用 Stitcher/生产媒体主机 HLS + 文本字幕适配 |
| Crunchyroll / VRV | `crunchyroll` | 通用 HLS/DASH 文本字幕适配 |
| DAZN | `dazn` | 通用直播清单与文本字幕适配 |
| Plex | `plex` | 仅播放器暴露为 HLS/DASH 文本字幕时可用 |
| 自定义域名 | `custom` | 使用 `customDomains` 指定域名 |
| 通用 HLS/DASH | `generic` | 开启 `genericMode` 后检查其他 `.m3u8` / `.mpd` |

默认 `platforms=all`，但 `genericMode` 默认关闭，避免对所有网站的清单进行过度拦截。

## 支持的字幕与清单格式

### 播放清单

- HLS：`.m3u8`
- DASH：`.mpd`，当前主要支持直接 `BaseURL` 指向文本字幕的简单 AdaptationSet

### 文本字幕

| 格式 | 状态 | 说明 |
|---|---|---|
| WebVTT | 支持 | HLS 平台的主要格式 |
| SRT | 支持 | 解析后统一输出为 WebVTT |
| TTML / DFXP | 支持文本版本 | 支持常见 `<p begin end>` 文本结构 |
| IMSC Text XML | 支持文本版本 | 不包含 fMP4 二进制封装解析 |
| ASS / SSA | 支持 | 读取 Dialogue 时间轴和文本 |
| 通用 JSON cues | 支持 | 识别常见字幕数组结构 |
| YouTube transcript XML | 支持 | timedtext XML |
| YouTube srv3 XML | 支持 | YouTube 动态文本字幕 |
| YouTube JSON3 | 支持 | 普通视频和直播字幕 |

### 暂不支持的格式

- fMP4 中封装的二进制 `stpp` / IMSC1 字幕。
- `SegmentTemplate`、`SegmentList` 或 `SegmentBase` 驱动的复杂 DASH 字幕分段。
- PGS、VobSub 等图片字幕。
- 只存在于视频码流中的 CEA-608/CEA-708，且播放器没有暴露 timedtext 文本轨的情况。
- 烧录在画面中的硬字幕。

遇到无法安全解析的格式时，模块会记录原因并保持原内容不变，不会强行改写播放链路。

## 支持的翻译引擎

| Provider ID | 翻译引擎 | API Key |
|---|---|---|
| `google-free` | 非官方 Google Translate 兼容端点 | 不需要 |
| `google-cloud` | Google Cloud Translation Basic v2 | 需要 |
| `deepl` | DeepL API | 需要 |
| `azure` | Azure Translator v3 | 需要 |
| `libretranslate` | LibreTranslate 官方或自建服务 | 视服务而定 |
| `openai` | OpenAI Responses API | 需要 |
| `openai-compatible` | DeepSeek、自建网关等兼容接口 | 通常需要 |
| `gemini` | Gemini `generateContent` | 需要 |
| `custom-json` | 自定义 JSON 翻译接口 | 视接口而定 |

### Provider 回退链

可以设置主 Provider 和多个备用 Provider。例如：

```text
provider=deepl
fallbackProviders=google-cloud,google-free
```

DeepL 请求失败、没有配置密钥或返回结构无效时，会依次尝试后面的 Provider。

### 自定义 JSON API

模块向 Endpoint 发送：

```json
{
  "texts": ["Hello", "Goodbye"],
  "source": "en",
  "target": "zh-CN"
}
```

接口可以返回：

```json
{
  "translations": ["你好", "再见"]
}
```

也兼容 `translatedText` 或 `output` 数组字段。

## 设置方式

### 方法一：本地管理页面

推荐入口（由本地脚本拦截，不会访问 example.com 的网页内容）：

```text
https://example.com/
```

实验性回环入口：

```text
http://127.0.0.1:6170/gss/
```

管理页面适合设置完整参数、Provider Endpoint、模型名称和 API Key。Surge/Loon 的持久化设置优先级高于模块参数。

配置优先级为：

```text
内置默认值 → 模块参数 → gss.local 持久化设置
```

Shadowrocket 的 v0.6.0 安全预设属于例外：模块编辑页中的平台开关会覆盖 `gss.local` 旧设置，避免界面已经关闭平台但旧配置仍继续改写播放响应。

### 方法二：模块参数

Shadowrocket 和 Surge 可以直接编辑常用模块参数。Loon 建议通过 `gss.local` 管理页面配置。

Shadowrocket 原生编辑器不会把字符串候选值渲染成下拉菜单，因此模块只暴露布尔开关。默认预设为：自动识别源语言、翻译为简体中文、`Translate-zh`、`google-free`、HLS 播放保护。打开 `HY_MT2` 后改用保存在本地管理页中的私有 OpenAI-compatible Endpoint 和 API Key；未配置或请求失败时自动回退到 `google-free`。

| 模块参数 | 默认值 | 说明 |
|---|---|---|
| `DISCOVERY` | `false` | Discovery+ 实验适配；确认基础播放正常后再打开 |
| `DISCOVERY_HLS_ONLY` | `true` | Discovery+ 播放保护；建议保持开启 |
| `MAX` | `true` | Max / HBO Max HLS 中文字幕 |
| `PLUTO` | `true` | Pluto TV HLS 中文字幕 |
| `PRIME` | `true` | Amazon Prime Video HLS 中文字幕 |
| `HULU` | `true` | Hulu 点播/直播 HLS 中文字幕 |
| `YOUTUBE` | `true` | YouTube / YouTube TV 中文字幕 |
| `YT_ASR` | `true` | 是否允许使用 YouTube 自动生成字幕 |
| `YT_LIVE` | `true` | 是否处理 YouTube 直播文本字幕 |
| `HY_MT2` | `false` | 使用私有 Hy-MT2 服务；需先在管理页保存 Endpoint 和 API Key |
| `PURE_TRACK` | `false` | 是否额外显示纯翻译字幕轨 |
| `CACHE` | `true` | 是否启用翻译缓存 |
| `LOGS` | `true` | 保存脱敏运行日志，方便排查播放和字幕错误 |
| `DEBUG` | `false` | 是否在客户端控制台输出详细日志 |

#### Shadowrocket 使用私有 Hy-MT2

1. 更新模块后先打开 `HY_MT2`。
2. 在 Shadowrocket 开启模块和 MITM 后访问 `https://example.com/`。
3. Provider 会自动切换为 `openai-compatible`，模型固定为 `hy-mt2-1.8b`。
4. 将私有服务的 Base URL（以 `/v1` 结尾）填入 Endpoint，并粘贴 API Key 后保存。
5. 保持 `CACHE` 和 `LOGS` 开启，完全退出流媒体 App 后重新播放。

Endpoint 与 API Key 只保存在当前代理客户端的 persistentStore 中，不会写入模块文件、公开配置响应或运行日志。低内存 CPU VPS 只接收能够安全放入上下文的小字幕段；未配置密钥、输入过大、服务超时或返回无效内容时会回退到 `google-free`。

2GB/单核 VPS 上的 512-token Hy-MT2 服务只处理能够安全放入上下文的小字幕段。完整剧集字幕或大型 WebVTT 会在发请求前直接交给 `google-free`，避免上下文超限 `HTTP 400`；Google 回退保持正常批量和双并发。若要求整集字幕全部由 VPS 实时翻译，需要换用吞吐量更高的专用翻译服务。

`v0.6.3` 将无请求体的管理页、状态、日志和虚拟字幕 GET 请求，与需要读取表单正文的设置保存请求拆成两条 Gateway 规则，避免部分 Shadowrocket 版本访问 `http://gss.local/` 时持续等待。

`v0.6.4` 改用 `https://example.com/` 作为默认入口。`.local` 在 iOS 中保留给 Bonjour/mDNS，部分网络环境不会把 `gss.local` 请求交给 Shadowrocket；旧入口仅保留用于兼容。

Surge 继续提供 `SOURCE`、`TARGET`、`PROVIDER`、`PLATFORMS`、`DISCOVERY_MODE` 等文本参数；完整自定义配置仍可通过 `gss.local` 管理。

### 管理页面中的完整设置

#### 字幕设置

- `enabled`：总开关。
- `source`：`auto` 或指定语言代码。
- `sourcePriority`：自动模式下的语言优先级，默认 `en,ja,ko,es,fr,de,it,pt`。
- `target`：目标语言，默认 `zh-CN`。
- `trackName`：双语字幕轨名称。
- `injectTranslated`：是否额外创建纯翻译轨。
- `translatedTrackName`：纯翻译字幕轨名称。
- `bilingualOrder`：译文在前或原文在前。
- `formats`：启用的字幕格式。

#### 平台设置

- `platforms`：`all` 或平台 ID 列表。
- `genericMode`：启用通用 HLS/DASH 适配。
- `customDomains`：自定义域名列表；同时需要手动加入 MITM hostname。

#### YouTube 设置

- `youtubeStrategy`：`direct` 或 `virtual`。
- `youtubeUseAsr`：允许 YouTube ASR 自动字幕。
- `youtubeLive`：允许处理直播字幕轮询。
- `youtubePreferManual`：有人工字幕时优先人工字幕。

#### 翻译 Provider 设置

- `provider`：主翻译引擎。
- `fallbackProviders`：备用翻译引擎列表。
- `providerEndpoint`：自建或兼容 API 地址。
- `providerModel`：OpenAI、Gemini 或兼容服务的模型名称。
- `providerRegion`：Azure Region 等区域设置。
- `providerProject` / `providerLocation`：Google Cloud 等项目预留项。
- `providerPrompt`：LLM 翻译指令。
- API Key：按 Provider 单独保存。

#### 缓存与调试

- `cacheEnabled`：翻译缓存开关。
- `cacheTTL`：缓存有效时间。
- `logEnabled`：持久化脱敏运行日志，默认开启并最多保存 80 条。
- `debug`：客户端控制台详细输出，默认关闭；排错通常只需保持 `LOGS=true`。
- Google 免费接口会并行处理最多两个独立翻译批次，并保持原字幕顺序。

## 常用配置示例

### 默认自动翻译为简体中文

```text
SOURCE=auto
TARGET=zh-CN
PROVIDER=google-free
TRACK_NAME=Translate-zh
```

### 只处理英文字幕

```text
SOURCE=en
TARGET=zh-CN
```

### 日语翻译为简体中文

```text
SOURCE=ja
TARGET=zh-CN
```

### 只启用 Max、Apple TV+ 和 Apple Fitness+

```text
PLATFORMS=max|apple-tv-plus|apple-fitness
```

### YouTube 推荐设置

```text
PLATFORMS=youtube|youtube-tv
YT_STRATEGY=direct
YT_ASR=true
YT_LIVE=true
YT_MANUAL=true
```

### YouTube direct 不工作时

```text
YT_STRATEGY=virtual
```

### 使用 DeepL 并设置免费接口回退

在 `gss.local` 中保存 DeepL API Key，然后设置：

```text
provider=deepl
fallbackProviders=google-free
```

### 接入未内置的平台

```text
GENERIC=true
customDomains=media.example.com,cdn.example.net
```

并在代理客户端的 MITM hostname 中手动加入：

```text
media.example.com
cdn.example.net
```

## 版本更新记录

### v0.6.10 — Shadowrocket 脚本缓存刷新

- 所有远程 runtime URL 加入版本参数，避免 Shadowrocket 在模块更新后继续使用旧 `manifest.js`。
- 确保 Manifest、Gateway、YouTube 与 YouTube Caption 始终来自同一版本。
- 修复模块标题已更新但主清单仍运行旧逻辑、导致日志缺少 `renditions` / `outputRenditions` 的问题。

### v0.6.9 — Max / tvOS 字幕轨选择兼容

- Max 简体/繁体中文轨使用 Apple 媒体选择更稳定的 `zh-Hans` / `zh-Hant` 语言标签。
- Max 注入轨改为仅手动选择，并移除从英文 CC 继承的关联语言和无障碍特征。
- HLS 日志新增脱敏后的原轨及输出轨属性，便于继续定位设备端选择问题。

### v0.6.8 — Max 翻译响应实体兼容

- 移除翻译前 CDN 响应遗留的长度、Range、哈希、修改时间及云厂商实体校验字段。
- 改写后的字幕播放列表与 VTT 使用 `no-store`，避免 tvOS 缓存与正文不匹配的旧实体元数据。
- 返回前校验 WebVTT 文件头和 cue 数量，并在脱敏日志中记录输入/输出 cue 数和校验结果。

### v0.6.7 — Max 字节范围字幕兼容

- 修复 Max 将单个 WebVTT 拆成 `EXT-X-MAP` 与字节范围后，翻译结果被原长度截断的问题。
- Max 字节范围字幕改为完整的独立虚拟 VTT，并移除过期的 `Range` / `If-Range` 请求头。
- 修复 Apple TV 选择 `Translate-zh` 后轨道立即消失且不显示中文字幕。

### v0.6.6 — Max 字幕轨稳定性

- 修复带 cue ID 的 WebVTT 把下一条 ID 混入上一条正文、导致 tvOS 加载后移除翻译轨的问题。
- 注入轨的 `STABLE-RENDITION-ID` 不再随 Max 的 GCP、Akamai 或 CloudFront 地址变化。
- 中文轨允许自动恢复选择，并将 Hy-MT2 失败后的 Google 备用翻译并发提高到 4，缩短整集字幕首段等待。

### v0.6.1 — 脱敏运行日志

- 默认记录清单命中、字幕上游、格式识别、翻译、回退和异常阶段。
- 增加 `LOGS` 原生开关，与控制台 `DEBUG` 分离。
- 日志使用 80 条环形存储并合并一分钟内的重复事件。
- 自动移除 URL 查询参数、Token、Cookie、Authorization、签名、JWT、密码和 API Key。
- `http://gss.local/logs` 新增统计、详细记录、复制全部、JSON 导出和清空入口。

### v0.6.0 — Apple TV 播放优先预设

- Shadowrocket 编辑页改为全布尔开关，不再要求手动填写字符串参数。
- 新增 Max、Pluto TV、Prime Video、Hulu 和 Discovery+ 的独立开关；Discovery+ 默认关闭。
- Shadowrocket 开关强制覆盖旧的 `gss.local` 平台设置。
- Max/Discovery 只匹配明确的媒体清单，账户、设备、播放会话、GraphQL 和 DRM 请求原样放行。
- 新增 Prime Video 与 Hulu 点播/直播 HLS 专用规则，并扩充 Pluto TV 生产媒体主机。
- 安全预设只改写 HLS 主清单；媒体分片、DASH、播放 JSON 和未知响应均保持原样。

### v0.1.0 — 初始可用版本

- 建立独立的 General Stream Subtitle 项目。
- 首个适配平台为 Max / HBO Max。
- 拦截 HLS master playlist 并注入双语字幕轨。
- 处理字幕 playlist 和 WebVTT 分段。
- 接入免费 Google Translate 兼容端点。
- 提供 Surge、Loon、Shadowrocket 三种模块文件。
- 建立基础构建、测试和 GitHub Actions 工作流。

### v0.2.0 — 可见字幕轨与虚拟网关

- 在字幕菜单中正式加入可见的 `Translate-zh`。
- 只有用户选择翻译轨时才执行字幕翻译。
- 引入 `https://gss.local` 虚拟字幕网关。
- 不再向原始签名 CDN URL 追加翻译参数，减少签名失效风险。
- 新增本地管理页面、持久化设置、翻译缓存和调试日志。
- 新增可选的 `Translate-zh-only` 纯翻译字幕轨。
- 支持译文在前或原文在前。

### v0.3.0 — 自动语言与多平台

- 源语言默认改为 `auto`。
- 支持指定任意常见 BCP-47 语言代码。
- 新增字幕轨评分，优先默认字幕、人工字幕和指定语言。
- 引入平台注册表和平台开关。
- 新增 Apple TV、Apple TV+、Apple Fitness+。
- 新增 Disney+、Prime Video、Hulu、Paramount+、Peacock、Discovery+、Fubo 和 TED。
- 管理页面可以分别启用或关闭平台。

### v0.4.0 — 多格式与多翻译 Provider

- 将字幕处理重构为格式注册表。
- 新增 SRT、TTML/DFXP、IMSC Text、ASS/SSA 和通用 JSON 字幕。
- 新增实验性 DASH/MPD 简单文本字幕适配。
- 对复杂 DASH 分段和 fMP4 字幕采用安全跳过策略。
- 将翻译层重构为 Provider 注册表。
- 新增 Google Cloud、DeepL、Azure、LibreTranslate、OpenAI、OpenAI Compatible、Gemini 和 Custom JSON。
- 新增 Provider 失败回退链。
- API Key 改为按 Provider 独立存储，不出现在模块参数、普通配置接口或日志中。
- 新增 BBC iPlayer、Viki、Tubi、Pluto TV、Crunchyroll/VRV、DAZN、Plex、自定义域名和通用 HLS/DASH 实验适配。

### v0.5.0 — YouTube、直播和 YouTube TV

- 新增 YouTube 普通视频、Shorts、YouTube Live 和 YouTube TV 适配。
- 拦截 `youtubei/v1/player` 并读取 `captionTracks`。
- 在 YouTube 原字幕列表中注入 `Translate-zh`。
- 支持人工字幕和 YouTube 已生成的 ASR 自动字幕。
- 默认优先人工字幕，可配置是否允许 ASR。
- 新增 `direct` timedtext 拦截和 `virtual` 网关两种策略。
- 新增 YouTube transcript XML、srv3 XML 和 JSON3 格式。
- 保留直播 timedtext 的 `seq`、时间窗口和其他轮询参数。
- 能够检测仅内嵌 CEA-608/708 的情况，但当前不在代理脚本中解码。
- 自动化测试扩展到 28 项。

## 测试与排错

### 第一步：检查管理网关

打开：

```text
https://example.com/
```

能打开说明 Gateway 请求脚本已经工作，但不代表目标平台的播放器响应或字幕请求一定已命中。

### 第二步：检查字幕菜单

播放本身带字幕的内容并查看：

```text
没有 Translate-zh
→ MITM 未生效、模块未启用、请求未命中，或内容没有可用文本字幕轨

有 Translate-zh，但选择后没有字幕
→ 字幕网关、字幕格式、Provider 或网络访问环节异常

双语字幕正常显示
→ Manifest/Player、字幕解析和翻译链路全部成功
```

### YouTube 推荐测试顺序

1. 有人工英文字幕的普通视频。
2. 只有 `English (auto-generated)` 的普通视频。
3. 已经出现自动字幕的 YouTube Live。
4. 明确支持 CC 的 YouTube TV 英文频道。

不要一上来就只测试直播频道，因为直播可能只有内嵌 CEA-608/708，没有可供模块读取的 timedtext 字幕轨。

### 收集运行日志

1. 在 Shadowrocket 模块参数中保持 `LOGS=true`，不需要打开 `DEBUG`。
2. 打开 `https://example.com/logs`，先清空旧日志。
3. 完全退出目标流媒体 App，重新打开并重现一次问题。
4. 再次打开 `https://example.com/logs`，查看具体停在哪个平台和处理阶段。
5. 使用“复制全部日志”或 `/logs.json` 导出脱敏记录后再提交 Issue。

日志只包含模块实际命中的请求。完全绕过 MITM 或根本没有命中脚本规则的请求不会出现在记录里。

### 常见问题

#### 管理页无法打开

- 检查模块是否启用。
- 检查 Gateway 脚本规则是否存在。
- 关闭并重新打开代理软件。
- 尝试实验性入口 `http://127.0.0.1:6170/gss/`。

#### 字幕菜单没有 `Translate-zh`

- 确认 CA 证书已安装并完全信任。
- 确认 MITM / HTTPS 解密已开启。
- 完全退出目标 App 后重新打开。
- 确认内容本身存在人工字幕或自动字幕。
- 检查平台是否被 `platforms` 设置关闭。

#### YouTube 自动字幕没有被选中

- 确认 `youtubeUseAsr=true`。
- 如果同时存在人工字幕，默认会优先人工字幕。
- 直播自动字幕是否可用由 YouTube 自身决定，并非每个频道都会提供。

#### 播放出现异常

- Shadowrocket 先关闭出现异常的平台开关，完全退出对应 App 后重新打开。
- Discovery+ 默认保持 `DISCOVERY=false`；需要测试中文字幕时再打开，并保持 `DISCOVERY_HLS_ONLY=true`。
- 不要给视频 CDN（如 `*.googlevideo.com`）额外开启 MITM。
- 关闭纯翻译轨，减少字幕菜单和请求数量。
- Apple TV / Fitness+ 出现异常时，先更新模块并完全退出 App；新版本会为注入轨生成独立 `STABLE-RENDITION-ID`，并移除改写后失效的 ETag/Digest。
- Surge/Loon 用户可将 `genericMode=false`，并把 `platforms` 限制为实际需要的平台。

#### 修改模块参数后没有变化

Shadowrocket v0.6.1 的平台开关会覆盖旧的 `gss.local` 设置；如果没有变化，请先更新模块，再完全退出 Shadowrocket 和目标 App 后重开。Surge/Loon 仍需在管理页面重置或更新旧设置。

### 日志关键词

在 `/logs` 页面重点关注以下阶段：

```text
hls-master
platform-disabled
safe-playback-bypass
subtitle-request
upstream-response
subtitle-translation
original-subtitle-fallback
player-response
caption-translation
runtime-log
```

## 已知限制

- 本项目依赖各平台的内部播放接口、CDN 域名和字幕结构，这些内容可能随地区和 App 版本变化。
- `google-free` 不是官方 Google Cloud Translation API，没有稳定性或额度保证。
- YouTube 没有 `captionTracks` 时，当前版本不会自行识别音频。
- 只存在于视频流中的 CEA-608/708 暂不支持。
- 复杂 DASH 分段、fMP4 IMSC1、图片字幕和烧录字幕暂不支持。
- 代理脚本环境的内存、超时和网络能力有限，不适合在客户端执行大型本地语音模型。
- “稳定适配”表示代码路径成熟，不代表平台官方支持或所有设备已验证。

## 开发与构建

需要 Node.js 18 或更高版本。

```bash
git clone https://github.com/dxy0218/general-stream-subtitle.git
cd general-stream-subtitle
npm run check
```

`npm run check` 会：

1. 从 `src/` 生成 `dist/manifest.js`、`dist/gateway.js`、`dist/youtube.js` 和 `dist/youtube-caption.js`。
2. 生成 Surge、Loon 和 Shadowrocket 模块文件。
3. 执行自动化测试。

主要源码结构：

```text
src/
├── shared/       # Runtime、配置、语言、缓存、日志和 URL 工具
├── platforms/    # 平台识别注册表
├── formats/      # VTT、SRT、TTML、ASS、JSON、YouTube 格式
├── providers/    # 翻译 Provider 注册表和各厂商适配器
├── manifest/     # HLS 与 DASH 清单处理
├── subtitle/     # 字幕翻译流程
├── youtube/      # YouTube player response 与 timedtext 适配
└── gateway/      # gss.local 管理页和虚拟字幕网关
```

生成文件位于：

```text
dist/
modules/
```

请修改 `src/`，不要直接编辑 `dist/` 生成文件。

## 安全与隐私

- 模块不会修改 DRM、账号权限、视频或音频内容。
- API Key 使用独立的 `GSS_PROVIDER_SECRETS_V1` 存储，不写入模块安装链接、普通配置响应或调试日志。
- 运行日志会自动脱敏并限制为约 120 KB，但分享前仍建议人工检查一次导出的 JSON。
- 代理软件的持久化存储不等同于系统钥匙串或硬件安全区。
- 建议为 OpenAI、Gemini、DeepL 等服务创建低额度、可撤销的专用 API Key。
- 使用自建 Relay 时，应限制可调用的模型、额度、来源和接口路径。
- 不要把包含真实 API Key 的配置、日志或截图提交到 GitHub Issue。

## 贡献与反馈

提交 Issue 时，建议提供：

- 客户端名称和版本。
- iOS、macOS 或 tvOS 版本。
- 目标平台和内容类型（点播、直播、Shorts、YouTube TV 等）。
- 是否能够看到 `Translate-zh`。
- 原字幕格式或字幕菜单截图。
- 已脱敏的调试日志。

请勿上传账号 Cookie、Authorization Header、播放签名 URL 或 API Key。
