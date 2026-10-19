import type { ReactNode } from 'react'

export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <small className="error">{error}</small> : null}
    </label>
  )
}
