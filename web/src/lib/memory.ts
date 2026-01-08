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
}

const memoryIdlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  return IDL.Service({
    insert: IDL.Func([IDL.Vec(IDL.Float32), IDL.Text], [IDL.Nat32], []),
    search: IDL.Func([IDL.Vec(IDL.Float32)], [IDL.Vec(IDL.Tuple(IDL.Float32, IDL.Text))], ['query']),
    add_new_user: IDL.Func([IDL.Principal, IDL.Nat8], [], [])
  })
}

export const createMemoryActor = async (identity: Identity, canisterId: string): Promise<MemoryActor> => {
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
