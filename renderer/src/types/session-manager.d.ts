export {}

declare global {
  interface Window {
    sessionManager?: {
      selectDirectory: () => Promise<string | undefined>
      minimize: () => Promise<void>
      maximize: () => Promise<boolean>
      close: () => Promise<void>
    }
  }
}
