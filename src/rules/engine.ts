import {
  buildSegmentLine,
  legIdentityOfLine,
  placeAfter,
  segmentDei,
  segmentKey,
  type ExistingSegments,
  type SegmentRecord,
} from "../ssim/segment";
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
  FilterRule,
  HeaderRule,
  LegRule,
  Rule,
  RuleAction,
  SegmentRule,
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

/** The text a filter rule matches a leg on, for its `values` list and change log. */
function filterSubject(leg: FlightLeg, rule: FilterRule): string {
  return rule.filterBy === "route"
    ? `${legField(leg, "depStation")}-${legField(leg, "arrStation")}`
    : legField(leg, "flightNumber");
}

function matchesFilter(leg: FlightLeg, rule: FilterRule): boolean {
  return rule.values.includes(filterSubject(leg, rule));
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

/** Pure: returns new legs/headers/segments; inputs are never mutated. */
export function applyRules(
  legs: FlightLeg[],
  headers: HeaderRecord[],
  rules: Rule[],
  /** the Type 4 records already in the file (SsimFile.existingSegments) */
  existingSegments?: ExistingSegments,
): {
  legs: FlightLeg[];
  headers: HeaderRecord[];
  segments: SegmentRecord[];
  changes: Change[];
  /** line indices of legs a filter rule drops — the serializer removes these */
  removedLines: Set<number>;
} {
  const legRules = rules.filter((r): r is LegRule => r.target === "leg");
  const headerRules = rules.filter((r): r is HeaderRule => r.target === "header");
  const segmentRules = rules.filter((r): r is SegmentRule => r.target === "segment");
  const filterRules = rules.filter((r): r is FilterRule => r.target === "filter");

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
          warning = `${spec.label} can't be placed on leg ${legField(leg, "legSequence")} — only legs 1-${MAX_OFF_POINTS} have a slot; fix before exporting`;
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

  // Filter rules drop whole legs. They fold over a surviving set — a leg dropped
  // by an earlier rule leaves the set, so it is neither re-tested nor counted
  // twice. "keep" removes every leg that does not match; "remove" every leg that
  // does. The removed line indices drive both the preview and the serializer.
  const removedLines = new Set<number>();
  const filterChanges: Change[] = [];
  let surviving = outLegs;
  for (const rule of filterRules) {
    if (!rule.enabled) continue;
    const next: FlightLeg[] = [];
    let kept = 0;
    const dropped: FlightLeg[] = [];
    for (const leg of surviving) {
      const match = matchesFilter(leg, rule);
      const drop = rule.disposition === "keep" ? !match : match;
      if (drop) dropped.push(leg);
      else {
        next.push(leg);
        kept++;
      }
    }
    // a rule that empties the file is almost always a mistake — surface it
    const warning =
      kept === 0 && dropped.length > 0
        ? "this rule removes every remaining leg — fix before exporting"
        : undefined;
    for (const leg of dropped) {
      removedLines.add(leg.lineIndex);
      filterChanges.push({
        target: "filter",
        lineIndex: leg.lineIndex,
        disposition: rule.disposition,
        before: filterSubject(leg, rule),
        after: "(removed)",
        ruleId: rule.id,
        ruleName: rule.name,
        warning,
      });
    }
    surviving = next;
  }

  // Segment records are derived from the *applied* legs, so a leg rule that
  // rewrites a station is reflected in the Type 4 record built from it. A leg a
  // filter rule is dropping gets no new record — it will not be in the output.
  const segments: SegmentRecord[] = [];
  const segmentChanges: Change[] = [];
  const emitted = new Set(existingSegments?.keys);
  for (const leg of outLegs) {
    if (removedLines.has(leg.lineIndex)) continue;
    for (const rule of segmentRules) {
      if (!rule.enabled) continue;
      if (!rule.conditions.every((c) => matchesLeg(leg, c))) continue;
      for (const action of rule.actions) {
        // only setValue is offered for segment rules — there is no prior value to
        // replace on a record that doesn't exist yet
        const value = action.value.trim();
        const dei = segmentDei(action.field);
        // "does this leg already carry the DEI?" is a question about the input
        // file, so it is asked of the leg's raw bytes — leg rules record their
        // edits in .values and never touch .raw. Read through legField instead,
        // the key would pick up a rewritten flight designator, stop matching the
        // records parsed from the file, and collide with any other leg the same
        // rule had given that designator.
        const key = segmentKey(legIdentityOfLine(leg.raw), dei);
        if (emitted.has(key)) continue; // already in the file, or already authored
        emitted.add(key);

        // buildSegmentLine is the single authority on whether a record can be
        // written; its failure is the preview warning, so the two never drift.
        let line: string | null = null;
        let warning: string | undefined;
        try {
          line = buildSegmentLine(leg, action.field, value);
        } catch (e) {
          warning = `${e instanceof Error ? e.message : e} — fix before exporting`;
        }

        segments.push({
          afterLineIndex: placeAfter(existingSegments, leg.lineIndex, dei),
          line,
          ...(warning ? { error: warning } : {}),
        });
        segmentChanges.push({
          target: "segment",
          lineIndex: leg.lineIndex,
          field: action.field,
          before: "",
          after: value,
          ruleId: rule.id,
          ruleName: rule.name,
          warning,
        });
      }
    }
  }

  return {
    legs: outLegs,
    headers: outHeaders,
    segments,
    changes: [...legChanges, ...headerChanges, ...segmentChanges, ...filterChanges],
    removedLines,
  };
}
