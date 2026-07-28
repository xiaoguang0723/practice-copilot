export interface PointerThroughWindow {
  blur(): void
  setFocusable(focusable: boolean): void
  setIgnoreMouseEvents(ignore: boolean, options: { forward: boolean }): void
}

export function setPointerThrough(window: PointerThroughWindow, enabled: boolean): void {
  window.setIgnoreMouseEvents(enabled, { forward: true })
  window.setFocusable(!enabled)
  if (enabled) window.blur()
}
