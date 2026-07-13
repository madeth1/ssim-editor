import { describe, expect, it } from "vitest";
import { parseRulesJson } from "./storage";

describe("parseRulesJson", () => {
  it("fills defaults for missing id/name/enabled", () => {
    const [r] = parseRulesJson('[{"conditions": [], "actions": []}]');
    expect(r.id).toBeTruthy();
    expect(r.name).toBe("Imported rule 1");
    expect(r.enabled).toBe(true);
  });

  it("rejects non-arrays", () => {
    expect(() => parseRulesJson("{}")).toThrow(/JSON array/);
  });

  it("rejects unknown ops and conditions on non-condition fields", () => {
    expect(() =>
      parseRulesJson('[{"conditions": [{"field": "airline", "op": "equals", "value": "XX"}], "actions": []}]'),
    ).toThrow(/invalid condition/);
    expect(() =>
      parseRulesJson('[{"conditions": [{"field": "aircraftType", "op": "matches", "value": "32N"}], "actions": []}]'),
    ).toThrow(/invalid condition/);
  });

  it("allows fieldless ops regardless of their (ignored) field", () => {
    const [r] = parseRulesJson(
      '[{"conditions": [{"field": "periodFrom", "op": "inDateRange", "value": "01JAN26-31MAR26"}], "actions": []}]',
    );
    expect(r.conditions).toHaveLength(1);
  });

  it("rejects unknown action kinds and non-string values", () => {
    expect(() =>
      parseRulesJson('[{"actions": [{"field": "trafficRestriction", "kind": "uppercase", "value": ""}]}]'),
    ).toThrow(/invalid action/);
    expect(() =>
      parseRulesJson('[{"actions": [{"field": "trafficRestriction", "kind": "setValue", "value": 5}]}]'),
    ).toThrow(/invalid action/);
  });

  it("rejects actions on condition-only fields", () => {
    expect(() =>
      parseRulesJson('[{"actions": [{"field": "depStation", "kind": "setValue", "value": "CIA"}]}]'),
    ).toThrow(/invalid action/);
  });
});
