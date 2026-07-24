import type {
  HeaderField,
  LegField,
  RecordTarget,
  SegmentField,
} from "../ssim/types";

export const CONDITION_OPS = [
  "equals",
  "notEquals",
  "oneOf", // value: comma-separated list
  "contains",
  "inDateRange", // value: "DDMMMYY-DDMMMYY"; matches legs whose operating period overlaps
  "operatesOnDay", // value: "1".."7" (Mon..Sun)
  "isBlank", // no value
  "isNotBlank", // no value
] as const;

export type ConditionOp = (typeof CONDITION_OPS)[number];

/** Ops that apply to header rules — excludes inDateRange/operatesOnDay, which
 * read leg-only period/days fields that don't exist on a header record. */
export const HEADER_CONDITION_OPS: ConditionOp[] = CONDITION_OPS.filter(
  (op) => op !== "inDateRange" && op !== "operatesOnDay",
);

export interface Condition<F extends string = LegField | HeaderField> {
  /** ignored for inDateRange / operatesOnDay (they read the period/days fields) */
  field: F;
  op: ConditionOp;
  value: string;
}

/** The only leg fields rules may modify. */
export const LEG_ACTION_FIELDS: LegField[] = [
  "aircraftType",
  "prbd",
  "trafficRestriction",
  "salesConfig",
];

/** Leg fields conditions may match on: targeting fields plus everything editable. */
export const LEG_CONDITION_FIELDS: LegField[] = [
  "flightNumber",
  "depStation",
  "arrStation",
  ...LEG_ACTION_FIELDS,
];

/** The only header fields rules may modify. */
export const HEADER_ACTION_FIELDS: HeaderField[] = ["airline"];

/** The segment (Type 4) data elements rules may author a record for. */
export const SEGMENT_ACTION_FIELDS: SegmentField[] = ["eticket"];

/** Header fields conditions may match on. */
export const HEADER_CONDITION_FIELDS: HeaderField[] = ["airline"];

/** Ops that read the period/days data directly and ignore the condition's field. */
export const FIELDLESS_OPS = ["inDateRange", "operatesOnDay"] as const;

export const ACTION_KINDS = ["setValue", "replaceText"] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export interface RuleAction<
  F extends string = LegField | HeaderField | SegmentField,
> {
  field: F;
  kind: ActionKind;
  /** setValue: new value · replaceText: "search=>replacement" */
  value: string;
}

interface RuleBase {
  id: string;
  name: string;
  enabled: boolean;
}

export interface LegRule extends RuleBase {
  target: "leg";
  conditions: Condition<LegField>[]; // AND semantics
  actions: RuleAction<LegField>[];
}

export interface HeaderRule extends RuleBase {
  target: "header";
  conditions: Condition<HeaderField>[]; // AND semantics
  actions: RuleAction<HeaderField>[];
}

/**
 * Adds a Type 4 segment data record to each leg it matches, rather than editing
 * an existing record. Conditions are leg conditions — a segment record is always
 * anchored to a flight leg — so matchesLeg() serves both targets unchanged.
 */
export interface SegmentRule extends RuleBase {
  target: "segment";
  conditions: Condition<LegField>[]; // AND semantics
  actions: RuleAction<SegmentField>[];
}

/** keep: drop every leg that does NOT match. remove: drop every leg that does. */
export const FILTER_DISPOSITIONS = ["keep", "remove"] as const;
export type FilterDisposition = (typeof FILTER_DISPOSITIONS)[number];

/** The one filter dimension a rule targets — route pairs or flight numbers. */
export const FILTER_BYS = ["route", "flightNumber"] as const;
export type FilterBy = (typeof FILTER_BYS)[number];

/** A valid route-pair value: two 3-letter station codes, e.g. "JFK-LAX". */
export const ROUTE_PAIR_RE = /^[A-Z]{3}-[A-Z]{3}$/;

/**
 * Drops whole flight-leg records rather than editing fields. A leg "matches" when
 * its route (`depStation-arrStation`) or flight number is in `values`; the
 * disposition then decides whether matching or non-matching legs are removed.
 * Unlike the other rules this changes which lines exist in the output, so the
 * engine reports it as removed line indices and the serializer renumbers.
 */
export interface FilterRule extends RuleBase {
  target: "filter";
  disposition: FilterDisposition;
  filterBy: FilterBy;
  /** route pairs like "JFK-LAX" (upper-cased) or flight numbers like "123" */
  values: string[];
}

export type Rule = LegRule | HeaderRule | SegmentRule | FilterRule;

/** A rule targets an SSIM record kind, or the synthetic "filter" disposition. */
export type RuleTarget = RecordTarget | "filter";

interface ChangeBase {
  lineIndex: number;
  before: string;
  after: string;
  ruleId: string;
  ruleName: string;
  warning?: string;
}

export interface LegChange extends ChangeBase {
  target: "leg";
  field: LegField;
}

export interface HeaderChange extends ChangeBase {
  target: "header";
  field: HeaderField;
}

/** `lineIndex` is the anchor leg's line — the record itself has none until export
 *  splices it in. `before` is always blank: the record did not exist. */
export interface SegmentChange extends ChangeBase {
  target: "segment";
  field: SegmentField;
}

/** A whole leg dropped from the output — no `field`, it removes a record.
 *  `before` holds the matched route/flight text, `after` is "(removed)". */
export interface FilterChange extends ChangeBase {
  target: "filter";
  disposition: FilterDisposition;
}

export type Change = LegChange | HeaderChange | SegmentChange | FilterChange;
