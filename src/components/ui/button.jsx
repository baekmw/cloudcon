import * as React from 'react'
import { cn } from '../../lib/utils'

const buttonVariants = {
  variant: {
    default:
      'bg-[var(--theme-dark)] text-[var(--theme-white)] hover:bg-[var(--accent-hover)] shadow-xs',
    destructive:
      'bg-[var(--theme-dark)] text-[var(--theme-white)] hover:bg-[var(--accent-hover)] shadow-xs',
    outline:
      'border border-[var(--theme-light)] bg-[var(--theme-white)] text-[var(--theme-dark)] hover:bg-[var(--bg-subtle)] hover:border-[var(--theme-dark)]',
    secondary:
      'bg-[var(--bg-subtle)] text-[var(--theme-dark)] hover:bg-[var(--theme-light)]/50',
    ghost:
      'hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--theme-dark)]',
    link: 'text-[var(--theme-dark)] underline-offset-4 hover:underline',
  },
  size: {
    default: 'h-11 px-4 py-2 text-[14px]',
    sm: 'h-9 rounded-lg px-3 text-[13px]',
    lg: 'h-13 rounded-2xl px-6 text-[16px] font-semibold',
    icon: 'h-10 w-10',
  },
}

const Button = React.forwardRef(
  ({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) => {
    return (
      <button
        type={type}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
          buttonVariants.variant[variant] || buttonVariants.variant.default,
          buttonVariants.size[size] || buttonVariants.size.default,
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
