// Where: Management canister actor helpers.
// What: Provides canister_status for cycles lookup.
// Why: Allows UI to show cycles balance.
import { Actor, HttpAgent } from '@dfinity/agent'
import { IDL } from '@dfinity/candid'
import type { Identity } from '@dfinity/agent'
import type { Principal } from '@dfinity/principal'

import { IC_HOST, isMainnetHost } from '@/lib/ic-config'

export type CanisterStatus = {
  status: { running: null } | { stopping: null } | { stopped: null }
  settings: {
    controllers: Principal[]
    compute_allocation: bigint
    memory_allocation: bigint
    freezing_threshold: bigint
  }
  module_hash: [] | [Uint8Array]
  memory_size: bigint
  cycles: bigint
  idle_cycles_burned_per_day: bigint
}

export type ManagementActor = {
  canister_status: (args: { canister_id: Principal }) => Promise<CanisterStatus>
}

const managementIdlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const Status = IDL.Variant({
    running: IDL.Null,
    stopping: IDL.Null,
    stopped: IDL.Null
  })
  const DefiniteCanisterSettings = IDL.Record({
    controllers: IDL.Vec(IDL.Principal),
    compute_allocation: IDL.Nat,
    memory_allocation: IDL.Nat,
    freezing_threshold: IDL.Nat
  })
  const CanisterStatus = IDL.Record({
    status: Status,
    settings: DefiniteCanisterSettings,
    module_hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
    memory_size: IDL.Nat,
    cycles: IDL.Nat,
    idle_cycles_burned_per_day: IDL.Nat
  })

  return IDL.Service({
    canister_status: IDL.Func([IDL.Record({ canister_id: IDL.Principal })], [CanisterStatus], [])
  })
}

export const createManagementActor = async (identity: Identity): Promise<ManagementActor> => {
  const agent = new HttpAgent({
    host: IC_HOST,
    identity
  })

  if (!isMainnetHost(IC_HOST)) {
    await agent.fetchRootKey()
  }

  return Actor.createActor<ManagementActor>(managementIdlFactory, {
    agent,
    canisterId: 'aaaaa-aa'
  })
}
