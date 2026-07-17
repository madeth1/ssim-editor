import type { HeaderField, LegField } from "../ssim/types";

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

/** Header fields conditions may match on. */
export const HEADER_CONDITION_FIELDS: HeaderField[] = ["airline"];

/** Ops that read the period/days data directly and ignore the condition's field. */
export const FIELDLESS_OPS = ["inDateRange", "operatesOnDay"] as const;

export const ACTION_KINDS = ["setValue", "replaceText"] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export interface RuleAction<F extends string = LegField | HeaderField> {
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

export type Rule = LegRule | HeaderRule;

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

export type Change = LegChange | HeaderChange;
