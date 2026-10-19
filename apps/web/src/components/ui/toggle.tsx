import { Switch } from '@base-ui/react/switch'

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
