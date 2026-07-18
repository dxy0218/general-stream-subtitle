# General Stream Subtitle

面向 **Surge、Loon 与 Shadowrocket** 的轻量流媒体字幕中间件。项目通过 HTTPS MITM 拦截播放清单，在字幕菜单中注入一个可见的 **`Translate-zh`** 轨道；只有用户选择该轨道时，脚本才获取英文字幕并调用翻译引擎生成中英双语字幕。

当前版本为 **v0.2.0**，首个平台适配器是 Max。项目不修改视频、音频、DRM、账号鉴权或播放授权。

## v0.2.0 变化

- 默认只加入一个 `Translate-zh` 双语轨道，字幕菜单里出现该选项即可确认 Manifest 注入已生效。
- 选择 `Translate-zh` 后才开始翻译，默认中文在上、英文在下。
- 改用 `https://gss.local` 虚拟字幕网关，不再给 Max 的签名 CDN URL 追加项目参数。
- 新增模块参数与持久化设置层。
- 新增本地配置页面：`http://gss.local/`。
- 同时提供实验性入口：`http://127.0.0.1:6170/gss/`。它并非真正监听端口，是否能打开取决于客户端是否拦截回环请求；`gss.local` 更可靠。
- 预留翻译引擎接口，当前仅实现 Google 免费兼容端点。

## 工作流程

```text
Max master.m3u8
  └─ manifest.js 注入 Translate-zh
       └─ URI 指向 https://gss.local/playlist
            └─ gateway.js 获取原字幕 playlist
                 └─ 将每个字幕分段虚拟化为 https://gss.local/subtitle
                      └─ 用户播放时按需获取、翻译并返回双语 WebVTT
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
5. 完全退出并重新打开 Max；
6. 播放带英文字幕的点播内容；
7. 在字幕菜单选择 `Translate-zh`。

## 设置

### 配置页面

优先打开：

```text
http://gss.local/
```

可设置目标语言、轨道名称、双语顺序、纯翻译轨、缓存和调试日志。配置保存在代理软件的 `$persistentStore` 中。

### 模块参数

Surge 和 Shadowrocket 模块提供可编辑参数。Loon 当前使用默认参数，也可通过配置页面保存覆盖值。

默认值：

```text
source=en
target=zh-CN
trackName=Translate-zh
injectTranslated=false
bilingualOrder=translation-first
cacheEnabled=true
debug=true
```

## 免费 Google 翻译说明

当前使用无需 API Key 的 Google Translate Web 兼容端点，不是正式 Google Cloud Translation API，也没有稳定性或配额保证。项目内置批处理、备用域名、缓存和失败隔离。翻译失败只影响虚拟字幕轨，不应影响视频和 Max 原始字幕。

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

## 当前限制

- 仅 Max 点播 HLS + WebVTT。
- 不支持 TTML、IMSC、DASH/MPD、直播字幕。
- `gss.local` 虚拟网关依赖客户端的 HTTP request 脚本合成响应能力。
- 免费 Google 兼容端点可能限流或改变。
- 不同 Max 地区、App 版本与 CDN 需要继续真机验证。

## 调试

日志前缀：

```text
[GSS 0.2.0]
```

正常链路应出现：

```text
master manifest inspected
subtitle playlist virtualized
translation started
subtitle translated
```

提交日志或 URL 时，请遮盖 Cookie、Authorization、签名令牌和设备标识。

## 许可证

MIT
