import {
  HEADER_FIELDS,
  LEG_FIELDS,
  MAX_OFF_POINTS,
  fieldMaxLength,
  headerField,
  legField,
  offPointIndex,
  type FlightLeg,
  type HeaderField,
  type HeaderRecord,
  type LegField,
} from "../ssim/types";
import type {
  Change,
  Condition,
  HeaderRule,
  LegRule,
  Rule,
  RuleAction,
} from "./types";

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

/** The six ops that only need the field's current value — field-agnostic
 * across record kinds. Returns undefined for ops the caller must handle
 * itself (inDateRange/operatesOnDay, which read leg-only fields). */
function matchesBasic<F extends string>(
  value: string,
  cond: Condition<F>,
): boolean | undefined {
  switch (cond.op) {
    case "equals":
      return value === cond.value.trim();
    case "notEquals":
      return value !== cond.value.trim();
    case "oneOf":
      return cond.value
        .split(",")
        .map((v) => v.trim())
        .includes(value);
    case "contains":
      return value.includes(cond.value.trim());
    case "isBlank":
      return value === "";
    case "isNotBlank":
      return value !== "";
    default:
      return undefined;
  }
}

function matchesLeg(leg: FlightLeg, cond: Condition<LegField>): boolean {
  if (cond.op === "operatesOnDay") {
    return legField(leg, "daysOfOperation").includes(cond.value.trim());
  }
  if (cond.op === "inDateRange") {
    const [fromS, toS] = cond.value.split("-");
    const from = parseSsimDate(fromS ?? "");
    const to = parseSsimDate(toS ?? "");
    const legFrom = parseSsimDate(legField(leg, "periodFrom"));
    const legTo = parseSsimDate(legField(leg, "periodTo"));
    if (from === null || to === null || legFrom === null || legTo === null)
      return false;
    return legFrom <= to && legTo >= from; // period overlap
  }
  return matchesBasic(legField(leg, cond.field), cond) ?? false;
}

function matchesHeader(
  header: HeaderRecord,
  cond: Condition<HeaderField>,
): boolean {
  return matchesBasic(headerField(header, cond.field), cond) ?? false;
}

// values are stored trimmed (see parse.ts), so results are trimmed to match
function applyAction<F extends string>(
  before: string,
  action: RuleAction<F>,
): string {
  switch (action.kind) {
    case "setValue":
      return action.value.trim();
    case "replaceText": {
      const [search, replacement = ""] = action.value.split("=>");
      return before.split(search).join(replacement).trim();
    }
  }
}

/** Pure: returns new legs/headers; inputs are never mutated. */
export function applyRules(
  legs: FlightLeg[],
  headers: HeaderRecord[],
  rules: Rule[],
): { legs: FlightLeg[]; headers: HeaderRecord[]; changes: Change[] } {
  const legRules = rules.filter((r): r is LegRule => r.target === "leg");
  const headerRules = rules.filter((r): r is HeaderRule => r.target === "header");

  const legChanges: Change[] = [];
  const outLegs = legs.map((orig) => {
    let leg = orig;
    for (const rule of legRules) {
      if (!rule.enabled) continue;
      // no conditions = apply to every leg
      if (!rule.conditions.every((c) => matchesLeg(leg, c))) continue;
      for (const action of rule.actions) {
        const before = legField(leg, action.field);
        const after = applyAction(before, action);
        if (after === before) continue;
        // surface overflow at preview time; export would throw in padField
        const spec = LEG_FIELDS[action.field];
        const max = fieldMaxLength(spec);
        let warning =
          after.length > max
            ? `"${after}" doesn't fit ${spec.label} (max ${max} chars) — fix before exporting`
            : undefined;
        // a positional value needs a slot to live in; without one it can't be written
        if (
          !warning &&
          "positional" in spec &&
          spec.positional &&
          offPointIndex(leg) === null
        ) {
          warning = `${spec.label} can't be placed on leg ${legField(leg, "legSequence")} — only legs 1-${MAX_OFF_POINTS} have a slot; this change won't be exported`;
        }
        leg = { ...leg, values: { ...leg.values, [action.field]: after } };
        legChanges.push({
          target: "leg",
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

  const headerChanges: Change[] = [];
  const outHeaders = headers.map((orig) => {
    let header = orig;
    for (const rule of headerRules) {
      if (!rule.enabled) continue;
      if (!rule.conditions.every((c) => matchesHeader(header, c))) continue;
      for (const action of rule.actions) {
        const before = headerField(header, action.field);
        const after = applyAction(before, action);
        if (after === before) continue;
        const spec = HEADER_FIELDS[action.field];
        const warning =
          after.length > spec.len
            ? `"${after}" doesn't fit ${spec.label} (max ${spec.len} chars) — fix before exporting`
            : undefined;
        header = { ...header, values: { ...header.values, [action.field]: after } };
        headerChanges.push({
          target: "header",
          lineIndex: header.lineIndex,
          field: action.field,
          before,
          after,
          ruleId: rule.id,
          ruleName: rule.name,
          warning,
        });
      }
    }
    return header;
  });

  return { legs: outLegs, headers: outHeaders, changes: [...legChanges, ...headerChanges] };
}
