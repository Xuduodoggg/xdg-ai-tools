# xdg-ai-tools

一组纯前端的轻量小工具：**单文件 HTML、零依赖、打开即用**。

在线使用：https://xuduodoggg.github.io/xdg-ai-tools/

## 工具列表

| 工具 | 说明 |
|------|------|
| [AI 缓存命中计算器](tools/AI缓存命中计算器.html) | 按模型价格与缓存命中率计算推理成本。人民币计价，覆盖 17 个平台、50+ 模型，支持通过 public API 实时拉取价格 |
| [学海聊天记录转换器](tools/学海聊天记录转换器.html) | 导入学海 / 微信导出的聊天记录 HTML，以微信界面样式浏览，可导出为图片或独立 HTML 文件 |
| [用眼时长提示器](tools/用眼时长提示器.html) | 记录连续用眼时长，定时提醒休息 |

## 使用方式

**在线**：打开 [工具集首页](https://xuduodoggg.github.io/xdg-ai-tools/)，点击任意工具卡片进入。

**离线**：把 `tools/` 目录下的 HTML 文件下载到本地，双击用浏览器打开即可，无需安装任何依赖。

## 项目结构

```
xdg-ai-tools/
├── index.html                  # 工具集首页（导航入口）
├── tools/                      # 全部工具源码
│   ├── AI缓存命中计算器.html
│   ├── 学海聊天记录转换器.html
│   └── 用眼时长提示器.html
├── .nojekyll                   # 跳过 Jekyll 处理，保证页面原样发布
└── README.md
```

## 技术栈

纯原生 HTML + CSS + JavaScript 编写，图标均为内联 SVG，无框架、无外部依赖、无需构建步骤。仅依赖 GitHub Pages 做静态托管。

## 说明

- 数据均在浏览器本地处理，不上传任何服务器。
- AI 缓存计算器的实时价格来自公开 API，需要联网；其余功能可完全离线使用。
- 页面文件名含中文，URL 分享时浏览器会自动编码，属正常现象。

---

由 [Xuduodoggg](https://github.com/Xuduodoggg) 制作 · 托管于 GitHub Pages
