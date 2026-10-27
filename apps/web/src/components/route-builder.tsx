import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  MAX_ROUTING_CONDITIONS,
  MAX_ROUTING_RULES,
  MAX_ROUTING_VALUES,
  ROUTING_FIELDS,
  ROUTING_FIELD_LABELS,
  ROUTING_OPERATORS,
  ROUTING_OPERATOR_LABELS,
  allowsCustomRoutingValue,
  canonicalRoutingValue,
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
  type RoutingRule,
  type UtmParams,
} from "@sharry/shared";
import { Button } from "./ui/button.tsx";
import { cardBevel } from "./ui/card.tsx";
import { Select } from "./ui/choice-select.tsx";
import { Field } from "./ui/field.tsx";
import { Input } from "./ui/input.tsx";
import { useI18n } from "../i18n/index.tsx";

export function RouteBuilder({
  rules,
  choices,
  utm,
  locale,
  onChange,
  leading,
}: {
  rules: RoutingRule[];
  choices: RoutingChoices | undefined;
  utm: UtmParams;
  locale: string;
  onChange: (rules: RoutingRule[]) => void;
  leading?: ReactNode;
}) {
  const { t } = useI18n();
  const merged = mergeChoices(choices, utm);
  function updateRule(id: string, next: RoutingRule) {
    onChange(rules.map((rule) => (rule.id === id ? next : rule)));
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {leading}
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
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
        <Input
          value={rule.name ?? ""}
          placeholder={t("Route {number}", { number: index + 1 })}
          aria-label={t("Route name")}
          maxLength={80}
          className="h-8 max-w-sm border-transparent bg-transparent px-2 font-medium shadow-none focus-visible:border-ring"
          onChange={(event) => onChange({ ...rule, name: event.target.value })}
        />
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
    onChange(conditionForField(next, choices, locale));
  }

  function changeOperator(next: string) {
    if (!isRoutingOperator(next) || !field) {
      onChange({ ...condition, operator: next });
      return;
    }
    const fallback = firstRoutingValue(field, choices, locale);
    onChange({
      ...condition,
      operator: next,
      values: condition.values.length > 0 ? condition.values : fallback ? [fallback] : [],
    });
  }

  return (
    <div className="flex items-start gap-2">
      <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-3">
        <Select value={condition.field} options={fieldOptions} onValueChange={changeField} />
        <Select value={condition.operator} options={operatorOptions} onValueChange={changeOperator} />
        <MultiValue
          field={field}
          values={condition.values}
          choices={choices}
          locale={locale}
          onChange={(values) => onChange({ ...condition, values })}
        />
      </div>
      <Button type="button" variant="outline" size="icon-sm" aria-label={t("Remove condition")} disabled={!canRemove} onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  );
}

function MultiValue({
  field,
  values,
  choices,
  locale,
  onChange,
}: {
  field: RoutingField | null;
  values: string[];
  choices: RoutingChoices;
  locale: string;
  onChange: (values: string[]) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");
  const rootRef = useRef<HTMLDivElement>(null);
  const options = field ? valueOptions(field, values, choices, locale) : values.map((value) => ({ value, label: value }));
  const shown = options.filter((option) => t(option.label).toLowerCase().includes(filter.trim().toLowerCase()));
  const summary = values
    .map((value) => {
      const option = options.find((item) => item.value.toLowerCase() === value.toLowerCase());
      return option ? t(option.label) : value;
    })
    .join(", ");

  useEffect(() => {
    if (!query.trim()) {
      setFilter("");
      return;
    }
    const timer = setTimeout(() => setFilter(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function closeMenu() {
    setOpen(false);
    setQuery("");
    setFilter("");
  }

  function toggle(value: string) {
    const selected = values.some((item) => item.toLowerCase() === value.toLowerCase());
    if (selected) {
      if (values.length === 1) return;
      onChange(values.filter((item) => item.toLowerCase() !== value.toLowerCase()));
      return;
    }
    if (values.length >= MAX_ROUTING_VALUES) return;
    onChange([...values, value]);
  }

  function setDraftValue(value: string) {
    draftRef.current = value;
    setDraft(value);
  }

  function addCustom() {
    const raw = draftRef.current.trim();
    setDraftValue("");
    if (!field || !raw || values.length >= MAX_ROUTING_VALUES) return;
    const value = canonicalRoutingValue(field, raw);
    if (!value || values.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    onChange([...values, value]);
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={(event) => event.key === "Escape" && closeMenu()}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex h-10 w-full min-w-0 items-center justify-between gap-1.5 rounded-md border border-input bg-transparent py-2 pr-2 pl-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 ${cardBevel}`}
        onClick={() => (open ? closeMenu() : setOpen(true))}
      >
        <span className="truncate">{summary || t("Choose")}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <Input
            value={query}
            placeholder="Search"
            aria-label={t("Search")}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
            }}
          />
          <div role="listbox" aria-multiselectable="true" className="mt-1 max-h-48 overflow-auto">
            {shown.map((option) => {
              const selected = values.some((value) => value.toLowerCase() === option.value.toLowerCase());
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => toggle(option.value)}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input">
                    {selected ? <Check className="size-3.5" /> : null}
                  </span>
                  {t(option.label)}
                </button>
              );
            })}
          </div>
          {field && allowsCustomRoutingValue(field) ? (
            <Input
              value={draft}
              placeholder="Custom…"
              aria-label={t("Custom…")}
              className="mt-1"
              onChange={(event) => setDraftValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addCustom();
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function valueOptions(field: RoutingField, selected: string[], choices: RoutingChoices, locale: string) {
  if (isOpenRoutingField(field)) {
    return unique([...(choices[field] ?? []), ...selected]).map((value) => ({ value, label: value }));
  }
  const catalog = routingCatalog(field, locale).map((option) => ({ value: option.id, label: option.label }));
  const known = new Set(catalog.map((option) => option.value.toLowerCase()));
  const stale = selected.filter((value) => value.trim() && !known.has(value.trim().toLowerCase()));
  return [...catalog, ...stale.map((value) => ({ value, label: value }))];
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
