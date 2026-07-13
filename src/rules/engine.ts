import { LEG_FIELDS, type FlightLeg } from "../ssim/types";
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
      return leg.values[cond.field] === cond.value.trim();
    case "notEquals":
      return leg.values[cond.field] !== cond.value.trim();
    case "oneOf":
      return cond.value
        .split(",")
        .map((v) => v.trim())
        .includes(leg.values[cond.field]);
    case "contains":
      return leg.values[cond.field].includes(cond.value.trim());
    case "operatesOnDay":
      return leg.values.daysOfOperation.includes(cond.value.trim());
    case "isBlank":
      return leg.values[cond.field] === "";
    case "isNotBlank":
      return leg.values[cond.field] !== "";
    case "inDateRange": {
      const [fromS, toS] = cond.value.split("-");
      const from = parseSsimDate(fromS ?? "");
      const to = parseSsimDate(toS ?? "");
      const legFrom = parseSsimDate(leg.values.periodFrom);
      const legTo = parseSsimDate(leg.values.periodTo);
      if (from === null || to === null || legFrom === null || legTo === null)
        return false;
      return legFrom <= to && legTo >= from; // period overlap
    }
  }
}

/** "0710" + 75 -> { time: "0825" }; wraps at midnight with a warning. */
export function shiftHHMM(
  time: string,
  minutes: number,
): { time: string; warning?: string } {
  const m = /^(\d{2})(\d{2})$/.exec(time);
  if (!m) return { time, warning: `not a HHMM time: "${time}"` };
  let total = Number(m[1]) * 60 + Number(m[2]) + minutes;
  let warning: string | undefined;
  if (total >= 1440 || total < 0) {
    warning = "crossed midnight — check date variation";
    total = ((total % 1440) + 1440) % 1440;
  }
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return { time: hh + mm, warning };
}

// values are stored trimmed (see parse.ts), so results are trimmed to match
function applyAction(before: string, action: RuleAction): {
  after: string;
  warning?: string;
} {
  switch (action.kind) {
    case "setValue":
      return { after: action.value.trim() };
    case "shiftTimeMinutes": {
      const shifted = shiftHHMM(before, Number(action.value));
      return { after: shifted.time, warning: shifted.warning };
    }
    case "replaceText": {
      const [search, replacement = ""] = action.value.split("=>");
      return { after: before.split(search).join(replacement).trim() };
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
        const before = leg.values[action.field];
        let { after, warning } = applyAction(before, action);
        if (after === before) continue;
        // surface overflow at preview time; export would throw in padField
        const spec = LEG_FIELDS[action.field];
        if (after.length > spec.len)
          warning = `"${after}" doesn't fit ${spec.label} (max ${spec.len} chars) — fix before exporting`;
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
