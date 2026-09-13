export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-gradient-to-b from-brown-100 to-background px-4 py-8">
      <div className="w-full max-w-[480px] rounded-lg border border-border-default bg-surface p-8 shadow-sm">
        {children}
      </div>
    </div>
  )
}
