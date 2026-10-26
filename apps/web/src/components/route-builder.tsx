import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  MAX_ROUTING_CONDITIONS,
  MAX_ROUTING_RULES,
  ROUTING_FIELDS,
  ROUTING_FIELD_LABELS,
  ROUTING_OPERATORS,
  ROUTING_OPERATOR_LABELS,
  conditionForField,
  emptyRoutingChoices,
  firstRoutingValue,
  isOpenRoutingField,
  isRoutingField,
  isRoutingOperator,
  routeHasUnrecognizedValue,
  routingCatalog,
  type RoutingChoices,
  type RoutingCondition,
  type RoutingField,
  type RoutingOperator,
  type RoutingRule,
  type UtmParams,
} from "@sharry/shared";
import { Button } from "./ui/button.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Select } from "./ui/choice-select.tsx";
import { Field } from "./ui/field.tsx";
import { Input } from "./ui/input.tsx";
import { useI18n } from "../i18n/index.tsx";

const CUSTOM = "__custom__";

export function RouteBuilder({
  rules,
  choices,
  utm,
  locale,
  onChange,
}: {
  rules: RoutingRule[];
  choices: RoutingChoices | undefined;
  utm: UtmParams;
  locale: string;
  onChange: (rules: RoutingRule[]) => void;
}) {
  const { t } = useI18n();
  const merged = mergeChoices(choices, utm);
  function updateRule(id: string, next: RoutingRule) {
    onChange(rules.map((rule) => (rule.id === id ? next : rule)));
  }

  return (
    <div className="grid gap-3 border-t border-border pt-3">
      <h2 className="text-lg font-medium">{t("Routes")}</h2>
      <p className="text-sm text-muted-foreground">
        {rules.length === 0
          ? t("Visitors use the destination unless a route matches.")
          : t(
              "Routes run from top to bottom. The first route whose conditions all match is used. Otherwise visitors go to the destination, including when a route is out of date.",
            )}
      </p>
      {rules.map((rule, index) => (
        <RouteCard
          key={rule.id}
          rule={rule}
          index={index}
          total={rules.length}
          choices={merged}
          locale={locale}
          onChange={(next) => updateRule(rule.id, next)}
          onMove={(direction) => onChange(moveRule(rules, index, direction))}
          onRemove={() => onChange(rules.filter((item) => item.id !== rule.id))}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={rules.length >= MAX_ROUTING_RULES}
        onClick={() =>
          onChange([
            ...rules,
            {
              id: crypto.randomUUID(),
              destinationUrl: "",
              conditions: [conditionForField("browser", merged, locale)],
            },
          ])
        }
      >
        <Plus /> {t("Add route")}
      </Button>
    </div>
  );
}

function RouteCard({
  rule,
  index,
  total,
  choices,
  locale,
  onChange,
  onMove,
  onRemove,
}: {
  rule: RoutingRule;
  index: number;
  total: number;
  choices: RoutingChoices;
  locale: string;
  onChange: (rule: RoutingRule) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("Route {number}", { number: index + 1 })}</h3>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon-sm" aria-label={t("Move route up")} disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronUp />
          </Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label={t("Move route down")} disabled={index === total - 1} onClick={() => onMove(1)}>
            <ChevronDown />
          </Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label={t("Remove route")} onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      </div>
      <Field label="Destination">
        <Input
          value={rule.destinationUrl}
          required
          onChange={(event) => onChange({ ...rule, destinationUrl: event.target.value })}
        />
      </Field>
      {rule.conditions.map((condition, conditionIndex) => (
        <ConditionRow
          key={`${rule.id}-${conditionIndex}`}
          condition={condition}
          choices={choices}
          locale={locale}
          canRemove={rule.conditions.length > 1}
          onChange={(next) => onChange({ ...rule, conditions: replaceAt(rule.conditions, conditionIndex, next) })}
          onRemove={() => onChange({ ...rule, conditions: rule.conditions.filter((_, item) => item !== conditionIndex) })}
        />
      ))}
      {routeHasUnrecognizedValue(rule) ? (
        <p className="text-sm text-destructive">
          {t("This value is no longer recognized. Visitors use the destination until you update this route.")}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={rule.conditions.length >= MAX_ROUTING_CONDITIONS}
        onClick={() => onChange({ ...rule, conditions: [...rule.conditions, conditionForField("browser", choices, locale)] })}
      >
        <Plus /> {t("Add condition")}
      </Button>
    </div>
  );
}

function ConditionRow({
  condition,
  choices,
  locale,
  canRemove,
  onChange,
  onRemove,
}: {
  condition: RoutingCondition;
  choices: RoutingChoices;
  locale: string;
  canRemove: boolean;
  onChange: (condition: RoutingCondition) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  const field = isRoutingField(condition.field) ? condition.field : null;
  const operator = isRoutingOperator(condition.operator) ? condition.operator : null;
  const fieldOptions = [
    ...ROUTING_FIELDS.map((item) => ({ value: item, label: ROUTING_FIELD_LABELS[item] })),
    ...(field ? [] : [{ value: condition.field, label: condition.field }]),
  ];
  const operatorOptions = [
    ...ROUTING_OPERATORS.map((item) => ({ value: item, label: ROUTING_OPERATOR_LABELS[item] })),
    ...(operator ? [] : [{ value: condition.operator, label: condition.operator }]),
  ];

  function changeField(next: string) {
    if (!isRoutingField(next)) return;
    setDraft(null);
    onChange(conditionForField(next, choices, locale));
  }

  function changeOperator(next: string) {
    if (!isRoutingOperator(next) || !field) {
      onChange({ ...condition, operator: next });
      return;
    }
    setDraft(null);
    const fallback = firstRoutingValue(field, choices, locale);
    if (next === "any_of") {
      onChange({ ...condition, operator: next, values: condition.values.length > 0 ? condition.values : fallback ? [fallback] : [] });
      return;
    }
    const single = condition.values[0] ?? fallback ?? "";
    onChange({ ...condition, operator: next, values: single ? [single] : [] });
  }

  return (
    <div className="flex items-start gap-2">
      <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-3">
        <Select value={condition.field} options={fieldOptions} onValueChange={changeField} />
        <Select value={condition.operator} options={operatorOptions} onValueChange={changeOperator} />
        {operator === "any_of" && field ? (
          <ValueChecks
            field={field}
            values={condition.values}
            choices={choices}
            locale={locale}
            onChange={(values) => onChange({ ...condition, values })}
          />
        ) : (
          <SingleValue
            field={field}
            values={condition.values}
            choices={choices}
            locale={locale}
            draft={draft}
            onDraft={setDraft}
            onChange={(values) => onChange({ ...condition, values })}
          />
        )}
      </div>
      <Button type="button" variant="outline" size="icon-sm" aria-label={t("Remove condition")} disabled={!canRemove} onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  );
}

function SingleValue({
  field,
  values,
  choices,
  locale,
  draft,
  onDraft,
  onChange,
}: {
  field: RoutingField | null;
  values: string[];
  choices: RoutingChoices;
  locale: string;
  draft: string | null;
  onDraft: (draft: string | null) => void;
  onChange: (values: string[]) => void;
}) {
  const { t } = useI18n();
  const options = field ? valueOptions(field, values, choices, locale, true) : values.map((value) => ({ value, label: value }));
  const selected = values[0] ?? "";
  if (draft !== null || (field && isOpenRoutingField(field) && !selected && options.every((option) => option.value === CUSTOM))) {
    return (
      <Input
        value={draft ?? ""}
        placeholder={t("Enter a value")}
        aria-label={t("Enter a value")}
        onChange={(event) => onDraft(event.target.value)}
        onBlur={() => commitDraft(draft ?? "", onChange, onDraft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitDraft(draft ?? "", onChange, onDraft);
          }
        }}
      />
    );
  }
  return (
    <Select
      value={selected}
      options={options}
      onValueChange={(next) => {
        if (next === CUSTOM) {
          onDraft("");
          return;
        }
        onChange([next]);
      }}
    />
  );
}

function ValueChecks({
  field,
  values,
  choices,
  locale,
  onChange,
}: {
  field: RoutingField;
  values: string[];
  choices: RoutingChoices;
  locale: string;
  onChange: (values: string[]) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const options = valueOptions(field, values, choices, locale, false);
  return (
    <div className="grid max-h-48 gap-2 overflow-auto rounded-md border border-border p-2 md:col-span-3">
      {options.map((option) => {
        const checked = values.some((value) => value.toLowerCase() === option.value.toLowerCase());
        return (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={checked}
              onCheckedChange={(next) => {
                const on = next === true;
                if (!on && values.length === 1) return;
                const without = values.filter((value) => value.toLowerCase() !== option.value.toLowerCase());
                onChange(on ? [...without, option.value] : without);
              }}
            />
            {t(option.label)}
          </label>
        );
      })}
      {isOpenRoutingField(field) ? (
        <div className="flex gap-2">
          <Input
            value={draft}
            placeholder={t("Custom…")}
            aria-label={t("Custom…")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              const value = draft.trim();
              if (!value || values.some((item) => item.toLowerCase() === value.toLowerCase())) return;
              onChange([...values, value]);
              setDraft("");
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function valueOptions(
  field: RoutingField,
  selected: string[],
  choices: RoutingChoices,
  locale: string,
  includeCustom: boolean,
) {
  if (isOpenRoutingField(field)) {
    const values = unique([...(choices[field] ?? []), ...selected]);
    const options = values.map((value) => ({ value, label: value }));
    return includeCustom ? [...options, { value: CUSTOM, label: "Custom…" }] : options;
  }
  const catalog = routingCatalog(field, locale).map((option) => ({ value: option.id, label: option.label }));
  const known = new Set(catalog.map((option) => option.value.toLowerCase()));
  const stale = selected.filter((value) => value.trim() && !known.has(value.trim().toLowerCase()));
  return [...catalog, ...stale.map((value) => ({ value, label: value }))];
}

function commitDraft(draft: string, onChange: (values: string[]) => void, onDraft: (draft: string | null) => void) {
  const value = draft.trim();
  onDraft(null);
  if (value && value !== CUSTOM) onChange([value]);
}

function mergeChoices(choices: RoutingChoices | undefined, utm: UtmParams): RoutingChoices {
  const base = choices ?? emptyRoutingChoices();
  return {
    utm_campaign: unique([base.utm_campaign, utm.utm_campaign]),
    utm_id: unique([base.utm_id, utm.utm_id]),
    utm_term: unique([base.utm_term, utm.utm_term]),
    utm_content: unique([base.utm_content, utm.utm_content]),
  };
}

function unique(groups: Array<string | null | undefined | string[]>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const group of groups) {
    const values = Array.isArray(group) ? group : [group];
    for (const value of values) {
      const trimmed = value?.trim();
      if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
      seen.add(trimmed.toLowerCase());
      result.push(trimmed);
    }
  }
  return result;
}

function replaceAt<T>(items: T[], index: number, next: T): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? next : item));
}

function moveRule(rules: RoutingRule[], index: number, direction: -1 | 1): RoutingRule[] {
  const target = index + direction;
  if (target < 0 || target >= rules.length) return rules;
  const next = [...rules];
  const [moved] = next.splice(index, 1);
  if (!moved) return rules;
  next.splice(target, 0, moved);
  return next;
}
