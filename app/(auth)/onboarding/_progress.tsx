'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

const STEPS = [
  { path: '/onboarding/profile', label: 'プロフィール' },
  { path: '/onboarding/area', label: 'エリア' },
  { path: '/onboarding/interests', label: '気分' },
] as const

export function OnboardingProgress() {
  const pathname = usePathname()
  const currentIndex = STEPS.findIndex((step) => step.path === pathname)

  return (
    <div className="mb-6">
      <p className="mb-2 text-sm text-muted-foreground">
        準備 ({Math.max(currentIndex, 0) + 1}/{STEPS.length})
      </p>
      <div className="flex gap-2">
        {STEPS.map((step, index) => (
          <div
            key={step.path}
            aria-hidden="true"
            className={cn(
              'h-2 flex-1 rounded-full',
              index <= currentIndex ? 'bg-primary' : 'bg-muted',
            )}
          />
        ))}
      </div>
    </div>
  )
}
