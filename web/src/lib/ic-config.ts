// Where: Shared IC configuration for web client.
// What: Environment-driven host and canister constants.
// Why: Centralizes IC connection settings for UI and hooks.
export const IC_HOST = 'https://ic0.app'
export const LEDGER_CANISTER_ID = '73mez-iiaaa-aaaaq-aaasq-cai'
export const LAUNCHER_CANISTER_ID = 'xfug4-5qaaa-aaaak-afowa-cai'
export const IDENTITY_PROVIDER_URL = 'https://id.ai'
export const EMBEDDING_ENDPOINT = process.env.NEXT_PUBLIC_EMBEDDING_ENDPOINT || 'https://api.kinic.io'
export const DERIVATION_ORIGIN = process.env.NEXT_PUBLIC_DERIVATION_ORIGIN
export const II_SESSION_TTL_NS = 86_400_000_000_000n
export const APPROVAL_TTL_NS = 600_000_000_000n
export const OISY_SIGNER_URL = process.env.NEXT_PUBLIC_OISY_SIGNER_URL || 'https://oisy.com/sign'

export const isMainnetHost = (host: string): boolean => {
  return host.includes('ic0.app') || host.includes('icp0.io')
}
