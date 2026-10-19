import { Select as BaseSelect } from '@base-ui/react/select'

export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder = 'Choose',
}: {
  value: T
  onValueChange: (value: T) => void
  options: { value: T; label: string; description?: string }[]
  placeholder?: string
}) {
  return (
    <BaseSelect.Root
      value={value === '' ? null : value}
      items={options.map((option) => ({ value: option.value, label: option.label }))}
      onValueChange={(next) => {
        if (typeof next === 'string') onValueChange(next as T)
      }}
    >
      <BaseSelect.Trigger className="select-trigger">
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon className="select-icon" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6.5 8 10.5 12 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="select-positioner" alignItemWithTrigger={false} sideOffset={6}>
          <BaseSelect.Popup className="select-popup">
            <BaseSelect.List className="select-list">
              {options.map((option) => (
                <BaseSelect.Item key={option.value} className="select-item" value={option.value}>
                  <span className="select-item-copy">
                    <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                    {option.description ? <span className="select-item-desc">{option.description}</span> : null}
                  </span>
                  <BaseSelect.ItemIndicator className="select-check" aria-hidden>✓</BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}
