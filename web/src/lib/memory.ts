// Where: Memory canister actor helpers for UI actions.
// What: Provides typed actor creation for update calls.
// Why: Centralizes IC wiring for memory admin actions.
import { Actor, HttpAgent } from '@dfinity/agent'
import { IDL } from '@dfinity/candid'
import type { Identity } from '@dfinity/agent'
import type { Principal } from '@dfinity/principal'

import { IC_HOST, isMainnetHost } from '@/lib/ic-config'

export type MemoryActor = {
  insert: (embedding: number[], text: string) => Promise<number>
  search: (embedding: number[]) => Promise<Array<[number, string]>>
  add_new_user: (principal: Principal, role: number) => Promise<void>
  remove_user: (principal: Principal) => Promise<void>
  change_name: (value: string) => Promise<void>
  get_current_status: () => Promise<StatusForFrontend>
  get_version: () => Promise<string>
  get_cycle_balance: () => Promise<bigint>
  get_users: () => Promise<Array<[string, number]>>
}

export type StatusForFrontend = {
  freezing_threshold: bigint
  controllers: string[]
  memory_size: bigint
  name: string
  source_chunk_len: number
  version: string
  hnsw_chunk_len: number
  cycles: bigint
  idle_cycles_burned_per_day: bigint
  db_key: string
  module_hash: [] | [Uint8Array]
  memory_allocation: bigint
  compute_allocation: bigint
}

const statusForFrontendType = IDL.Record({
  freezing_threshold: IDL.Nat,
  controllers: IDL.Vec(IDL.Text),
  memory_size: IDL.Nat,
  name: IDL.Text,
  source_chunk_len: IDL.Nat32,
  version: IDL.Text,
  hnsw_chunk_len: IDL.Nat32,
  cycles: IDL.Nat,
  idle_cycles_burned_per_day: IDL.Nat,
  db_key: IDL.Text,
  module_hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
  memory_allocation: IDL.Nat,
  compute_allocation: IDL.Nat
})

const memoryIdlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  return IDL.Service({
    insert: IDL.Func([IDL.Vec(IDL.Float32), IDL.Text], [IDL.Nat32], []),
    search: IDL.Func([IDL.Vec(IDL.Float32)], [IDL.Vec(IDL.Tuple(IDL.Float32, IDL.Text))], ['query']),
    add_new_user: IDL.Func([IDL.Principal, IDL.Nat8], [], []),
    remove_user: IDL.Func([IDL.Principal], [], []),
    change_name: IDL.Func([IDL.Text], [], []),
    get_current_status: IDL.Func([], [statusForFrontendType], []),
    get_version: IDL.Func([], [IDL.Text], ['query']),
    get_cycle_balance: IDL.Func([], [IDL.Nat], ['query']),
    get_users: IDL.Func([], [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat8))], ['query'])
  })
}

export const createMemoryActor = async (
  identity: Identity | undefined,
  canisterId: string
): Promise<MemoryActor> => {
  const agent = new HttpAgent({
    host: IC_HOST,
    identity
  })

  if (!isMainnetHost(IC_HOST)) {
    await agent.fetchRootKey()
  }

  return Actor.createActor<MemoryActor>(memoryIdlFactory, {
    agent,
    canisterId
  })
}

export const fetchMemoryVersion = async (
  identity: Identity | undefined,
  canisterId: string
): Promise<string> => {
  const actor = await createMemoryActor(identity, canisterId)
  return actor.get_version()
}

export const fetchMemoryCycles = async (
  identity: Identity | undefined,
  canisterId: string
): Promise<bigint> => {
  const actor = await createMemoryActor(identity, canisterId)
  return actor.get_cycle_balance()
}

export const fetchMemoryStatus = async (
  identity: Identity | undefined,
  canisterId: string
): Promise<StatusForFrontend> => {
  const actor = await createMemoryActor(identity, canisterId)
  return actor.get_current_status()
}

export const changeMemoryName = async (
  identity: Identity | undefined,
  canisterId: string,
  value: string
): Promise<void> => {
  const actor = await createMemoryActor(identity, canisterId)
  await actor.change_name(value)
}

export const fetchMemoryUsers = async (
  identity: Identity | undefined,
  canisterId: string
): Promise<Array<[string, number]>> => {
  const actor = await createMemoryActor(identity, canisterId)
  return actor.get_users()
}
