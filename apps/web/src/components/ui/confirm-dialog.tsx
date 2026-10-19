import { Dialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import { Button } from './button.tsx'

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
