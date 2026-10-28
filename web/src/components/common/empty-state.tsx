import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type EmptyStateProps = {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

const EmptyState = ({ icon, title, description, action, className }: EmptyStateProps) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center',
        className
      )}
    >
      {icon ? (
        <div className='flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5'>
          {icon}
        </div>
      ) : null}
      <div className='space-y-1'>
        <div className='text-sm font-medium'>{title}</div>
        {description ? <div className='mx-auto max-w-sm text-sm text-muted-foreground'>{description}</div> : null}
      </div>
      {action ? <div className='mt-1'>{action}</div> : null}
    </div>
  )
}

export default EmptyState
