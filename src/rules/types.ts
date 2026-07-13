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

export const ACTION_KINDS = ["setValue", "shiftTimeMinutes", "replaceText"] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export interface RuleAction {
  field: LegField;
  kind: ActionKind;
  /** setValue: new value · shiftTimeMinutes: signed minutes · replaceText: "search=>replacement" */
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
