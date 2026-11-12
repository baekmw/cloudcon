import * as React from 'react'
import { cn } from '../../lib/utils'

const buttonVariants = {
  variant: {
    default: 'bg-[#3182f6] text-white hover:bg-[#1b64da] shadow-sm',
    destructive: 'bg-[#f04452] text-white hover:bg-[#d93442] shadow-sm',
    outline: 'border border-[#e5e8eb] bg-white text-[#333d4b] hover:bg-[#f2f4f6]',
    secondary: 'bg-[#f2f4f6] text-[#333d4b] hover:bg-[#e5e8eb]',
    ghost: 'hover:bg-[#f2f4f6] text-[#4e5968] hover:text-[#191f28]',
    link: 'text-[#3182f6] underline-offset-4 hover:underline',
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
