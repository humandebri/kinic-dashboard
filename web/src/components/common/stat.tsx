import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type StatProps = {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  className?: string
}

const Stat = ({ label, value, hint, className }: StatProps) => {
  return (
    <div className={cn('rounded-xl border bg-card px-4 py-3', className)}>
      <div className='text-xs font-medium text-muted-foreground'>{label}</div>
      <div className='mt-1 truncate font-mono text-lg font-semibold tabular-nums tracking-tight'>{value}</div>
      {hint ? <div className='mt-0.5 text-xs text-muted-foreground'>{hint}</div> : null}
    </div>
  )
}

export default Stat
