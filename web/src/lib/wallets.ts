// Where: Wallet connection helpers for Plug and OISY.
// What: Connects wallets and exposes minimal account details.
// Why: Centralizes wallet wiring for the Add Memory flow.
'use client'

import { HttpAgent } from '@dfinity/agent'
import { IcrcWallet } from '@dfinity/oisy-wallet-signer/icrc-wallet'

import { IC_HOST, LAUNCHER_CANISTER_ID, LEDGER_CANISTER_ID, OISY_SIGNER_URL } from '@/lib/ic-config'

export type WalletKind = 'plug' | 'oisy'

export type WalletAccount = {
  principal: string
  accountId?: string
  subaccount?: Uint8Array | null
}

export type PlugWallet = {
  kind: 'plug'
  agent: HttpAgent
  account: WalletAccount
}

export type OisyWallet = {
  kind: 'oisy'
  wallet: IcrcWallet
  account: WalletAccount
}

export type WalletConnection = PlugWallet | OisyWallet

const whitelist = [LAUNCHER_CANISTER_ID, LEDGER_CANISTER_ID]

const getPlug = () => {
  const plug = window.ic?.plug
  if (!plug) {
    throw new Error('Plug wallet not found')
  }
  return plug
}

export const connectPlug = async (): Promise<PlugWallet> => {
  const plug = getPlug()
  const connected = await plug.requestConnect({
    whitelist,
    host: IC_HOST,
    timeout: 120_000
  })

  if (!connected) {
    throw new Error('Plug connection was rejected')
  }

  await plug.createAgent({ whitelist, host: IC_HOST })
  const agent = plug.agent

  if (!agent || !plug.principalId) {
    throw new Error('Plug agent unavailable')
  }

  return {
    kind: 'plug',
    agent,
    account: {
      principal: plug.principalId,
      accountId: plug.accountId
    }
  }
}

export const connectOisy = async (): Promise<OisyWallet> => {
  const wallet = await IcrcWallet.connect({ url: OISY_SIGNER_URL, host: IC_HOST })
  await wallet.requestPermissionsNotGranted()
  const accounts = await wallet.accounts()
  const first = accounts[0]

  if (!first) {
    throw new Error('No OISY account available')
  }

  return {
    kind: 'oisy',
    wallet,
    account: {
      principal: first.owner,
      subaccount: null
    }
  }
}
