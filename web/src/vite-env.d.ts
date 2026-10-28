/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EMBEDDING_ENDPOINT?: string
  readonly VITE_DERIVATION_ORIGIN?: string
  readonly VITE_OISY_SIGNER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
