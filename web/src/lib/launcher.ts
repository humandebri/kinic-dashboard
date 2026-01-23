// Where: Launcher canister actor helpers for list_instance.
// What: Provides typed actor creation and state decoding for Memories.
// Why: Keeps IC wiring centralized and reusable across pages.
import { Actor, HttpAgent } from '@dfinity/agent'
import { IDL } from '@dfinity/candid'
import type { Identity } from '@dfinity/agent'
import type { Principal } from '@dfinity/principal'

import { IC_HOST, LAUNCHER_CANISTER_ID, isMainnetHost } from '@/lib/ic-config'

export type LauncherState =
  | { Empty: string }
  | { Pending: string }
  | { Creation: string }
  | { Installation: [Principal, string] }
  | { SettingUp: Principal }
  | { Running: Principal }

export type TransferResponseError =
  | { CallReject: string }
  | { TransferError: TransferError }
  | { TransferFromError: TransferFromError }

type GenericError = {
  message: string
  error_code: bigint
}

type BadBurn = {
  min_burn_amount: bigint
}

type BadFee = {
  expected_fee: bigint
}

type Duplicate = {
  duplicate_of: bigint
}

type CreatedInFuture = {
  ledger_time: bigint
}

type InsufficientFunds = {
  balance: bigint
}

type InsufficientAllowance = {
  allowance: bigint
}

type TransferError =
  | { GenericError: GenericError }
  | { TemporarilyUnavailable: null }
  | { BadBurn: BadBurn }
  | { Duplicate: Duplicate }
  | { BadFee: BadFee }
  | { CreatedInFuture: CreatedInFuture }
  | { TooOld: null }
  | { InsufficientFunds: InsufficientFunds }

type TransferFromError =
  | { GenericError: GenericError }
  | { TemporarilyUnavailable: null }
  | { InsufficientAllowance: InsufficientAllowance }
  | { BadBurn: BadBurn }
  | { Duplicate: Duplicate }
  | { BadFee: BadFee }
  | { CreatedInFuture: CreatedInFuture }
  | { TooOld: null }
  | { InsufficientFunds: InsufficientFunds }

export type DeployInstanceError =
  | { IndexOutOfLange: null }
  | { SettingUpCanister: string }
  | { Refund: null }
  | { NoInstances: null }
  | { CreateCanister: null }
  | { InstallCanister: null }
  | { CheckBalance: TransferResponseError }
  | { AlreadyRunning: null }

export type DeployInstanceResult =
  | { Ok: string }
  | { Err: DeployInstanceError }

export type SimpleResult =
  | { Ok: null }
  | { Err: string }

export type MarketedInstanceStatus =
  | { None: null }
  | { Unlisting: null }
  | { Active: [bigint, number] }

export type InstanceVersionEntry = [string, string]

const normalizeVersionEntry = (entry: unknown): InstanceVersionEntry | null => {
  if (Array.isArray(entry) && entry.length >= 2) {
    const [first, second] = entry
    if (typeof first === 'string' && typeof second === 'string') {
      return [first, second]
    }
  }
  if (entry && typeof entry === 'object') {
    const first = Reflect.get(entry, '0')
    const second = Reflect.get(entry, '1')
    if (typeof first === 'string' && typeof second === 'string') {
      return [first, second]
    }
  }
  return null
}

const describeTransferError = (error: TransferError): string => {
  if ('GenericError' in error) return error.GenericError.message
  if ('TemporarilyUnavailable' in error) return 'Temporarily unavailable.'
  if ('BadBurn' in error) return `Bad burn (min ${error.BadBurn.min_burn_amount.toString()}).`
  if ('Duplicate' in error) return `Duplicate (block ${error.Duplicate.duplicate_of.toString()}).`
  if ('BadFee' in error) return `Bad fee (expected ${error.BadFee.expected_fee.toString()}).`
  if ('CreatedInFuture' in error) {
    return `Created in future at ${error.CreatedInFuture.ledger_time.toString()}.`
  }
  if ('TooOld' in error) return 'Too old.'
  if ('InsufficientFunds' in error) {
    return `Insufficient funds (balance ${error.InsufficientFunds.balance.toString()}).`
  }
  return 'Ledger transfer error.'
}

