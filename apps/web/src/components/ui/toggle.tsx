import { useI18n } from "../../i18n/index.tsx";
import { Label } from "./label.tsx";
import { Switch } from "./switch.tsx";

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Label className="w-fit">
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
      <span>{t(label)}</span>
    </Label>
  );
}
