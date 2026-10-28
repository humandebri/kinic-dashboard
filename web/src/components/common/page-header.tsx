import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
}

const PageHeader = ({ title, description, eyebrow, actions }: PageHeaderProps) => {
  return (
    <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
      <div className='min-w-0 space-y-1'>
        {eyebrow ? <div className='text-xs font-medium text-muted-foreground'>{eyebrow}</div> : null}
        <h1 className='truncate text-2xl font-semibold tracking-tight'>{title}</h1>
        {description ? <p className='max-w-2xl text-sm text-muted-foreground'>{description}</p> : null}
      </div>
      {actions ? <div className='flex shrink-0 flex-wrap items-center gap-2'>{actions}</div> : null}
    </div>
  )
}

export default PageHeader
