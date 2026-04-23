<div align="center">

# Popy

**Open-source "Allow Copy" on steroids.**
一个开源的、强化版「Allow Copy」浏览器扩展。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green.svg)](./manifest.json)
[![No Dependencies](https://img.shields.io/badge/deps-0-brightgreen.svg)](#)
[![No Telemetry](https://img.shields.io/badge/telemetry-none-success.svg)](#)

[English](#english) · [简体中文](#简体中文)

</div>

---

## English

### Why Popy?

You've been here before:
- A blog that refuses to let you select text.
- A tutorial site that nukes right-click.
- Paywall-like content you can *see* but *cannot copy*.

The usual fix is an "Allow Copy" extension. Most of them:
- Are **closed source** — you have no idea what they do with your clipboard.
- Only handle the **simplest** case (CSS + `contextmenu`).
- **Don't record, don't format, don't help you actually use** what you copied.

**Popy is the answer.** Open-source, MIT-licensed, zero telemetry, zero dependencies, pure vanilla JS.

|  | Typical "Allow Copy" | **Popy** |
|---|---|---|
| Source | Closed | **MIT, open** |
| Breaks `oncopy` / `onselectstart` | ✓ | ✓ |
| Breaks `addEventListener` traps | ✗ | ✓ *(MAIN-world hijack)* |
| Defeats `debugger` anti-debug | ✗ | ✓ |
| Reveals CSS-hidden text | ✗ | ✓ |
| Copy as Markdown (with tables, code, images) | ✗ | ✓ |
| Auto-clean code (strip line numbers / prompts) | ✗ | ✓ |
| Table → CSV | ✗ | ✓ |
| Copy as quote (with source URL) | ✗ | ✓ |
| Local clipboard history | ✗ | ✓ |
| Print unlock | ✗ | ✓ |
| Per-site enable/disable | sometimes | ✓ |
| Telemetry | ❓ | **Zero** |

### Features

#### 🔓 Unlock
- **MAIN-world interceptor** — hijacks `addEventListener` for `copy` / `cut` / `paste` / `contextmenu` / `selectstart` / `mousedown` / `dragstart` **before** the site's scripts can register them.
- **CSS override** — forces `user-select: text !important` on every element.
- **Inline attribute cleanup** — strips `oncopy`, `oncontextmenu`, `unselectable`, with a `MutationObserver` keeping watch for SPA re-renders.
- **`on*` property shadow** — `document.oncopy = fn` becomes a silent no-op.

#### 🧠 Smart formatting
- **Floating toolbar on selection**: 📋 Copy · ✨ Markdown · ❝ Quote · 🔤 Code · 🔍 Search · 🌐 Translate.
- **HTML → Markdown** — headings, code blocks with language, tables, images, lists, links, blockquotes.
- **Table → CSV / Markdown table**.
- **Code cleanup** — strips line numbers, shell prompts (`$` / `>>>` / `>` / PowerShell), normalizes common indent.
- **Quote with source** — auto-appends article title + URL.

#### 📋 Clipboard history
- Local, up to 500 entries, stored in `chrome.storage.local` — **never leaves your machine**.
- Dedicated history page: search, filter by kind, re-copy, delete, export JSON.

#### 👁 Reveal hidden text
- Detects text hidden via `visibility:hidden`, `opacity:0`, `color === background`, `text-indent: -9999px`, `font-size: 0px`, and makes it visible with a dashed orange outline.

#### 🧪 Anti-anti-debug
- Kills `debugger` inside `setInterval`, `setTimeout`, and `new Function(...)` bodies.
- Freezes `console` methods so sites can't overwrite them to hide output.

#### 🖨 Print unlock
- `beforeprint` injects a stylesheet that forces every element visible.

#### 🎬 Media unlock
- Images and videos get `draggable="true"` + `pointer-events: auto`; right-click bans are neutralized by the MAIN-world hijack.

#### ⚡ Quality of life
- Badge counter on the toolbar icon shows how many blockers were defeated on the current tab.
- Toasts confirm every action.
- Keyboard shortcuts for all main actions.
- **Real** per-site toggle — disabling a site actually un-registers the MAIN script, not just turns off surface features.

### Install

1. Clone or download this repo.
2. Open `chrome://extensions/` in any Chromium-based browser (Chrome, Edge, Brave, Arc, Vivaldi, …).
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select the `popy/` folder.
5. Pin Popy to the toolbar.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+C` | Force-copy current selection |
| `Alt+Shift+C` | Copy selection as Markdown |
| `Alt+Shift+H` | Reveal hidden text |
| `Alt+Shift+V` | Open clipboard history |
| *(unbound)* | Toggle current site — bind in `chrome://extensions/shortcuts` |

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Service Worker   ·   background.js                             │
│    • Dynamic MAIN-world script registration                     │
│      (excludeMatches for per-site disable)                      │
│    • Context menus · commands · badge counter                   │
│    • chrome.storage.local history CRUD                          │
└──────┬────────────────────────────────────────┬─────────────────┘
       │ registerContentScripts                 │ runtime.sendMessage
       ▼                                        │
┌──────────────────────────┐                    │
│  MAIN world              │                    │
│  inject-main.js          │                    │
│    • addEventListener    │                    │
│      hijack              │                    │
│    • on* property trap   │                    │
│    • debugger killer     │                    │
│    • console freeze      │                    │
│    • print stylesheet    │                    │
└──────────┬───────────────┘                    │
           │ window.postMessage                 │
           ▼                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  ISOLATED world                                                  │
│    formatters.js  →  HTML→MD · table→CSV · cleanCode             │
│    content.js     →  CSS · MutationObserver · floating toolbar   │
│                      reveal · history · message dispatcher       │
└─────────────────────────────────────────────────────────────────┘
```

### Permissions & privacy

| Permission | Purpose |
|---|---|
| `storage` | Settings (sync) and history (local) |
| `scripting` | Dynamically register MAIN-world script per-site |
| `activeTab` | Send commands to current tab |
| `contextMenus` | Right-click menu entries |
| `clipboardWrite` / `clipboardRead` | Execute copy actions from toolbar / commands |
| `notifications` | Reserved; currently unused |
| `<all_urls>` | Work on every site |

**Zero network requests.** No analytics, no remote config, no phone-home. The codebase is under 1,500 LOC — audit it yourself.

### Development

```bash
git clone https://github.com/zqyhimself/popy.git
cd popy

# Load it in Chrome:
#   chrome://extensions → Load unpacked → pick this folder
# Any edit is picked up by clicking the reload icon on the extension card.
```

File layout:

```
popy/
├── manifest.json         MV3 manifest
├── background.js         Service worker
├── formatters.js         HTML→MD · table→CSV · cleanCode
├── content.js            Isolated-world orchestrator
├── inject-main.js        Main-world API hijacker
├── popup.{html,css,js}   Toolbar popup UI
├── options.{html,css,js} Settings page
├── history.{html,css,js} Clipboard history page
├── rules.json            Suggested disabled-site list
└── icons/                16 / 32 / 48 / 128 PNG
```

### Roadmap

- [ ] OCR for canvas / protected images (Tesseract.js)
- [ ] Custom-font de-obfuscation (woff glyph mapping for novel sites)
- [ ] Community rule subscription (uBlock-style)
- [ ] Cross-device clipboard sync (user-supplied endpoint)
- [ ] English UI (i18n)

### Contributing

PRs are welcome. Ground rules:

1. Open an issue first for non-trivial changes.
2. New features go behind a toggle in `options.js`.
3. **No dependencies, no build step** — plain vanilla JS only.
4. Match the existing style (2-space indent).
5. Keep the extension's permission list as small as possible.

### License

[MIT](./LICENSE)

---

## 简体中文

### 为什么用 Popy？

你一定遇到过：
- 博客不让选字。
- 教程站禁用右键。
- 可以「看」但不能「复制」的付费内容。

常见对策是装「Allow Copy」插件。但市面上大多数：
- **闭源** — 你不知道它对你的剪贴板做了什么。
- 只处理**最简单**的情况（CSS + contextmenu）。
- **不记录、不格式化**、不帮你把复制来的内容变得有用。

**Popy 就是那个替代品**：MIT 开源 · 零数据上报 · 零依赖 · 纯原生 JS。

|  | 普通 Allow Copy | **Popy** |
|---|---|---|
| 源码 | 闭源 | **MIT 开源** |
| 破 `oncopy` / `onselectstart` | ✓ | ✓ |
| 破 `addEventListener` 拦截 | ✗ | ✓ *(MAIN world 劫持)* |
| 反 `debugger` 反调试 | ✗ | ✓ |
| 揭示 CSS 隐藏文字 | ✗ | ✓ |
| 复制为 Markdown（含表格/代码/图） | ✗ | ✓ |
| 复制代码自动清理（去行号/提示符） | ✗ | ✓ |
| 表格 → CSV | ✗ | ✓ |
| 复制为引用（含出处） | ✗ | ✓ |
| 本地剪贴板历史 | ✗ | ✓ |
| 打印限制解除 | ✗ | ✓ |
| 按站点开关 | 部分支持 | ✓ |
| 数据上报 | 未知 | **零** |

### 功能

#### 🔓 解除限制
- **MAIN world 拦截器** — 在站点脚本跑起来之前劫持 `addEventListener`，拦截 `copy` / `cut` / `paste` / `contextmenu` / `selectstart` / `mousedown` / `dragstart` 等事件的注册。
- **CSS 强制放行** — `user-select: text !important`。
- **内联属性清理** — 去除 `oncopy` / `oncontextmenu` / `unselectable`，`MutationObserver` 守护 SPA 后续渲染。
- **`on*` 属性屏蔽** — 让 `document.oncopy = ...` 这类赋值直接失效。

#### 🧠 智能格式化
- **浮动工具条**：选中文字后浮现 📋 复制 · ✨ Markdown · ❝ 引用 · 🔤 代码 · 🔍 搜索 · 🌐 翻译。
- **HTML → Markdown**：标题、代码块（含语言标签）、表格、图片、列表、链接、引用全覆盖。
- **表格 → CSV / Markdown 表格**。
- **代码清理**：去行号、去 shell 提示符（`$` / `>>>` / `>` / PowerShell）、统一公共缩进。
- **引用格式**：自动附加原文标题 + URL。

#### 📋 剪贴板历史
- 本地最多 500 条，存在 `chrome.storage.local`，**永不离开你的设备**。
- 独立历史页：搜索、按类型过滤、再次复制、删除、导出 JSON。

#### 👁 揭示隐藏文字
- 识别 `visibility:hidden`、`opacity:0`、同色伪装、负缩进、0px 字号，用橙色虚线框标出来。

#### 🧪 反反调试
- 干掉 `setInterval`、`setTimeout`、`new Function(...)` 里的 `debugger` 陷阱。
- 冻结 `console`，防止站点把输出抹掉。

#### 🖨 打印解除
- `beforeprint` 时注入覆盖样式，强制所有内容可见。

#### 🎬 媒体解锁
- 图片、视频自动加 `draggable="true"` + `pointer-events: auto`，被禁的右键菜单由 MAIN 劫持一并解除。

#### ⚡ 体验细节
- 图标角标显示本页拦截次数。
- 每次操作弹出 Toast 提示。
- 所有主要动作都有快捷键。
- **真正的**按站点开关 — 禁用站点后 MAIN 脚本实际被注销，不是只关掉表层功能。

### 安装

1. 克隆或下载本仓库。
2. 浏览器打开 `chrome://extensions/`（Chrome / Edge / Brave / Arc / Vivaldi 皆可）。
3. 右上角开启**开发者模式**。
4. 点击**加载已解压的扩展程序**，选择 `popy/` 文件夹。
5. 固定到工具栏。

### 快捷键

| 组合键 | 动作 |
|---|---|
| `Alt+C` | 强制复制当前选区 |
| `Alt+Shift+C` | 复制选区为 Markdown |
| `Alt+Shift+H` | 揭示隐藏文字 |
| `Alt+Shift+V` | 打开剪贴板历史 |
| *(未绑定)* | 切换当前站点启用 — 在 `chrome://extensions/shortcuts` 自行绑定 |

### 权限与隐私

| 权限 | 用途 |
|---|---|
| `storage` | 设置（sync）和历史（local） |
| `scripting` | 按站点动态注册 MAIN 脚本 |
| `activeTab` | 向当前标签页发送命令 |
| `contextMenus` | 右键菜单项 |
| `clipboardWrite` / `clipboardRead` | 浮动工具条与命令的复制操作 |
| `notifications` | 预留，当前未使用 |
| `<all_urls>` | 对所有站点生效 |

**零网络请求**。不埋点、不拉远程配置、什么都没有。核心代码不到 1500 行，欢迎自审。

### 开发

```bash
git clone https://github.com/zqyhimself/popy.git
cd popy
# 浏览器 chrome://extensions → 加载已解压 → 选择该目录
# 修改后点击扩展卡片上的刷新图标即生效
```

项目结构见上方英文部分。

### 路线图

- [ ] OCR（canvas / 受保护图片文字提取，Tesseract.js）
- [ ] 自定义字体反爬（小说站 woff 字形映射）
- [ ] 社区规则订阅（类 uBlock）
- [ ] 跨设备剪贴板同步（用户自填端点）
- [ ] 英文界面（i18n）

### 参与贡献

欢迎 PR。请遵守：

1. 较大的改动请先开 Issue 讨论。
2. 新功能必须加入 `options.js` 的开关。
3. **不引入任何依赖、不加构建流程** — 纯原生 JS。
4. 保持代码风格一致（2 空格缩进）。
5. 权限列表能少就少。

### 许可协议

[MIT](./LICENSE)
