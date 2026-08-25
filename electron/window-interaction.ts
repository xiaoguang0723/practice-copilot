export interface OverlayWindow {
  blur(): void
  setFocusable(focusable: boolean): void
  setIgnoreMouseEvents(ignore: boolean, options: { forward: boolean }): void
  setSkipTaskbar(skip: boolean): void
  showInactive(): void
}

export function showWithoutActivation(window: OverlayWindow, interactive = true): void {
  window.setFocusable(interactive)
  window.setSkipTaskbar(true)
  window.showInactive()
}

export function setPointerThrough(window: OverlayWindow, enabled: boolean): void {
  window.setIgnoreMouseEvents(enabled, { forward: true })
  window.setFocusable(!enabled)
  if (enabled) window.blur()
}
