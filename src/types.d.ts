import type { PracticeApi } from '../shared/protocol'

declare global {
  interface Window {
    practice: PracticeApi
  }
}

export {}
