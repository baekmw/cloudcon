import * as React from 'react'
import { cn } from '../../lib/utils'

const Input = React.forwardRef(({ className, type = 'text', ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-11 w-full rounded-xl border border-[var(--theme-light)] bg-[var(--theme-white)] px-3.5 py-2 text-[15px] text-[var(--theme-dark)] placeholder:text-[var(--theme-mid)] transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:border-[var(--theme-dark)] focus-visible:ring-4 focus-visible:ring-[#2b2b2b]/10 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = 'Input'

export { Input }
