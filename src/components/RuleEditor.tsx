import { useState } from "react";
import { Plus, Settings2, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fieldMaxLength,
  fieldSpec,
  HEADER_FIELDS,
  LEG_FIELDS,
  SEGMENT_FIELDS,
  type HeaderField,
  type LegField,
  type SegmentField,
} from "@/ssim/types";
import { loadPresets, savePresets, type Preset } from "@/rules/presets";
import {
  HEADER_ACTION_FIELDS,
  HEADER_CONDITION_FIELDS,
  HEADER_CONDITION_OPS,
  LEG_ACTION_FIELDS,
  LEG_CONDITION_FIELDS,
  ROUTE_PAIR_RE,
  SEGMENT_ACTION_FIELDS,
  type ActionKind,
  type Condition,
  type ConditionOp,
  type FilterBy,
  type FilterDisposition,
  type FilterRule,
  type Rule,
  type RuleAction,
  type RuleTarget,
} from "@/rules/types";

const toOptions = <F extends string>(
  fields: F[],
  specs: Record<F, { label: string }>,
) => fields.map((f) => ({ value: f, label: specs[f].label }));

const TARGET_OPTIONS: { value: RuleTarget; label: string }[] = [
  { value: "leg", label: "Flight legs (Type 3)" },
  { value: "header", label: "Carrier header (Type 2)" },
  { value: "segment", label: "Segment data (Type 4)" },
  { value: "filter", label: "Leg filter (keep / remove)" },
];

function switchTarget(rule: Rule, target: RuleTarget): Rule {
  if (rule.target === target) return rule;
  const base = { id: rule.id, name: rule.name, enabled: rule.enabled };
  if (target === "header")
    return {
      ...base,
      target: "header",
      conditions: [{ field: "airline", op: "equals", value: "" }],
      actions: [],
    };
  if (target === "filter")
    return { ...base, target: "filter", disposition: "remove", filterBy: "route", values: [] };
  // segment rules match legs — only the actions differ
  return {
    ...base,
    target,
    conditions: [{ field: "depStation", op: "equals", value: "" }],
    actions: [],
  };
}

const DISPOSITION_OPTIONS: { value: FilterDisposition; label: string }[] = [
  { value: "remove", label: "Remove matching legs" },
  { value: "keep", label: "Keep only matching legs" },
];

const FILTER_BY_OPTIONS: { value: FilterBy; label: string }[] = [
  { value: "route", label: "Route (origin–destination)" },
  { value: "flightNumber", label: "Flight number" },
];

/** Split the comma-separated values input into a clean, de-duped, upper-cased list. */
const parseFilterValues = (text: string): string[] => [
  ...new Set(
    text
      .split(",")
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean),
  ),
];

const OP_OPTIONS: { value: ConditionOp; label: string }[] = [
  { value: "equals", label: "is" },
  { value: "notEquals", label: "is not" },
  { value: "oneOf", label: "is one of" },
  { value: "contains", label: "contains" },
  { value: "inDateRange", label: "period overlaps" },
  { value: "operatesOnDay", label: "operates on" },
  { value: "isBlank", label: "is blank" },
  { value: "isNotBlank", label: "is not blank" },
];

const VALUELESS_OPS = ["isBlank", "isNotBlank"];

const KIND_OPTIONS: { value: ActionKind; label: string }[] = [
  { value: "setValue", label: "set to" },
  { value: "replaceText", label: "replace text" },
];

const DAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
].map((label, i) => ({ value: String(i + 1), label }));

const VALUE_HINT: Record<ConditionOp | ActionKind, string> = {
  equals: "e.g. FCO",
  notEquals: "e.g. FCO",
  oneOf: "e.g. FCO, CIA, LIN",
  contains: "text",
  inDateRange: "01JAN26-31MAR26",
  operatesOnDay: "",
  isBlank: "",
  isNotBlank: "",
  setValue: "new value",
  replaceText: "old=>new",
};

function Picker<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(v) => onChange(v as T)}
    >
      <SelectTrigger size="sm" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Dropdown of maintained preset values, with a gear to manage the list. */
