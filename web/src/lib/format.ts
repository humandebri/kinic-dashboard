// Where: Shared display formatters.
// What: Formats cycles, nat values, KINIC amounts, and principals for the UI.
// Why: The same formatting was duplicated across several pages.
export const KINIC_DECIMALS = 100_000_000n

export const formatScaled = (value: bigint | null, unit: string, scale: bigint, fractionDigits: number) => {
  if (value === null) return '—'
  const whole = value / scale
  const fraction = value % scale
  if (fraction === 0n) return `${whole.toString()}${unit}`
  const pad = fraction.toString().padStart(fractionDigits, '0')
  return `${whole.toString()}.${pad.slice(0, 2)}${unit}`
}

export const formatCycles = (value: bigint | null) => {
  if (value === null) return '—'
  return `${(Number(value) / 1e12).toFixed(2)}T`
}

export const formatNatBillions = (value: bigint | null) => formatScaled(value, 'B', 1_000_000_000n, 9)
export const formatNatMillions = (value: bigint | null) => formatScaled(value, 'M', 1_000_000n, 6)

export const formatBytes = (value: bigint | null) => {
  if (value === null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = Number(value)
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

// Exact base-unit → decimal string (no float rounding), trailing zeros trimmed.
export const formatKinic = (baseAmount: bigint): string => {
  const whole = baseAmount / KINIC_DECIMALS
  const fraction = (baseAmount % KINIC_DECIMALS).toString().padStart(8, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : `${whole}`
}

export const parseKinic = (rawValue: string): { value: bigint | null; error?: string } => {
  const trimmed = rawValue.trim()
  if (!trimmed) return { value: null, error: 'Amount is required.' }
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed)
  if (!match) return { value: null, error: 'Amount must be a positive number.' }
  const [, wholePart, fractionPart = ''] = match
  if (fractionPart.length > 8) return { value: null, error: 'Up to 8 decimal places are supported.' }
  const value = BigInt(wholePart) * KINIC_DECIMALS + BigInt(fractionPart.padEnd(8, '0'))
  if (value <= 0n) return { value: null, error: 'Amount must be greater than zero.' }
  return { value }
}

export const shortenPrincipal = (principalText: string | null, head = 5, tail = 3): string => {
  if (!principalText) return 'Not connected'
  if (principalText.length <= head + tail + 3) return principalText
  return `${principalText.slice(0, head)}…${principalText.slice(-tail)}`
}

export const parseNameMeta = (rawName: string | null) => {
  if (!rawName) return { name: null, description: null }
  const trimmed = rawName.trim()
  if (!trimmed.startsWith('{')) return { name: rawName, description: null }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed === 'object' && parsed !== null) {
      const nameValue = Reflect.get(parsed, 'name')
      const descriptionValue = Reflect.get(parsed, 'description')
      const name = typeof nameValue === 'string' ? nameValue : null
      const description = typeof descriptionValue === 'string' ? descriptionValue : null
      if (name || description) return { name: name ?? rawName, description }
    }
  } catch {
    // Fall back to raw name.
  }
  return { name: rawName, description: null }
}

export const isInvalidUserError = (message: string) =>
  message.includes('Invalid user') || message.includes('IC0406') || message.includes('invalid user')

const MAX_ERROR_CHARS = 280

// Agent errors embed the full HTTP response and certificate; surface only the reject text + code.
export const errorMessage = (error: unknown, fallback: string) => {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (!raw) return fallback
  const reject = /Reject text:\s*([\s\S]*?)(?=\s+(?:Error code:|Call context|HTTP details|Request ID:)|$)/i.exec(raw)
  const code = /Error code:\s*(\w+)/i.exec(raw)
  const text = reject ? `${reject[1]}${code ? ` (${code[1]})` : ''}` : raw
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > MAX_ERROR_CHARS ? `${compact.slice(0, MAX_ERROR_CHARS - 1)}…` : compact
}
