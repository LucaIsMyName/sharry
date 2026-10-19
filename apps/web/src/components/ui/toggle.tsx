import { Label } from './label.tsx'
import { Switch } from './switch.tsx'

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <Label className="w-fit">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span>{label}</span>
    </Label>
  )
}
