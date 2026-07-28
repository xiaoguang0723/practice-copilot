# Practice Copilot

Windows 本地模拟练习助手：通过全局快捷键捕获主屏幕，将图片发送到用户自己的 OpenAI 兼容多模态接口，并在半透明悬浮窗中流式显示 Markdown 回答。

## 运行要求

- Windows 10 2004+ 或 Windows 11 x64
- Node.js 20+
- 支持图片输入和 `/chat/completions` 流式输出的 OpenAI 兼容 API

## 开发与构建

```powershell
npm install
npm run dev
```

```powershell
npm test
npm run typecheck
npm run build
npm run package:dir
```

`package:dir` 生成免安装目录，`package:win` 生成 Windows portable 可执行文件。产物位于 `release/`。

## 使用

首次启动会打开设置页，填写：

- API Base URL，例如 `https://api.openai.com/v1`
- API Key
- 支持视觉输入的模型名
- 可选的持久化提示词

默认快捷键：

| 快捷键 | 功能 |
| --- | --- |
| `Alt+Q` | 捕获整个主屏幕，仅保留在内存中 |
| `Alt+W` | 将最近截图和提示词发送给模型 |
| `Alt+E` | 显示或隐藏悬浮窗 |
| `Alt+X` | 退出应用进程 |

关闭悬浮窗只会隐藏到系统托盘。托盘菜单可显示/隐藏窗口、打开设置或退出。

## 隐私与内容保护

- API Key 使用 Electron `safeStorage`，在 Windows 上由 DPAPI 加密；密钥不会暴露给 React 渲染进程。
- 截图与回答只保存在内存中，不写入磁盘；应用不包含账号、遥测或独立服务端。
- 窗口始终启用 Windows 内容保护。它可让遵守系统捕获排除机制的截图、录屏和屏幕共享软件忽略该窗口，但无法阻止摄像机、驱动级捕获或刻意绕过系统 API 的工具，因此不能保证对所有捕获方式绝对不可见。

本软件用于本地模拟练习及明确允许使用辅助工具的场景。使用第三方模型服务时，截图和提示词会发送给用户配置的服务提供方，请同时遵守对方的隐私政策与使用规则。
