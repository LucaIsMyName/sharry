import type { ReactNode } from 'react'
import { Label } from './label.tsx'

export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <Label className="grid w-full items-start gap-1.5">
      <span>{label}</span>
      {children}
      {error ? <small className="text-sm font-normal text-destructive">{error}</small> : null}
    </Label>
  )
}
