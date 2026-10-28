// Where: Ledger actor helpers for balance queries.
// What: Creates a typed actor for icrc1_balance_of.
// Why: Keeps IC actor wiring isolated from UI components.
import { Actor, HttpAgent } from '@dfinity/agent'
import { IDL } from '@dfinity/candid'
import type { Identity } from '@dfinity/agent'
import type { Principal } from '@dfinity/principal'

import { IC_HOST, LEDGER_CANISTER_ID, isMainnetHost } from '@/lib/ic-config'

type Account = {
  owner: Principal
  subaccount: [] | [Uint8Array]
}

type TransferArgs = {
  from_subaccount: [] | [Uint8Array]
  to: Account
  amount: bigint
  fee: [] | [bigint]
  memo: [] | [Uint8Array]
  created_at_time: [] | [bigint]
}

type TransferError =
  | { BadFee: { expected_fee: bigint } }
  | { InsufficientFunds: { balance: bigint } }
  | { TooOld: null }
  | { CreatedInFuture: { ledger_time: bigint } }
  | { Duplicate: { duplicate_of: bigint } }
  | { TemporarilyUnavailable: null }
  | { GenericError: { error_code: bigint; message: string } }

type TransferResult = { Ok: bigint } | { Err: TransferError }

type ApproveArgs = {
  from_subaccount: [] | [Uint8Array]
  spender: Account
  amount: bigint
  expected_allowance: [] | [bigint]
  expires_at: [] | [bigint]
  fee: [] | [bigint]
  memo: [] | [Uint8Array]
  created_at_time: [] | [bigint]
}

type ApproveError =
  | { BadFee: { expected_fee: bigint } }
  | { InsufficientFunds: { balance: bigint } }
  | { AllowanceChanged: { current_allowance: bigint } }
  | { Expired: { ledger_time: bigint } }
  | { TooOld: null }
  | { CreatedInFuture: { ledger_time: bigint } }
  | { Duplicate: { duplicate_of: bigint } }
  | { TemporarilyUnavailable: null }
  | { GenericError: { error_code: bigint; message: string } }

type ApproveResult = { Ok: bigint } | { Err: ApproveError }

type BalanceActor = {
  icrc1_balance_of: (account: Account) => Promise<bigint>
  icrc1_transfer: (args: TransferArgs) => Promise<TransferResult>
  icrc2_approve: (args: ApproveArgs) => Promise<ApproveResult>
}

const ledgerIdlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const Account = IDL.Record({
    owner: IDL.Principal,
    subaccount: IDL.Opt(IDL.Vec(IDL.Nat8))
  })
  const TransferArgs = IDL.Record({
    from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
    to: Account,
    amount: IDL.Nat,
    fee: IDL.Opt(IDL.Nat),
    memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Nat64)
  })
  const TransferError = IDL.Variant({
    BadFee: IDL.Record({ expected_fee: IDL.Nat }),
    InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
    TooOld: IDL.Null,
    CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
    Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
    TemporarilyUnavailable: IDL.Null,
    GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text })
  })
  const TransferResult = IDL.Variant({
    Ok: IDL.Nat,
    Err: TransferError
  })
  const ApproveArgs = IDL.Record({
    from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
    spender: Account,
    amount: IDL.Nat,
    expected_allowance: IDL.Opt(IDL.Nat),
    expires_at: IDL.Opt(IDL.Nat64),
    fee: IDL.Opt(IDL.Nat),
    memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Nat64)
  })
  const ApproveError = IDL.Variant({
    BadFee: IDL.Record({ expected_fee: IDL.Nat }),
    InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
    AllowanceChanged: IDL.Record({ current_allowance: IDL.Nat }),
    Expired: IDL.Record({ ledger_time: IDL.Nat64 }),
    TooOld: IDL.Null,
    CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
    Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
    TemporarilyUnavailable: IDL.Null,
    GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text })
  })
  const ApproveResult = IDL.Variant({
    Ok: IDL.Nat,
    Err: ApproveError
  })
  return IDL.Service({
    icrc1_balance_of: IDL.Func([Account], [IDL.Nat], ['query']),
    icrc1_transfer: IDL.Func([TransferArgs], [TransferResult], []),
    icrc2_approve: IDL.Func([ApproveArgs], [ApproveResult], [])
  })
}

export const createLedgerActor = async (identity?: Identity): Promise<BalanceActor> => {
  const agent = new HttpAgent({
    host: IC_HOST,
    identity
  })

  if (!isMainnetHost(IC_HOST)) {
    await agent.fetchRootKey()
  }

  return Actor.createActor<BalanceActor>(ledgerIdlFactory, {
    agent,
    canisterId: LEDGER_CANISTER_ID
  })
}

