import { UTM_KEYS, type UtmParams } from '@sharry/shared'
import { Field } from './ui/field.tsx'
import { Input } from './ui/input.tsx'

export function UtmFields({ utm, onChange }: { utm: UtmParams; onChange: (utm: UtmParams) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {UTM_KEYS.map((key) => (
        <Field key={key} label={key}>
          <Input value={utm[key] ?? ''} onChange={(event) => onChange({ ...utm, [key]: event.target.value })} />
        </Field>
      ))}
    </div>
  )
}

export function utmSummary(utm: UtmParams): string {
  const parts = UTM_KEYS.flatMap((key) => {
    const value = utm[key]
    return typeof value === 'string' && value.trim() ? [`${key}=${value.trim()}`] : []
  })
  return parts.length > 0 ? parts.join(', ') : 'Inherits the link’s UTM values'
}
