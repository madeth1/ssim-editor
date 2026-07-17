import type { RecordTarget } from "../ssim/types";
import {
  ACTION_KINDS,
  CONDITION_OPS,
  FIELDLESS_OPS,
  HEADER_ACTION_FIELDS,
  HEADER_CONDITION_FIELDS,
  HEADER_CONDITION_OPS,
  LEG_ACTION_FIELDS,
  LEG_CONDITION_FIELDS,
  type Rule,
} from "./types";

// ponytail: localStorage persists fine in the Tauri webview; move to the app
// config dir (tauri fs) only if rules ever need to survive a webview data reset.
const KEY = "ssim-editor.rules";

export function loadRules(): Rule[] {
  try {
    return parseRulesJson(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveRules(rules: Rule[]): void {
  localStorage.setItem(KEY, JSON.stringify(rules));
}

/**
 * Lenient parse for imported rule sets — fills missing name/id/enabled, but
 * rejects unknown fields/ops/kinds: a bad condition silently dropped would
 * widen the rule's scope, and a bad field crashes the engine mid-render.
 */
export function parseRulesJson(json: string): Rule[] {
  const data = JSON.parse(json);
  if (!Array.isArray(data)) throw new Error("Rules file must be a JSON array");
  return data.map((r, i) => {
    const name = typeof r?.name === "string" ? r.name : `Imported rule ${i + 1}`;
    const target: RecordTarget = r?.target === "header" ? "header" : "leg";
    const conditionFields = target === "header" ? HEADER_CONDITION_FIELDS : LEG_CONDITION_FIELDS;
    const conditionOps = target === "header" ? HEADER_CONDITION_OPS : CONDITION_OPS;
    const actionFields = target === "header" ? HEADER_ACTION_FIELDS : LEG_ACTION_FIELDS;
    const conditions = Array.isArray(r?.conditions) ? r.conditions : [];
    const actions = Array.isArray(r?.actions) ? r.actions : [];
    for (const c of conditions) {
      const fieldOk = FIELDLESS_OPS.includes(c?.op) || conditionFields.includes(c?.field);
      if (!fieldOk || !conditionOps.includes(c?.op) || typeof c?.value !== "string")
        throw new Error(`Rule "${name}" has an invalid condition: ${JSON.stringify(c)}`);
    }
    for (const a of actions) {
      if (!actionFields.includes(a?.field) || !ACTION_KINDS.includes(a.kind) || typeof a.value !== "string")
        throw new Error(`Rule "${name}" has an invalid action: ${JSON.stringify(a)}`);
    }
    return {
      id: typeof r.id === "string" ? r.id : crypto.randomUUID(),
      name,
      enabled: r.enabled !== false,
      target,
      conditions,
      actions,
    } as Rule;
  });
}
