export interface OverlayWindow {
  setFocusable(focusable: boolean): void
  setSkipTaskbar(skip: boolean): void
  showInactive(): void
}

export function showWithoutActivation(window: OverlayWindow): void {
  window.setFocusable(true)
  window.setSkipTaskbar(true)
  window.showInactive()
}
