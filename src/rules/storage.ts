import {
  ACTION_KINDS,
  CONDITION_OPS,
  FIELDLESS_OPS,
  FILTER_BYS,
  FILTER_DISPOSITIONS,
  HEADER_ACTION_FIELDS,
  HEADER_CONDITION_FIELDS,
  HEADER_CONDITION_OPS,
  LEG_ACTION_FIELDS,
  LEG_CONDITION_FIELDS,
  ROUTE_PAIR_RE,
  SEGMENT_ACTION_FIELDS,
  type FilterRule,
  type Rule,
  type RuleTarget,
} from "./types";

const TARGETS: RuleTarget[] = ["leg", "header", "segment", "filter"];

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
    const target: RuleTarget = TARGETS.includes(r?.target) ? r.target : "leg";
    const id = typeof r?.id === "string" ? r.id : crypto.randomUUID();
    const enabled = r?.enabled !== false;

    // A filter rule drops legs rather than editing them — it carries a
    // disposition and a single value list instead of conditions/actions.
    if (target === "filter") return parseFilterRule(r, { id, name, enabled });

    // segment rules match flight legs — they only differ in what they write
    const conditionFields = target === "header" ? HEADER_CONDITION_FIELDS : LEG_CONDITION_FIELDS;
    const conditionOps = target === "header" ? HEADER_CONDITION_OPS : CONDITION_OPS;
    // widened: three disjoint field unions would narrow .includes() to never
    const actionFields: string[] =
      target === "header"
        ? HEADER_ACTION_FIELDS
        : target === "segment"
          ? SEGMENT_ACTION_FIELDS
          : LEG_ACTION_FIELDS;
    const conditions = Array.isArray(r?.conditions) ? r.conditions : [];
    const actions = Array.isArray(r?.actions) ? r.actions : [];
    for (const c of conditions) {
      const fieldOk = FIELDLESS_OPS.includes(c?.op) || conditionFields.includes(c?.field);
      if (!fieldOk || !conditionOps.includes(c?.op) || typeof c?.value !== "string")
        throw new Error(`Rule "${name}" has an invalid condition: ${JSON.stringify(c)}`);
    }
    // a segment rule authors a record that does not exist yet, so there is no
    // prior text for replaceText to act on — the editor offers only setValue
    const actionKinds: readonly string[] =
      target === "segment" ? ["setValue"] : ACTION_KINDS;
    for (const a of actions) {
      if (!actionFields.includes(a?.field) || !actionKinds.includes(a?.kind) || typeof a?.value !== "string")
        throw new Error(`Rule "${name}" has an invalid action: ${JSON.stringify(a)}`);
    }
    return { id, name, enabled, target, conditions, actions } as Rule;
  });
}

/**
 * Validate and build a filter rule from imported JSON. Rejects an unknown
 * disposition/dimension or a malformed route pair — a silently dropped filter
 * value would widen or invert what the rule removes from the schedule.
 */
function parseFilterRule(
  r: { disposition?: unknown; filterBy?: unknown; values?: unknown },
  base: { id: string; name: string; enabled: boolean },
): FilterRule {
  const disposition = r?.disposition;
  const filterBy = r?.filterBy;
  if (!FILTER_DISPOSITIONS.includes(disposition as never))
    throw new Error(`Rule "${base.name}" has an invalid disposition: ${JSON.stringify(disposition)}`);
  if (!FILTER_BYS.includes(filterBy as never))
    throw new Error(`Rule "${base.name}" has an invalid filter type: ${JSON.stringify(filterBy)}`);
  if (!Array.isArray(r?.values) || r.values.some((v) => typeof v !== "string"))
    throw new Error(`Rule "${base.name}" must list filter values as strings`);
  const values = (r.values as string[]).map((v) => v.trim().toUpperCase()).filter(Boolean);
  if (filterBy === "route") {
    const bad = values.find((v) => !ROUTE_PAIR_RE.test(v));
    if (bad) throw new Error(`Rule "${base.name}" has an invalid route pair: ${JSON.stringify(bad)} (expected e.g. "JFK-LAX")`);
  }
  return {
    ...base,
    target: "filter",
    disposition: disposition as FilterRule["disposition"],
    filterBy: filterBy as FilterRule["filterBy"],
    values,
  };
}
