import { cn } from '@/lib/utils'

// The Kinic "K": four pink bars plus amber/cyan/amber/orange chevrons.
const KinicMark = ({ className }: { className?: string }) => {
  return (
    <svg viewBox='0 0 100 100' className={cn('size-6', className)} aria-hidden>
      <g strokeWidth='4.6' fill='none' strokeLinecap='butt'>
        <path d='M15 10v80M24 10v80M33 10v80' stroke='#EC1C79' />
        <path d='M42 10v28M42 62v28' stroke='#EC1C79' />
        <path d='M62 10 41 50l21 40' stroke='#FBAE2B' />
        <path d='M72 10 51 50l21 40' stroke='#27A9E1' />
        <path d='M82 10 61 50l21 40' stroke='#FBAE2B' />
        <path d='M92 10 71 50l21 40' stroke='#F15A24' />
      </g>
    </svg>
  )
}

export default KinicMark
