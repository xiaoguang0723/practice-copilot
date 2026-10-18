# 防截屏窗口（WDA_EXCLUDEFROMCAPTURE）捕获问题：诊断与方案

## 现象

捕获某些软件（例如「国考云考试系统」）时截图缺失该窗口内容；用 Windows 自带截图（Win+Shift+S）同样会「看到」它消失。这不是本项目的 bug：被截窗口只是从合成画面中被整个剔除，露出其背后的窗口。

## 诊断结论

该行为来自 Win32 标准防截屏 API。对该窗口调用公开的 `GetWindowDisplayAffinity` 可直接观测到：

```
国考云考试系统 (进程 国考云) → affinity = 17 = 0x11 = WDA_EXCLUDEFROMCAPTURE
```

即目标软件在自己进程内调用了 `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)`。Windows 10 2004+ 会把这类窗口从所有「采集消费者」的合成输出中剔除（不是变黑，而是消失、露出下层窗口）。

## 突破口：标记只在顶层窗口，子窗口可以补拍

该 API **只对被标记的那个顶层窗口生效，不传染给子窗口**。而 Chromium 系应用（国考云是 Electron 应用，`app.asar` + `LICENSE.electron.txt`）的页面实际渲染在子窗口 `Intermediate D3D Window`（GPU 合成表面）里——对这个**子窗口**调用 `PrintWindow(PW_RENDERFULLCONTENT)`，系统不认为是截屏，窗口内容原样输出。实测（2026-10，Windows 11 26200）：

| 目标 | 结果 |
| --- | --- |
| 顶层窗口 PrintWindow | 纯黑（被剔除） |
| 子窗口 `Chrome_RenderWidgetHostHWND` PrintWindow | 纯黑 |
| 子窗口 `Intermediate D3D Window` PrintWindow | **完整像素级界面**（logo、题目、按钮全部清晰） |

本项目已把该路径产品化为**防截屏自动补拍**（见下文），无需任何手动操作。

## 取证：其余路径均已实测（Windows 11 26200，2026-10）

| 采集路径 | 实测结果 |
| --- | --- |
| `PrintWindow` / `PW_RENDERFULLCONTENT`（顶层） | 纯黑 |
| GDI `BitBlt` 屏幕拷贝（`SRCCOPY` ± `CAPTUREBLT`） | 窗口被剔除，拍到其背后的内容 |
| `BitBlt` 窗口自身 DC / `WM_PRINT` / `WM_PRINTCLIENT` | 纯黑 |
| DWM 缩略图 `DwmRegisterThumbnail` | 空白占位 |
| 放大镜 API（回调与渲染，多配置 A/B 对照） | 对第三方进程整体锁死 |
| Windows 系统放大镜 magnify.exe（A/B 对照） | 普通窗口正常放大；防截屏窗口采样被剔除 |
| `DwmGetDxSharedSurface` | 导出已从 dwmapi.dll 移除 |
| WGC 窗口捕获 / WGC+DXGI 屏幕捕获 | 无帧 / 窗口消失 |
| UI Automation 文字提取（含屏幕阅读器检测欺骗） | 目标软件禁用了无障碍树 |
| MSAA（oleacc `AccessibleObjectFromWindow`） | 对象存在但文本属性返回 E_INVALIDARG |
| 打印预览（Ctrl+P）/ DevTools（F12）衍生窗口 | 软件已禁用，无新窗口 |
| **子窗口 `Intermediate D3D Window` PrintWindow** | **成功——完整界面（本项目采用）** |

另测得两项备选信息：目标软件**允许 Ctrl+A / Ctrl+C 复制页面文字**（剪贴板提取可用作文字通道）；它是 Electron 应用（`E:\guokaoyun\stone-exam-ui\国考云.exe`），如自行以 `--remote-debugging-port=9222` 启动可通过 CDP 提取 DOM 文字（进阶备选，补拍方案不需要）。

## 本项目提供的支持

### 1. 防截屏自动补拍（默认启用，主方案）

每次截图会自动检测处于 `WDA_EXCLUDEFROMCAPTURE` 状态的窗口，对其 GPU 合成子窗口补拍一份**完整界面图**，作为额外图片随截图一并发给模型：

- **自动排除本软件自身**：Practice Copilot 自己的悬浮窗也开启了防截屏保护（避免出现在截图里），补拍按进程 PID 跳过自身窗口，不会把操作界面拍进图片；
- 标题栏状态行显示「✓ 已补拍 国考云考试系统」；若补拍失败会降级为「⚠ 缺失」警告；
- 发给模型的系统提示会说明补拍图片与用户屏幕一致，请优先识别补拍图；
- 补拍失败时提示改为提醒用户提供其他方式，避免模型臆测编造。

### 2. 图片导入（备用）

手机拍照后传到电脑，在 Copilot 窗口内 **Ctrl+V** 贴入或点 **📷** 按钮导入文件（JPG/PNG/WebP/BMP），与截图一同发送。大图自动压缩到宽 2000px。

### 3. 附加捕获窗口（备用）

设置 → 附加捕获窗口，填写窗口标题关键字（如 `Edge`），每次截图一并捕获该窗口——适合浏览器打开的题库网页版。

### 4. 防截屏检测信息

每次截图用 `GetWindowDisplayAffinity`（只读）检测防截屏窗口，标题栏提示与模型提示联动（见上）。

> 曾评估并否决的路线：虚拟机内运行 + 宿主机捕获（部署重、可能被客户端检测）；放大镜渲染代理（API 已锁死）；HDMI 采集卡（有效但需硬件）；DLL 注入 / 驱动级采集（属于攻击第三方进程，不做）。

## 取证脚本

诊断与验证脚本保留在 `.scratch/`（`options-probe.ps1` 为本轮综合探测，其余 `cap-probe*`、`mag-*`、`uia-probe*`、`shared-surface-probe.ps1`、`wgc-window-probe.cjs` 为历史路径取证），产物在 `.scratch/out/`。如需复验某条路径，运行对应脚本即可。
