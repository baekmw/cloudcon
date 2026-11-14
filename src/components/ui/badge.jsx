import * as React from 'react'
import { cn } from '../../lib/utils'

const badgeVariants = {
  default: 'bg-[var(--theme-dark)] text-[var(--theme-white)]',
  secondary: 'bg-[var(--bg-subtle)] text-[var(--theme-mid)] border border-[var(--theme-light)]/70',
  outline: 'border border-[var(--theme-light)] text-[var(--text-secondary)]',
  success: 'bg-[var(--theme-dark)] text-[var(--theme-white)] font-semibold',
  amber: 'bg-[var(--theme-light)]/55 text-[var(--theme-dark)] font-semibold',
  destructive: 'bg-[var(--theme-dark)] text-[var(--theme-white)] font-semibold',
}

function Badge({ className, variant = 'default', ...props }) {
  return (
    <div
      className={cn(
        'inline-flex items-center whitespace-nowrap shrink-0 rounded-md px-2.5 py-0.5 text-[12px] font-medium transition-colors',
        badgeVariants[variant] || badgeVariants.default,
        className
      )}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
