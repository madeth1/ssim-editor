import {
  ACTION_FIELDS,
  ACTION_KINDS,
  CONDITION_FIELDS,
  CONDITION_OPS,
  FIELDLESS_OPS,
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
    const conditions = Array.isArray(r?.conditions) ? r.conditions : [];
    const actions = Array.isArray(r?.actions) ? r.actions : [];
    for (const c of conditions) {
      const fieldOk = FIELDLESS_OPS.includes(c?.op) || CONDITION_FIELDS.includes(c?.field);
      if (!fieldOk || !CONDITION_OPS.includes(c?.op) || typeof c?.value !== "string")
        throw new Error(`Rule "${name}" has an invalid condition: ${JSON.stringify(c)}`);
    }
    for (const a of actions) {
      if (!ACTION_FIELDS.includes(a?.field) || !ACTION_KINDS.includes(a.kind) || typeof a.value !== "string")
        throw new Error(`Rule "${name}" has an invalid action: ${JSON.stringify(a)}`);
    }
    return {
      id: typeof r.id === "string" ? r.id : crypto.randomUUID(),
      name,
      enabled: r.enabled !== false,
      conditions,
      actions,
    };
  });
}
