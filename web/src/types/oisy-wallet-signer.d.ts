export type OisyAccount = {
  principal: string
  subaccount?: Uint8Array | null
}

export type OisyCallCanisterParams = {
  canisterId: string
  methodName: string
  arg: Uint8Array
}

export class OisyRelyingParty {
  static connect(args: { url: string; host?: string }): Promise<OisyRelyingParty>
  requestPermissionsNotGranted(): Promise<void>
  accounts(): Promise<OisyAccount[]>
  callCanister(params: OisyCallCanisterParams): Promise<Uint8Array>
}
