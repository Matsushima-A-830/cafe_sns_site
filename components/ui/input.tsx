import type * as React from 'react'

import { cn } from '@/lib/utils/cn'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full min-w-0 rounded-md border border-border-input bg-input px-3 py-2 text-base text-foreground shadow-xs outline-none transition-[color,box-shadow]',
        'placeholder:text-subtle',
        'focus-visible:border-ring-focus focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
