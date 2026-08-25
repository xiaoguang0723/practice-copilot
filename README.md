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

`package:dir` 生成免安装目录，`package:win` 生成 Windows portable 可执行文件。产物位于 `release/`；当前发布包命名为 `Practice-Copilot-v0.4.0-win-x64.exe`。

## 多模态模型

本应用会将主屏幕截图作为图片输入发送给模型，因此需要支持 OpenAI Chat Completions 图片消息格式和流式输出的多模态模型服务。

推荐使用[小米 MiMo 开放平台](https://platform.xiaomimimo.com/)的 `mimo-v2.5` 模型。它支持 Base64 图片输入，可直接与本应用兼容。创建 API Key 后，在设置中填写：

```text
API Base URL: https://api.xiaomimimo.com/v1
模型名: mimo-v2.5
API Key: 你的 MiMo API Key
```

## 使用

首次启动会打开设置页，填写：

- API Base URL，例如 `https://api.openai.com/v1`
- API Key
- 支持视觉输入的模型名
- 可选的持久化提示词
- 35% 到 95% 的窗口透明度

## API 配置列表

- 设置页可新建、重命名、删除和上下调整多个 API 配置；每个配置独立保存名称、API Key、Base URL、接口协议和模型名。
- API Key 仍通过 Windows DPAPI 加密保存。点击已保存 Key 旁的“复制”只会由主进程写入系统剪贴板，界面不会读取或显示原始密钥。
- `Alt+M` 按列表顺序循环切换至下一套配置。切换会取消当前请求，并清空截图队列、对话轮次与历史摘要，以新会话开始；标题栏会显示当前配置名称。

默认快捷键：

| 快捷键 | 功能 |
| --- | --- |
| `Alt+Q` | 捕获整个主屏幕并加入当前对话轮次，最多保留 5 张待发送截图 |
| `Alt+W` | 将输入框中的问题和当前轮截图发送给模型 |
| `Alt+R` | 清空当前截图、对话轮次和历史摘要 |
| `Shift+↑` / `Shift+↓` | 向上或向下滚动回答内容；可在设置中修改 |
| `Alt+M` | 按配置列表顺序切换 API 配置，并开启新会话 |
| `Alt+E` | 显示或隐藏悬浮窗 |
| `Alt+X` | 退出应用进程 |
| `Ctrl` + 方向键 | 以 24 像素为步长移动悬浮窗 |

Practice Copilot 使用 `Alt+E` 显示时不会主动抢占当前前台窗口。窗口保持可点击、可输入的单一状态；使用 `Alt+↑` / `Alt+↓` 可以在不点击悬浮窗的情况下滚动回答内容。

设置中的每个快捷键都可以直接编辑，也可以点击“录制”后按下目标按键自动填入。支持键盘组合键以及 Windows 全局鼠标按钮：`MouseMiddle`（鼠标中键）、`Mouse4`（侧键前进）和 `Mouse5`（侧键后退）。

## 多轮对话

- 底部输入框是当前轮的正式用户消息，不再是临时补充提示词。
- 每轮可以只输入文本、只附加截图，或同时输入文本和最多 5 张截图。
- 前 10 轮会以完整图文和回答直接输入模型；开始第 11 轮时，前 10 轮会一次性压缩为最多 2000 Token 的累计摘要，然后从第 11 轮重新累计下一组完整对话。
- Responses 模式由应用在内存中维护多轮状态：最近 10 轮按照 `user（文本和该轮图片）→ assistant（该轮完整回答）` 的顺序直接输入模型；不依赖 `previous_response_id`，也不会把不同轮次的图片合并。
- 摘要生成失败时不会删除原始历史；`Alt+R` 会同时清空截图、对话轮次和历史摘要。
- 对话和图片只保存在内存中，应用退出后不会恢复历史。

关闭悬浮窗只会隐藏窗口，应用会继续在后台运行。使用 `Alt+E` 重新显示窗口，使用 `Alt+X` 退出应用。

## 隐私与内容保护

- API Key 使用 Electron `safeStorage`，在 Windows 上由 DPAPI 加密；密钥不会暴露给 React 渲染进程。
- 截图与回答只保存在内存中，不写入磁盘；应用不包含账号、遥测或独立服务端。
- 窗口始终启用 Windows 内容保护。它可让遵守系统捕获排除机制的截图、录屏和屏幕共享软件忽略该窗口，但无法阻止摄像机、驱动级捕获或刻意绕过系统 API 的工具，因此不能保证对所有捕获方式绝对不可见。

本软件用于本地模拟练习及明确允许使用辅助工具的场景。使用第三方模型服务时，截图和提示词会发送给用户配置的服务提供方，请同时遵守对方的隐私政策与使用规则。