const describeTransferFromError = (error: TransferFromError): string => {
  if ('GenericError' in error) return error.GenericError.message
  if ('TemporarilyUnavailable' in error) return 'Temporarily unavailable.'
  if ('InsufficientAllowance' in error) {
    return `Insufficient allowance (${error.InsufficientAllowance.allowance.toString()}).`
  }
  if ('BadBurn' in error) return `Bad burn (min ${error.BadBurn.min_burn_amount.toString()}).`
  if ('Duplicate' in error) return `Duplicate (block ${error.Duplicate.duplicate_of.toString()}).`
  if ('BadFee' in error) return `Bad fee (expected ${error.BadFee.expected_fee.toString()}).`
  if ('CreatedInFuture' in error) {
    return `Created in future at ${error.CreatedInFuture.ledger_time.toString()}.`
  }
  if ('TooOld' in error) return 'Too old.'
  if ('InsufficientFunds' in error) {
    return `Insufficient funds (balance ${error.InsufficientFunds.balance.toString()}).`
  }
  return 'Ledger transfer-from error.'
}

const describeTransferResponseError = (error: TransferResponseError): string => {
  if ('CallReject' in error) return error.CallReject
  if ('TransferError' in error) return describeTransferError(error.TransferError)
  if ('TransferFromError' in error) return describeTransferFromError(error.TransferFromError)
  return 'Check balance failed.'
}

const describeDeployInstanceError = (error: DeployInstanceError): string => {
  if ('IndexOutOfLange' in error) return 'Invalid launcher state.'
  if ('SettingUpCanister' in error) return error.SettingUpCanister
  if ('Refund' in error) return 'Refunded.'
  if ('NoInstances' in error) return 'No instances available.'
  if ('CreateCanister' in error) return 'Failed to create canister.'
  if ('InstallCanister' in error) return 'Failed to install canister.'
  if ('CheckBalance' in error) return describeTransferResponseError(error.CheckBalance)
  if ('AlreadyRunning' in error) return 'Instance already running.'
  return 'Failed to deploy instance.'
}

export type LauncherActor = {
  get_price: () => Promise<bigint>
  deploy_instance: (payload: string, vectorDim: bigint) => Promise<DeployInstanceResult>
  list_instance: () => Promise<LauncherState[]>
  update_instance: (instance_pid_str: string) => Promise<SimpleResult>
  update_instance_with_option: (instance_pid_str: string, option: boolean) => Promise<SimpleResult>
  get_remaining_cycles: (instance_pid_str: string) => Promise<bigint>
  get_instance_version: () => Promise<InstanceVersionEntry[]>
  get_version: () => Promise<string>
  get_marketed_instance_status: (instance_pid_str: string) => Promise<MarketedInstanceStatus>
  lock_instance_for_downloading: (instance_pid_str: string) => Promise<SimpleResult>
  get_shared_memory: () => Promise<Principal[]>
  register_shared_memory: (instance_pid: Principal) => Promise<void>
}

const DEFAULT_VECTOR_DIM = 1024n

const launcherIdlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const State = IDL.Variant({
    Empty: IDL.Text,
    Pending: IDL.Text,
    Creation: IDL.Text,
    Installation: IDL.Tuple(IDL.Principal, IDL.Text),
    SettingUp: IDL.Principal,
    Running: IDL.Principal
  })
  const TransferResponseError = IDL.Variant({
    CallReject: IDL.Text,
    TransferError: IDL.Variant({
      GenericError: IDL.Record({ message: IDL.Text, error_code: IDL.Nat }),
      TemporarilyUnavailable: IDL.Null,
      BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }),
      Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
      BadFee: IDL.Record({ expected_fee: IDL.Nat }),
      CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
      TooOld: IDL.Null,
      InsufficientFunds: IDL.Record({ balance: IDL.Nat })
    }),
    TransferFromError: IDL.Variant({
      GenericError: IDL.Record({ message: IDL.Text, error_code: IDL.Nat }),
      TemporarilyUnavailable: IDL.Null,
      InsufficientAllowance: IDL.Record({ allowance: IDL.Nat }),
      BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }),
      Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
      BadFee: IDL.Record({ expected_fee: IDL.Nat }),
      CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
      TooOld: IDL.Null,
      InsufficientFunds: IDL.Record({ balance: IDL.Nat })
    })
  })
  const MarketedInstanceStatus = IDL.Variant({
    None: IDL.Null,
    Active: IDL.Tuple(IDL.Nat, IDL.Nat32),
    Unlisting: IDL.Null
  })
  const ResultText = IDL.Variant({
    Ok: IDL.Null,
    Err: IDL.Text
  })

  return IDL.Service({
    get_price: IDL.Func([], [IDL.Nat], ['query']),
    deploy_instance: IDL.Func(
      [IDL.Text, IDL.Nat64],
      [
        IDL.Variant({
          Ok: IDL.Text,
          Err: IDL.Variant({
            IndexOutOfLange: IDL.Null,
            SettingUpCanister: IDL.Text,
            Refund: IDL.Null,
            NoInstances: IDL.Null,
            CreateCanister: IDL.Null,
            InstallCanister: IDL.Null,
            CheckBalance: TransferResponseError,
            AlreadyRunning: IDL.Null
          })
        })
      ],
      []
    ),
    list_instance: IDL.Func([], [IDL.Vec(State)], ['query']),
    update_instance: IDL.Func([IDL.Text], [ResultText], []),
    update_instance_with_option: IDL.Func([IDL.Text, IDL.Bool], [ResultText], []),
    get_remaining_cycles: IDL.Func([IDL.Text], [IDL.Nat], ['query']),
    get_instance_version: IDL.Func([], [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))], ['query']),
    get_version: IDL.Func([], [IDL.Text], ['query']),
    get_marketed_instance_status: IDL.Func([IDL.Text], [MarketedInstanceStatus], ['query']),
    lock_instance_for_downloading: IDL.Func([IDL.Text], [ResultText], []),
    get_shared_memory: IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    register_shared_memory: IDL.Func([IDL.Principal], [], [])
  })
}

