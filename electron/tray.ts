import { Menu, nativeImage, Tray, type BrowserWindow } from 'electron'

export interface TrayActions {
  openSettings(): void
  quit(): void
  toggle(): void
}

export function createAppTray(
  iconPath: string,
  window: BrowserWindow,
  actions: TrayActions
): Tray {
  const loadedIcon = nativeImage.createFromPath(iconPath)
  const fallbackIcon = nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" rx="6" fill="#2563eb"/><path d="M6 5h8v2H8v2h5v2H8v4H6z" fill="white"/></svg>'
    )}`
  )
  const tray = new Tray(loadedIcon.isEmpty() ? fallbackIcon : loadedIcon)
  tray.setToolTip('Practice Copilot')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { click: actions.toggle, label: '显示 / 隐藏' },
      { click: actions.openSettings, label: '设置' },
      { type: 'separator' },
      { click: actions.quit, label: '退出' }
    ])
  )
  tray.on('click', actions.toggle)
  return tray
}