function PresetPicker({
  value,
  onChange,
  presets,
  onManage,
}: {
  value: string;
  onChange: (v: string) => void;
  presets: Preset[];
  onManage: () => void;
}) {
  // keep a value from an imported/older rule selectable even if not in the list
  const items =
    !value || presets.some((p) => p.value === value)
      ? presets
      : [{ value, label: value }, ...presets];
  const options = items.map((p) => ({
    value: p.value,
    label: p.value === p.label ? p.value : `${p.value} — ${p.label}`,
  }));
  return (
    <div className="flex flex-1 items-center gap-1">
      <Picker
        value={value}
        onChange={onChange}
        options={options}
        className="flex-1"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onManage}
        aria-label="Manage predefined values"
        title="Manage predefined values"
      >
        <Settings2 />
      </Button>
    </div>
  );
}

function PresetManager({
  presets,
  onChange,
  onClose,
}: {
  presets: Preset[];
  onChange: (presets: Preset[]) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");

  const add = () => {
    const v = code.trim().toUpperCase();
    if (!v || presets.some((p) => p.value === v)) return;
    onChange([...presets, { value: v, label: label.trim() || v }]);
    setCode("");
    setLabel("");
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Traffic restriction values</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {presets.length === 0 && (
            <p className="py-2 text-center text-sm text-muted-foreground">
              No predefined values yet.
            </p>
          )}
          {presets.map((p) => (
            <div
              key={p.value}
              className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
            >
              <span className="w-10 font-mono font-semibold">{p.value}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {p.label}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Delete ${p.value}`}
                onClick={() =>
                  onChange(presets.filter((x) => x.value !== p.value))
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <form
            className="mt-2 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code"
              className="h-7 w-20 font-mono text-sm"
              maxLength={fieldMaxLength(LEG_FIELDS.trafficRestriction)}
            />
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Description, e.g. Connecting Traffic Only"
              className="h-7 flex-1 text-sm"
            />
            <Button type="submit" variant="outline" size="sm" disabled={!code.trim()}>
              <Plus /> Add
            </Button>
          </form>
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

function validate(rule: Rule): string | null {
  if (rule.target === "filter") {
    if (rule.values.length === 0) return "Add at least one filter value.";
    if (rule.filterBy === "route") {
      const bad = rule.values.find((v) => !ROUTE_PAIR_RE.test(v));
      if (bad) return `"${bad}" isn't a valid route pair — use e.g. "JFK-LAX".`;
    }
    return null;
  }
  if (rule.actions.length === 0) return "Add at least one action.";
  for (const c of rule.conditions) {
    if (!c.value.trim() && !VALUELESS_OPS.includes(c.op))
      return "Every condition needs a value.";
  }
  for (const a of rule.actions) {
    if (a.kind === "setValue") {
      const spec = fieldSpec(rule.target, a.field);
      const max = fieldMaxLength(spec);
      if (a.value.trim().length > max)
        return `"${a.value.trim()}" doesn't fit ${spec.label} (max ${max} chars).`;
    }
    if (a.kind === "replaceText" && (!a.value.includes("=>") || !a.value.split("=>")[0]))
      return 'Replace text needs the form "old=>new" with a non-empty "old".';
    if (a.kind === "setValue" && !a.value.trim())
      return "Every action needs a value.";
  }
  return null;
}

/** Editor body for a filter rule: a disposition, a dimension, and one value list. */
function FilterBody({
  rule,
  valuesText,
  onValuesText,
  onFilter,
}: {
  rule: FilterRule;
  valuesText: string;
  onValuesText: (text: string) => void;
  onFilter: (patch: Partial<FilterRule>) => void;
}) {
  const isRoute = rule.filterBy === "route";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-sm text-muted-foreground">Action</span>
        <Picker
          value={rule.disposition}
          onChange={(disposition) => onFilter({ disposition })}
          options={DISPOSITION_OPTIONS}
          className="w-64"
        />
      </div>
      <p className="pl-1 text-sm text-muted-foreground">
        {rule.disposition === "remove"
          ? "Legs matching the filter below are removed from the exported file; all others are kept."
          : "Only legs matching the filter below are kept; every other leg is removed from the exported file."}
      </p>
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-sm text-muted-foreground">Filter by</span>
        <Picker
          value={rule.filterBy}
          onChange={(filterBy) => onFilter({ filterBy })}
          options={FILTER_BY_OPTIONS}
          className="w-64"
        />
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {isRoute ? "Route pairs" : "Flight numbers"}
        </h3>
        <Input
          className="h-8 font-mono text-sm"
          value={valuesText}
          onChange={(e) => onValuesText(e.target.value)}
          placeholder={isRoute ? "JFK-LAX, EWR-SFO" : "123, 456, 1408"}
        />
        <p className="pl-1 text-xs text-muted-foreground">
          {isRoute
            ? "Comma-separated origin–destination pairs, matched on each leg's departure and arrival stations."
            : "Comma-separated flight numbers, matched on each leg."}
        </p>
      </section>
    </div>
  );
}

export function RuleEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: Rule;
  onSave: (rule: Rule) => void;
  onClose: () => void;
}) {
  const [rule, setRule] = useState<Rule>(initial);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresetsState] = useState<Preset[]>(loadPresets);
  const [managingPresets, setManagingPresets] = useState(false);
  // Filter values are edited as free text so a trailing comma survives typing;
  // they are parsed into the rule's list on save.
  const [valuesText, setValuesText] = useState(
    initial.target === "filter" ? initial.values.join(", ") : "",
  );

  const setPresets = (next: Preset[]) => {
    setPresetsState(next);
    savePresets(next);
  };

  const usesPresets = (field: string, opOrKind: string) =>
    field === "trafficRestriction" &&
    ["equals", "notEquals", "setValue"].includes(opOrKind);

  const setFilter = (patch: Partial<FilterRule>) =>
    setRule((r) => (r.target === "filter" ? { ...r, ...patch } : r));

  // Field/op validity per target is enforced by the option lists the pickers
  // offer below, so a same-shape cast here is safe — TS can't otherwise
  // narrow a patch's field type against a union-typed `r` inside .map(). The
  // filter guard is unreachable from the UI (these run only for non-filter
  // rules) but keeps the union access well-typed.
  const setCondition = (i: number, patch: Partial<Condition<LegField | HeaderField>>) =>
    setRule((r) =>
      r.target === "filter"
        ? r
        : ({
            ...r,
            conditions: r.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)),
          } as Rule),
    );
  const setAction = (
    i: number,
    patch: Partial<RuleAction<LegField | HeaderField | SegmentField>>,
  ) =>
    setRule((r) =>
      r.target === "filter"
        ? r
        : ({
            ...r,
            actions: r.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)),
          } as Rule),
    );

  const conditionFieldOptions =
    rule.target === "header"
      ? toOptions(HEADER_CONDITION_FIELDS, HEADER_FIELDS)
      : toOptions(LEG_CONDITION_FIELDS, LEG_FIELDS);
  const actionFieldOptions =
    rule.target === "header"
      ? toOptions(HEADER_ACTION_FIELDS, HEADER_FIELDS)
      : rule.target === "segment"
        ? toOptions(SEGMENT_ACTION_FIELDS, SEGMENT_FIELDS)
        : toOptions(LEG_ACTION_FIELDS, LEG_FIELDS);
  const opOptions =
    rule.target === "header"
      ? OP_OPTIONS.filter((o) => HEADER_CONDITION_OPS.includes(o.value))
      : OP_OPTIONS;
  // a segment record doesn't exist until this rule creates it, so there is no
  // prior text to replace — only setValue makes sense
  const kindOptions =
    rule.target === "segment"
      ? KIND_OPTIONS.filter((o) => o.value === "setValue")
      : KIND_OPTIONS;

  const save = () => {
    const finalRule: Rule =
      rule.target === "filter"
        ? { ...rule, values: parseFilterValues(valuesText) }
        : rule;
    const problem = validate(finalRule);
    if (problem) return setError(problem);
    onSave({ ...finalRule, name: finalRule.name.trim() || "Untitled rule" });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initial.name ? "Edit rule" : "New rule"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Input
            value={rule.name}
            onChange={(e) => setRule({ ...rule, name: e.target.value })}
            placeholder="Rule name, e.g. Shift FCO departures +15"
            autoFocus
          />

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Applies to</span>
            <Picker
              value={rule.target}
              onChange={(target) => {
                if (target === "filter") setValuesText("");
                setRule((r) => switchTarget(r, target));
              }}
              options={TARGET_OPTIONS}
              className="w-56"
            />
          </div>

          {rule.target === "filter" ? (
            <FilterBody
              rule={rule}
              valuesText={valuesText}
              onValuesText={setValuesText}
              onFilter={setFilter}
            />
          ) : (
          <>
          <section className="flex flex-col gap-2">
            <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              If every condition matches
            </h3>
            {rule.conditions.length === 0 && (
              <p className="flex items-center gap-1.5 pl-1 text-sm text-amber-700 dark:text-amber-400">
                <TriangleAlert className="size-3.5 shrink-0" />
                No conditions — this rule will{" "}
                {rule.target === "segment"
                  ? "add a record to every flight leg"
                  : `modify every ${rule.target === "header" ? "carrier header" : "flight leg"}`}{" "}
                in the file.
              </p>
            )}
            {rule.conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                {c.op === "inDateRange" ? (
                  <span className="w-40 shrink-0 pl-1 text-sm text-muted-foreground">
                    Operating period
                  </span>
                ) : (
                  <Picker
                    value={c.field}
                    onChange={(field) => setCondition(i, { field })}
                    options={conditionFieldOptions}
                    className="w-40 shrink-0"
                  />
                )}
                <Picker
                  value={c.op}
                  onChange={(op) => setCondition(i, { op, value: "" })}
                  options={opOptions}
                  className="w-36 shrink-0"
                />
                {VALUELESS_OPS.includes(c.op) ? (
                  <span className="flex-1" />
                ) : usesPresets(c.field, c.op) ? (
                  <PresetPicker
                    value={c.value}
                    onChange={(value) => setCondition(i, { value })}
                    presets={presets}
                    onManage={() => setManagingPresets(true)}
                  />
                ) : c.op === "operatesOnDay" ? (
                  <Picker
                    value={c.value || "1"}
                    onChange={(value) => setCondition(i, { value })}
                    options={DAY_OPTIONS}
                    className="flex-1"
                  />
                ) : (
                  <Input
                    className="h-7 flex-1 font-mono text-sm"
                    value={c.value}
                    onChange={(e) => setCondition(i, { value: e.target.value })}
                    placeholder={VALUE_HINT[c.op]}
                  />
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove condition"
                  onClick={() =>
                    setRule((r) =>
                      r.target === "filter"
                        ? r
                        : ({
                            ...r,
                            conditions: r.conditions.filter((_, j) => j !== i),
                          } as Rule),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="xs"
              className="self-start"
              onClick={() =>
                setRule((r) =>
                  r.target === "filter"
                    ? r
                    : ({
                        ...r,
                        conditions: [
                          ...r.conditions,
                          r.target === "header"
                            ? { field: "airline", op: "equals", value: "" }
                            : { field: "depStation", op: "equals", value: "" },
                        ],
                      } as Rule),
                )
              }
            >
              <Plus /> Add condition
            </Button>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Then
            </h3>
            {rule.actions.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <Picker
                  value={a.field}
                  onChange={(field) => setAction(i, { field })}
                  options={actionFieldOptions}
                  className="w-40 shrink-0"
                />
                <Picker
                  value={a.kind}
                  onChange={(kind) => setAction(i, { kind, value: "" })}
                  options={kindOptions}
                  className="w-36 shrink-0"
                />
                {usesPresets(a.field, a.kind) ? (
                  <PresetPicker
                    value={a.value}
                    onChange={(value) => setAction(i, { value })}
                    presets={presets}
                    onManage={() => setManagingPresets(true)}
                  />
                ) : (
                  <Input
                    className="h-7 flex-1 font-mono text-sm"
                    value={a.value}
                    onChange={(e) => setAction(i, { value: e.target.value })}
                    placeholder={VALUE_HINT[a.kind]}
                  />
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove action"
                  onClick={() =>
                    setRule((r) =>
                      r.target === "filter"
                        ? r
                        : ({
                            ...r,
                            actions: r.actions.filter((_, j) => j !== i),
                          } as Rule),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="xs"
              className="self-start"
              onClick={() =>
                setRule((r) =>
                  r.target === "filter"
                    ? r
                    : ({
                        ...r,
                        actions: [
                          ...r.actions,
                          r.target === "header"
                            ? { field: "airline", kind: "setValue", value: "" }
                            : r.target === "segment"
                              ? { field: "eticket", kind: "setValue", value: "ET" }
                              : { field: "aircraftType", kind: "setValue", value: "" },
                        ],
                      } as Rule),
                )
              }
            >
              <Plus /> Add action
            </Button>
          </section>
          </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save rule</Button>
        </DialogFooter>

        {managingPresets && (
          <PresetManager
            presets={presets}
            onChange={setPresets}
            onClose={() => setManagingPresets(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