export const createLedgerActorWithAgent = (agent: HttpAgent): BalanceActor => {
  return Actor.createActor<BalanceActor>(ledgerIdlFactory, {
    agent,
    canisterId: LEDGER_CANISTER_ID
  })
}

const formatTransferError = (error: TransferError): string => {
  if ('BadFee' in error) return `Bad fee (expected ${error.BadFee.expected_fee})`
  if ('InsufficientFunds' in error) return `Insufficient funds (${error.InsufficientFunds.balance})`
  if ('TooOld' in error) return 'Request too old'
  if ('CreatedInFuture' in error) return `Created in future at ${error.CreatedInFuture.ledger_time}`
  if ('Duplicate' in error) return `Duplicate request ${error.Duplicate.duplicate_of}`
  if ('TemporarilyUnavailable' in error) return 'Temporarily unavailable'
  if ('GenericError' in error) return error.GenericError.message
  return 'Unknown transfer error'
}

const isTransferError = (value: unknown): value is TransferError => {
  if (!isRecord(value)) return false
  return (
    'BadFee' in value ||
    'InsufficientFunds' in value ||
    'TooOld' in value ||
    'CreatedInFuture' in value ||
    'Duplicate' in value ||
    'TemporarilyUnavailable' in value ||
    'GenericError' in value
  )
}

export const transferIcrc1 = async (actor: BalanceActor, args: TransferArgs): Promise<bigint> => {
  const result = await actor.icrc1_transfer(args)
  if (isRecord(result) && 'Err' in result) {
    throw new Error(formatTransferError(result.Err))
  }
  if (isRecord(result) && 'Ok' in result) {
    return result.Ok
  }
  throw new Error('Unexpected transfer response')
}

const icrc1TransferArgsIdl = (IDL: typeof import('@dfinity/candid').IDL) => {
  const Account = IDL.Record({
    owner: IDL.Principal,
    subaccount: IDL.Opt(IDL.Vec(IDL.Nat8))
  })
  return IDL.Record({
    from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
    to: Account,
    amount: IDL.Nat,
    fee: IDL.Opt(IDL.Nat),
    memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Nat64)
  })
}

const icrc1TransferResultIdl = (IDL: typeof import('@dfinity/candid').IDL) => {
  const TransferError = IDL.Variant({
    BadFee: IDL.Record({ expected_fee: IDL.Nat }),
    InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
    TooOld: IDL.Null,
    CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
    Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
    TemporarilyUnavailable: IDL.Null,
    GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text })
  })
  return IDL.Variant({
    Ok: IDL.Nat,
    Err: TransferError
  })
}

export const encodeIcrc1TransferArgs = (args: TransferArgs): Uint8Array => {
  const arg = IDL.encode([icrc1TransferArgsIdl(IDL)], [args])
  return new Uint8Array(arg)
}

export const decodeIcrc1TransferResult = (bytes: Uint8Array): TransferResult => {
  const [result] = IDL.decode([icrc1TransferResultIdl(IDL)], bytes)
  if (!isRecord(result)) {
    throw new Error('Invalid transfer response')
  }
  if ('Ok' in result && typeof result.Ok === 'bigint') {
    return { Ok: result.Ok }
  }
  if ('Err' in result && isTransferError(result.Err)) {
    return { Err: result.Err }
  }
  throw new Error('Invalid transfer response')
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const formatApproveError = (error: ApproveError): string => {
  if ('BadFee' in error) return `Bad fee (expected ${error.BadFee.expected_fee})`
  if ('InsufficientFunds' in error) return `Insufficient funds (${error.InsufficientFunds.balance})`
  if ('AllowanceChanged' in error) return `Allowance changed (${error.AllowanceChanged.current_allowance})`
  if ('Expired' in error) return `Expired at ${error.Expired.ledger_time}`
  if ('TooOld' in error) return 'Request too old'
  if ('CreatedInFuture' in error) return `Created in future at ${error.CreatedInFuture.ledger_time}`
  if ('Duplicate' in error) return `Duplicate request ${error.Duplicate.duplicate_of}`
  if ('TemporarilyUnavailable' in error) return 'Temporarily unavailable'
  if ('GenericError' in error) return error.GenericError.message
  return 'Unknown approve error'
}

export const approveLauncherSpend = async (
  identity: Identity,
  spender: Principal,
  amount: bigint,
  expiresAt: bigint
): Promise<void> => {
  const actor = await createLedgerActor(identity)
  const result = await actor.icrc2_approve({
    from_subaccount: [],
    spender: { owner: spender, subaccount: [] },
    amount,
    expected_allowance: [],
    expires_at: [expiresAt],
    fee: [],
    memo: [],
    created_at_time: [BigInt(Date.now()) * 1_000_000n]
  })

  if (isRecord(result) && 'Err' in result) {
    const message = formatApproveError(result.Err)
    throw new Error(message)
  }
}
