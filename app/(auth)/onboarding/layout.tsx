import { OnboardingProgress } from './_progress'

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <OnboardingProgress />
      {children}
    </div>
  )
}
