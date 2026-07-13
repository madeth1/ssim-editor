import type { LegField } from "../ssim/types";

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

export interface Condition {
  /** ignored for inDateRange / operatesOnDay (they read the period/days fields) */
  field: LegField;
  op: ConditionOp;
  value: string;
}

/** The only fields rules may modify. */
export const ACTION_FIELDS: LegField[] = [
  "aircraftType",
  "prbd",
  "trafficRestriction",
  "salesConfig",
];

/** Fields conditions may match on: targeting fields plus everything editable. */
export const CONDITION_FIELDS: LegField[] = [
  "flightNumber",
  "depStation",
  "arrStation",
  ...ACTION_FIELDS,
];

/** Ops that read the period/days data directly and ignore the condition's field. */
export const FIELDLESS_OPS = ["inDateRange", "operatesOnDay"] as const;

export const ACTION_KINDS = ["setValue", "replaceText"] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export interface RuleAction {
  field: LegField;
  kind: ActionKind;
  /** setValue: new value · replaceText: "search=>replacement" */
  value: string;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: Condition[]; // AND semantics
  actions: RuleAction[];
}

export interface Change {
  lineIndex: number;
  field: LegField;
  before: string;
  after: string;
  ruleId: string;
  ruleName: string;
  warning?: string;
}
