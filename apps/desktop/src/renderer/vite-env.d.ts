/// <reference types="vite/client" />

import type { VeyebeDesktopApi } from '../shared/contracts'

declare global {
  interface Window {
    veyebeDesktop?: VeyebeDesktopApi
  }
}

export {}
