function FieldError({ children }: { children?: string }) {
  if (!children) return null
  return (
    <p role="alert" aria-live="polite" className="text-sm text-danger">
      {children}
    </p>
  )
}

export { FieldError }
