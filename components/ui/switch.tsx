import { Switch as SwitchPrimitive } from 'radix-ui'
import type * as React from 'react'

import { cn } from '@/lib/utils/cn'

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent shadow-xs outline-none transition-colors',
        'focus-visible:ring-[3px] focus-visible:ring-ring-focus',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-surface shadow-xs ring-0 transition-transform',
          'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-1',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
