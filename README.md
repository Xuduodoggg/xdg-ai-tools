# xdg-ai-tools

个人自研工具合集：**网页小工具 + 浏览器扩展**。数据全部在本地处理，不依赖任何后端服务。

在线使用（网页工具）：https://xuduodoggg.github.io/xdg-ai-tools/

## 目录

| 分类 | 内容 | 路径 |
|------|------|------|
| 网页小工具 | 单文件 HTML，浏览器直接打开即用 | [`tools/`](tools/) |
| 浏览器扩展 | Edge / Chrome 扩展（部分含本地服务） | [`extensions/`](extensions/) |

## 网页小工具

| 工具 | 说明 |
|------|------|
| [AI 缓存命中计算器](tools/AI缓存命中计算器.html) | 按模型价格与缓存命中率计算推理成本。人民币计价，覆盖 17 个平台、50+ 模型，支持通过 public API 实时拉取价格 |
| [学海聊天记录转换器](tools/学海聊天记录转换器.html) | 导入学海 / 微信导出的聊天记录 HTML，以微信界面样式浏览，可导出为图片或独立 HTML 文件 |
| [用眼时长提示器](tools/用眼时长提示器.html) | 记录连续用眼时长，定时提醒休息 |

**在线使用**：打开 [工具集首页](https://xuduodoggg.github.io/xdg-ai-tools/)，点击工具卡片进入。

**离线使用**：下载 `tools/` 下的 HTML 文件，双击用浏览器打开，无需安装任何依赖。

## 浏览器扩展

### [划词翻译 · 英译中助手](extensions/划词英译中/)

选中网页上的英文文字，一键翻译为中文。基于 Manifest V3 开发，兼容 Edge 与 Chrome。

- 三种触发方式：划词气泡、右键菜单、`Alt + T` 快捷键
- 三种翻译引擎：内置免费接口（零配置可用）、百度翻译、OpenAI 兼容接口（DeepSeek / 通义千问 / Kimi 等）
- 结果卡支持复制译文、替换原文、朗读译文
- 密钥仅保存在本地浏览器，代码中不包含任何密钥

**安装**：`edge://extensions`（Chrome 为 `chrome://extensions`）→ 开启「开发人员模式」→「加载解压缩的扩展」→ 选择 `extensions/划词英译中/` 文件夹。

### [一键存档 · Web Note Saver](extensions/一键存档/)

选中网页文字按 `Alt + Q` 存入本地 Markdown 笔记；在 Word / PDF / 微信等其他软件里复制的文字也会自动入档。

- 由浏览器扩展（`webext/`）与 Python 本地服务（`saver/`）两部分组成
- 本地服务只监听 `127.0.0.1`，写入需访问令牌校验，内容不出本机
- 内置去重与智能过滤（忽略过短文本、纯链接、纯数字）

**安装**：先启动本地服务——双击 `extensions/一键存档/一键存档.exe`（已打包，无需安装 Python），或双击 `extensions/一键存档/saver/start.bat`（源码方式，需已安装 Python）；再按上面的方式加载 `extensions/一键存档/webext/` 文件夹。

> 仓库不包含 `config.json`（含本机路径与访问令牌）与个人笔记文件，已通过 `.gitignore` 排除，首次运行时会自动生成。

## 项目结构

```
xdg-ai-tools/
├── index.html                  # 工具集首页（导航入口）
├── tools/                      # 网页小工具（单文件 HTML）
│   ├── AI缓存命中计算器.html
│   ├── 学海聊天记录转换器.html
│   └── 用眼时长提示器.html
├── extensions/                 # 浏览器扩展
│   ├── 划词英译中/              # 划词翻译扩展
│   └── 一键存档/                # 扩展 + 本地服务
│       ├── 一键存档.exe         # 打包好的本地服务（免装 Python）
│       ├── webext/             # 扩展部分
│       └── saver/              # 本地服务源码（Python）
├── .nojekyll                   # 跳过 Jekyll 处理，保证页面原样发布
└── README.md
```

## 技术栈

- **网页工具**：纯原生 HTML + CSS + JavaScript，图标均为内联 SVG，无框架、无需构建
- **浏览器扩展**：Manifest V3（Service Worker + Content Script），原生 JS
- **一键存档本地服务**：Python HTTP 服务 + 剪贴板监听 + 系统托盘
- **托管**：GitHub Pages（静态部分）

## 说明

- 网页工具与扩展的数据均在浏览器本地处理，不上传任何服务器。
- AI 缓存计算器的实时价格来自公开 API，需要联网；其余功能可完全离线使用。
- 页面文件名含中文，URL 分享时浏览器会自动编码，属正常现象。

---

由 [Xuduodoggg](https://github.com/Xuduodoggg) 制作
