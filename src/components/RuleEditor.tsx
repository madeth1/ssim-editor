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
import { LEG_FIELDS, LEG_FIELD_NAMES } from "@/ssim/types";
import { loadPresets, savePresets, type Preset } from "@/rules/presets";
import type {
  ActionKind,
  Condition,
  ConditionOp,
  Rule,
  RuleAction,
} from "@/rules/types";

const FIELD_OPTIONS = LEG_FIELD_NAMES.map((f) => ({
  value: f,
  label: LEG_FIELDS[f].label,
}));

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
  { value: "shiftTimeMinutes", label: "shift time by (min)" },
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
  shiftTimeMinutes: "e.g. 15 or -30",
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
              maxLength={LEG_FIELDS.trafficRestriction.len}
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
  if (rule.actions.length === 0) return "Add at least one action.";
  for (const c of rule.conditions) {
    if (!c.value.trim() && !VALUELESS_OPS.includes(c.op))
      return "Every condition needs a value.";
  }
  for (const a of rule.actions) {
    if (a.kind === "setValue") {
      const spec = LEG_FIELDS[a.field];
      if (a.value.trim().length > spec.len)
        return `"${a.value.trim()}" doesn't fit ${spec.label} (max ${spec.len} chars).`;
    }
    if (a.kind === "shiftTimeMinutes" && !/^-?\d+$/.test(a.value.trim()))
      return "Time shift must be a whole number of minutes.";
    if (a.kind === "replaceText" && (!a.value.includes("=>") || !a.value.split("=>")[0]))
      return 'Replace text needs the form "old=>new" with a non-empty "old".';
    if (a.kind === "setValue" && !a.value.trim())
      return "Every action needs a value.";
  }
  return null;
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

  const setPresets = (next: Preset[]) => {
    setPresetsState(next);
    savePresets(next);
  };

  const usesPresets = (field: string, opOrKind: string) =>
    field === "trafficRestriction" &&
    ["equals", "notEquals", "setValue"].includes(opOrKind);

  const setCondition = (i: number, patch: Partial<Condition>) =>
    setRule((r) => ({
      ...r,
      conditions: r.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    }));
  const setAction = (i: number, patch: Partial<RuleAction>) =>
    setRule((r) => ({
      ...r,
      actions: r.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)),
    }));

  const save = () => {
    const problem = validate(rule);
    if (problem) return setError(problem);
    onSave({ ...rule, name: rule.name.trim() || "Untitled rule" });
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

          <section className="flex flex-col gap-2">
            <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              If every condition matches
            </h3>
            {rule.conditions.length === 0 && (
              <p className="flex items-center gap-1.5 pl-1 text-sm text-amber-700 dark:text-amber-400">
                <TriangleAlert className="size-3.5 shrink-0" />
                No conditions — this rule will modify every flight leg in the
                file.
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
                    options={FIELD_OPTIONS}
                    className="w-40 shrink-0"
                  />
                )}
                <Picker
                  value={c.op}
                  onChange={(op) => setCondition(i, { op, value: "" })}
                  options={OP_OPTIONS}
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
                    setRule((r) => ({
                      ...r,
                      conditions: r.conditions.filter((_, j) => j !== i),
                    }))
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
                setRule((r) => ({
                  ...r,
                  conditions: [
                    ...r.conditions,
                    { field: "depStation", op: "equals", value: "" },
                  ],
                }))
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
                  options={FIELD_OPTIONS}
                  className="w-40 shrink-0"
                />
                <Picker
                  value={a.kind}
                  onChange={(kind) => setAction(i, { kind, value: "" })}
                  options={KIND_OPTIONS}
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
                    setRule((r) => ({
                      ...r,
                      actions: r.actions.filter((_, j) => j !== i),
                    }))
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
                setRule((r) => ({
                  ...r,
                  actions: [
                    ...r.actions,
                    { field: "aircraftSTD", kind: "setValue", value: "" },
                  ],
                }))
              }
            >
              <Plus /> Add action
            </Button>
          </section>

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
