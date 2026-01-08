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

export type LauncherActor = {
  get_price: () => Promise<bigint>
  deploy_instance: (payload: string, vectorDim: bigint) => Promise<string>
  list_instance: () => Promise<LauncherState[]>
  update_instance: (instance_pid_str: string) => Promise<void>
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

  return IDL.Service({
    get_price: IDL.Func([], [IDL.Nat], ['query']),
    deploy_instance: IDL.Func([IDL.Text, IDL.Nat], [IDL.Text], []),
    list_instance: IDL.Func([], [IDL.Vec(State)], []),
    update_instance: IDL.Func([IDL.Text], [], [])
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
  return actor.deploy_instance(payload, DEFAULT_VECTOR_DIM)
}
