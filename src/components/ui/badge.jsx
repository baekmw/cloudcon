import * as React from 'react'
import { cn } from '../../lib/utils'

const badgeVariants = {
  default: 'bg-[#3182f6] text-white',
  secondary: 'bg-[#f2f4f6] text-[#4e5968]',
  outline: 'border border-[#e5e8eb] text-[#4e5968]',
  success: 'bg-[#e8faf3] text-[#03b26c] font-semibold',
  amber: 'bg-[#fff8e6] text-[#b86e00] font-semibold',
  destructive: 'bg-[#fff0f1] text-[#f04452] font-semibold',
}

function Badge({ className, variant = 'default', ...props }) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md px-2.5 py-0.5 text-[12px] font-medium transition-colors',
        badgeVariants[variant] || badgeVariants.default,
        className
      )}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
