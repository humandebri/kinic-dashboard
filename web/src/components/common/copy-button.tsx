import { CheckIcon, CopyIcon } from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'

import { cn } from '@/lib/utils'

type CopyButtonProps = {
  value: string
  label?: string
  className?: string
}

const CopyButton = ({ value, label = 'Copy', className }: CopyButtonProps) => {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    void navigator.clipboard.writeText(value).then(() => setCopied(true))
  }

  return (
    <button
      type='button'
      onClick={handleClick}
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
    >
      {copied ? <CheckIcon className='size-3.5 text-success' /> : <CopyIcon className='size-3.5' />}
    </button>
  )
}

export default CopyButton
