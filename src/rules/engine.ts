import { LEG_FIELDS, legField, type FlightLeg } from "../ssim/types";
import type { Change, Condition, Rule, RuleAction } from "./types";

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/** "01JAN26" -> comparable number, or null if malformed. */
export function parseSsimDate(s: string): number | null {
  const m = /^(\d{2})([A-Z]{3})(\d{2})$/.exec(s.trim().toUpperCase());
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]);
  if (month === -1) return null;
  // ponytail: 2-digit years assumed 20xx; revisit in 2099
  return (2000 + Number(m[3])) * 10000 + (month + 1) * 100 + Number(m[1]);
}

function matches(leg: FlightLeg, cond: Condition): boolean {
  switch (cond.op) {
    case "equals":
      return legField(leg, cond.field) === cond.value.trim();
    case "notEquals":
      return legField(leg, cond.field) !== cond.value.trim();
    case "oneOf":
      return cond.value
        .split(",")
        .map((v) => v.trim())
        .includes(legField(leg, cond.field));
    case "contains":
      return legField(leg, cond.field).includes(cond.value.trim());
    case "operatesOnDay":
      return legField(leg, "daysOfOperation").includes(cond.value.trim());
    case "isBlank":
      return legField(leg, cond.field) === "";
    case "isNotBlank":
      return legField(leg, cond.field) !== "";
    case "inDateRange": {
      const [fromS, toS] = cond.value.split("-");
      const from = parseSsimDate(fromS ?? "");
      const to = parseSsimDate(toS ?? "");
      const legFrom = parseSsimDate(legField(leg, "periodFrom"));
      const legTo = parseSsimDate(legField(leg, "periodTo"));
      if (from === null || to === null || legFrom === null || legTo === null)
        return false;
      return legFrom <= to && legTo >= from; // period overlap
    }
  }
}

// values are stored trimmed (see parse.ts), so results are trimmed to match
function applyAction(before: string, action: RuleAction): string {
  switch (action.kind) {
    case "setValue":
      return action.value.trim();
    case "replaceText": {
      const [search, replacement = ""] = action.value.split("=>");
      return before.split(search).join(replacement).trim();
    }
  }
}

/** Pure: returns new leg objects; input legs are never mutated. */
export function applyRules(
  legs: FlightLeg[],
  rules: Rule[],
): { legs: FlightLeg[]; changes: Change[] } {
  const changes: Change[] = [];
  const result = legs.map((orig) => {
    let leg = orig;
    for (const rule of rules) {
      if (!rule.enabled) continue;
      // no conditions = apply to every leg
      if (!rule.conditions.every((c) => matches(leg, c))) continue;
      for (const action of rule.actions) {
        const before = legField(leg, action.field);
        const after = applyAction(before, action);
        if (after === before) continue;
        // surface overflow at preview time; export would throw in padField
        const spec = LEG_FIELDS[action.field];
        const warning =
          after.length > spec.len
            ? `"${after}" doesn't fit ${spec.label} (max ${spec.len} chars) — fix before exporting`
            : undefined;
        leg = { ...leg, values: { ...leg.values, [action.field]: after } };
        changes.push({
          lineIndex: leg.lineIndex,
          field: action.field,
          before,
          after,
          ruleId: rule.id,
          ruleName: rule.name,
          warning,
        });
      }
    }
    return leg;
  });
  return { legs: result, changes };
}