export const createLauncherActor = async (identity?: Identity): Promise<LauncherActor> => {
  const agent = new HttpAgent({
    host: IC_HOST,
    identity
  })

  if (!isMainnetHost(IC_HOST)) {
    await agent.fetchRootKey()
  }

  return Actor.createActor<LauncherActor>(launcherIdlFactory, {
    agent,
    canisterId: LAUNCHER_CANISTER_ID
  })
}

export const deployMemoryInstance = async (
  identity: Identity,
  name: string,
  description: string
) => {
  const actor = await createLauncherActor(identity)
  const payload = JSON.stringify({ name, description })
  const result = await actor.deploy_instance(payload, DEFAULT_VECTOR_DIM)
  if ('Err' in result) {
    throw new Error(describeDeployInstanceError(result.Err))
  }
  return result.Ok
}

export const updateMemoryInstance = async (
  identity: Identity,
  instanceId: string
) => {
  const actor = await createLauncherActor(identity)
  const result = await actor.update_instance(instanceId)
  if ('Err' in result) {
    throw new Error(result.Err)
  }
}

export const updateMemoryInstanceWithOption = async (
  identity: Identity,
  instanceId: string,
  option: boolean
) => {
  const actor = await createLauncherActor(identity)
  const result = await actor.update_instance_with_option(instanceId, option)
  if ('Err' in result) {
    throw new Error(result.Err)
  }
}

export const fetchRemainingCycles = async (
  identity: Identity | undefined,
  instanceId: string
) => {
  const actor = await createLauncherActor(identity)
  return actor.get_remaining_cycles(instanceId)
}

export const fetchInstanceVersions = async (identity?: Identity) => {
  const actor = await createLauncherActor(identity)
  const entries = await actor.get_instance_version()
  return entries
    .map((entry) => normalizeVersionEntry(entry))
    .filter((entry): entry is InstanceVersionEntry => entry !== null)
}

export const fetchLauncherVersion = async (identity?: Identity) => {
  const actor = await createLauncherActor(identity)
  return actor.get_version()
}

export const fetchMarketedStatus = async (
  identity: Identity | undefined,
  instanceId: string
) => {
  const actor = await createLauncherActor(identity)
  return actor.get_marketed_instance_status(instanceId)
}

export const lockInstanceForDownloading = async (
  identity: Identity,
  instanceId: string
) => {
  const actor = await createLauncherActor(identity)
  const result = await actor.lock_instance_for_downloading(instanceId)
  if ('Err' in result) {
    throw new Error(result.Err)
  }
}

export const fetchSharedMemories = async (identity?: Identity) => {
  const actor = await createLauncherActor(identity)
  return actor.get_shared_memory()
}

export const registerSharedMemory = async (
  identity: Identity,
  instanceId: Principal
) => {
  const actor = await createLauncherActor(identity)
  await actor.register_shared_memory(instanceId)
}
