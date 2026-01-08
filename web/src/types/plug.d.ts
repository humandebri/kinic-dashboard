import type { HttpAgent } from '@dfinity/agent'

type PlugConnectArgs = {
  whitelist: string[]
  host?: string
  timeout?: number
}

type PlugInterface = {
  requestConnect: (args: PlugConnectArgs) => Promise<boolean>
  createAgent: (args: { whitelist: string[]; host?: string }) => Promise<void>
  agent?: HttpAgent
  principalId?: string
  accountId?: string
  onExternalDisconnect?: (callback: () => void) => void
}

declare global {
  interface Window {
    ic?: {
      plug?: PlugInterface
    }
  }
}

export {}
