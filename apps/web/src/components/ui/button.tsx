import { Button as BaseButton } from '@base-ui/react/button'
import type { ButtonHTMLAttributes } from 'react'

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'accent' | 'ghost' | 'danger' }) {
  const tone = variant === 'primary' ? 'btn' : `btn btn-${variant}`
  return <BaseButton className={[tone, className].filter(Boolean).join(' ')} {...props} />
}
