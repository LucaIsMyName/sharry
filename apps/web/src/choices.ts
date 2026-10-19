export const redirectOptions = [
  { value: '302', label: '302 · Temporary', description: 'Visitors come back through the short URL next time. This is the usual choice.' },
  { value: '301', label: '301 · Permanent', description: 'Browsers and search engines may remember the destination and skip the short URL later.' },
  { value: '307', label: '307 · Temporary, method kept', description: 'Temporary, and the original request method is kept. A form submission stays a form submission.' },
  { value: '308', label: '308 · Permanent, method kept', description: 'Permanent, and the original request method is kept.' },
] as const

export const correctionOptions = [
  { value: 'L', label: 'L · Low', description: 'Recovers about 7% of the code if it is covered or damaged. Least room for a center image.' },
  { value: 'M', label: 'M · Medium', description: 'Recovers about 15% of the code if it is covered or damaged.' },
  { value: 'Q', label: 'Q · Quartile', description: 'Recovers about 25% of the code if it is covered or damaged.' },
  { value: 'H', label: 'H · High', description: 'Recovers about 30% of the code. Use this when a center image covers part of the pattern.' },
] as const

export function choiceNote<T extends string>(options: readonly { value: T; description?: string }[], value: T): string {
  return options.find((option) => option.value === value)?.description ?? ''
}
