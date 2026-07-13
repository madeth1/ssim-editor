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
import { LEG_FIELDS } from "@/ssim/types";

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
        : `${LEG_FIELDS[c.field].label} ${OP_TEXT[c.op] ?? ""} ${c.value}`.trim(),
    )
    .join(" · ");
  return conds || "⚠ modifies all legs";
}

const newRule = (): Rule => ({
  id: crypto.randomUUID(),
  name: "",
  enabled: true,
  conditions: [{ field: "depStation", op: "equals", value: "" }],
  actions: [],
});

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

  const move = (i: number, dir: -1 | 1) => {
    const next = [...rules];
    const [r] = next.splice(i, 1);
    next.splice(i + dir, 0, r);
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

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {rules.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No rules yet. Rules run top to bottom on every flight leg — changes
            preview instantly in the table.
          </p>
        )}
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
                  onCheckedChange={(enabled) =>
                    onChange(
                      rules.map((r) =>
                        r.id === rule.id ? { ...r, enabled } : r,
                      ),
                    )
                  }
                  aria-label={`Enable ${rule.name}`}
                />
                <button
                  className="min-w-0 flex-1 cursor-pointer text-left"
                  onClick={() => setEditing(rule)}
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
                    onClick={() => move(i, -1)}
                    aria-label="Move rule up"
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={i === rules.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Move rule down"
                  >
                    <ChevronDown />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => onChange(rules.filter((r) => r.id !== rule.id))}
                  aria-label="Delete rule"
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
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
