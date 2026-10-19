import { Select as SelectRoot, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select.tsx'

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
    <SelectRoot
      value={value === '' ? null : value}
      items={options.map((option) => ({ value: option.value, label: option.label }))}
      onValueChange={(next) => {
        if (typeof next === 'string') onValueChange(next as T)
      }}
    >
      <SelectTrigger className="h-10 w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} sideOffset={6} className="max-w-md">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="items-start py-2">
            <span>{option.label}</span>
            {option.description ? <span className="text-xs font-normal whitespace-normal text-muted-foreground">{option.description}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  )
}
