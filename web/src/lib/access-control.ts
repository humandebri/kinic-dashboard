// Where: Shared role definitions for memory access control.
// What: Maps between role labels and numeric codes used by canisters.
// Why: Keeps role handling consistent across UI and stores.
export type RoleOption = 'admin' | 'writer' | 'reader'

export const roleValueMap: Record<RoleOption, number> = {
  admin: 1,
  writer: 2,
  reader: 3
}

export const roleLabelMap: Record<number, string> = {
  1: 'admin',
  2: 'writer',
  3: 'reader'
}

export const roleOptionFromValue = (roleValue: number): RoleOption => {
  if (roleValue === roleValueMap.admin) return 'admin'
  if (roleValue === roleValueMap.writer) return 'writer'
  return 'reader'
}

export const isRoleOption = (value: string): value is RoleOption => {
  return value === 'admin' || value === 'writer' || value === 'reader'
}
