import { Button as BaseButton } from '@base-ui/react/button'
import { Dialog } from '@base-ui/react/dialog'
import { Switch } from '@base-ui/react/switch'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'accent' | 'ghost' | 'danger' }) {
  const tone = variant === 'primary' ? 'btn' : `btn btn-${variant}`
  return <BaseButton className={[tone, className].filter(Boolean).join(' ')} {...props} />
}

export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <small className="error">{error}</small> : null}
    </label>
  )
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onOpenChange,
  children,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
  children?: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog">
          <Dialog.Title className="brand" style={{ fontSize: 32 }}>{title}</Dialog.Title>
          <Dialog.Description className="lede">{description}</Dialog.Description>
          {children}
          <div className="btn-row">
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="accent" type="button" onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="row">
      <Switch.Root checked={checked} onCheckedChange={onChange} className="switch">
        <Switch.Thumb className="switch-thumb" />
      </Switch.Root>
      <span>{label}</span>
    </label>
  )
}

export async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value)
}
