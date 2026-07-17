import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RuleEditor } from "@/components/RuleEditor";
import { pickAndReadJson, saveJsonAs } from "@/lib/file-io";
import { parseRulesJson } from "@/rules/storage";
import type { Rule } from "@/rules/types";
import { fieldSpec, type RecordTarget } from "@/ssim/types";

function summarize(rule: Rule): string {
  const OP_TEXT: Partial<Record<string, string>> = {
    notEquals: "≠",
    isBlank: "is blank",
    isNotBlank: "is not blank",
    operatesOnDay: "on day",
  };
  const conds = rule.conditions
    .map((c) =>
      c.op === "inDateRange"
        ? `period ∩ ${c.value}`
        : `${fieldSpec(rule.target, c.field).label} ${OP_TEXT[c.op] ?? ""} ${c.value}`.trim(),
    )
    .join(" · ");
  return conds || `⚠ modifies all ${rule.target === "header" ? "carrier headers" : "legs"}`;
}

const newRule = (target: RecordTarget = "leg"): Rule =>
  target === "header"
    ? {
        id: crypto.randomUUID(),
        name: "",
        enabled: true,
        target: "header",
        conditions: [{ field: "airline", op: "equals", value: "" }],
        actions: [],
      }
    : {
        id: crypto.randomUUID(),
        name: "",
        enabled: true,
        target: "leg",
        conditions: [{ field: "depStation", op: "equals", value: "" }],
        actions: [],
      };

function RuleGroup({
  title,
  rules,
  onMove,
  onToggle,
  onEdit,
  onDelete,
}: {
  title: string;
  rules: Rule[];
  onMove: (i: number, dir: -1 | 1) => void;
  onToggle: (rule: Rule, enabled: boolean) => void;
  onEdit: (rule: Rule) => void;
  onDelete: (rule: Rule) => void;
}) {
  if (rules.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="px-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {rules.map((rule, i) => (
          <li
            key={rule.id}
            className="group rounded-lg border bg-card px-2.5 py-2"
          >
            <div className="flex items-center gap-2">
              <Switch
                size="sm"
                checked={rule.enabled}
                onCheckedChange={(enabled) => onToggle(rule, enabled)}
                aria-label={`Enable ${rule.name}`}
              />
              <button
                className="min-w-0 flex-1 cursor-pointer text-left"
                onClick={() => onEdit(rule)}
              >
                <span className="block truncate text-sm font-medium">
                  {rule.name}
                </span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                  {summarize(rule)}
                </span>
              </button>
              <div className="flex flex-col opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={i === 0}
                  onClick={() => onMove(i, -1)}
                  aria-label="Move rule up"
                >
                  <ChevronUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={i === rules.length - 1}
                  onClick={() => onMove(i, 1)}
                  aria-label="Move rule down"
                >
                  <ChevronDown />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onDelete(rule)}
                aria-label="Delete rule"
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RulesPanel({
  rules,
  onChange,
  onError,
}: {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState<Rule | null>(null);

  const legRules = rules.filter((r) => r.target === "leg");
  const headerRules = rules.filter((r) => r.target === "header");

  const toggle = (rule: Rule, enabled: boolean) =>
    onChange(rules.map((r) => (r.id === rule.id ? { ...r, enabled } : r)));

  const remove = (rule: Rule) =>
    onChange(rules.filter((r) => r.id !== rule.id));

  // Reorders within a target group only — groups never interact at
  // execution time, so cross-group order carries no meaning.
  const move = (target: RecordTarget, groupIndex: number, dir: -1 | 1) => {
    const indices = rules.reduce<number[]>(
      (acc, r, i) => (r.target === target ? [...acc, i] : acc),
      [],
    );
    const a = indices[groupIndex];
    const b = indices[groupIndex + dir];
    if (a === undefined || b === undefined) return;
    const next = [...rules];
    [next[a], next[b]] = [next[b], next[a]];
    onChange(next);
  };

  const importRules = async () => {
    try {
      const json = await pickAndReadJson();
      if (json) onChange([...rules, ...parseRulesJson(json)]);
    } catch (e) {
      onError(`Couldn't import rules: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l bg-sidebar">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Business rules
        </h2>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={importRules}
            aria-label="Import rules"
            title="Import rules from JSON"
          >
            <Upload />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={rules.length === 0}
            onClick={() =>
              saveJsonAs(JSON.stringify(rules, null, 2)).catch((e) =>
                onError(`Couldn't export rules: ${e}`),
              )
            }
            aria-label="Export rules"
            title="Export rules to JSON"
          >
            <Download />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2">
        {rules.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No rules yet. Rules run top to bottom within each record type —
            changes preview instantly in the table.
          </p>
        )}
        <RuleGroup
          title="Flight Leg Record"
          rules={legRules}
          onMove={(i, dir) => move("leg", i, dir)}
          onToggle={toggle}
          onEdit={setEditing}
          onDelete={remove}
        />
        <RuleGroup
          title="Carrier Record"
          rules={headerRules}
          onMove={(i, dir) => move("header", i, dir)}
          onToggle={toggle}
          onEdit={setEditing}
          onDelete={remove}
        />
      </div>

      <div className="border-t p-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setEditing(newRule())}
        >
          <Plus /> New rule
        </Button>
      </div>

      {editing && (
        <RuleEditor
          key={editing.id}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(saved) => {
            onChange(
              rules.some((r) => r.id === saved.id)
                ? rules.map((r) => (r.id === saved.id ? saved : r))
                : [...rules, saved],
            );
            setEditing(null);
          }}
        />
      )}
    </aside>
  );
}
