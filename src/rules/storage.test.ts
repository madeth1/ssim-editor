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

  it("rejects unknown condition fields and ops", () => {
    expect(() =>
      parseRulesJson('[{"conditions": [{"field": "depstation", "op": "equals", "value": "FCO"}], "actions": []}]'),
    ).toThrow(/invalid condition/);
    expect(() =>
      parseRulesJson('[{"conditions": [{"field": "depStation", "op": "matches", "value": "FCO"}], "actions": []}]'),
    ).toThrow(/invalid condition/);
  });

  it("rejects unknown action kinds and non-string values", () => {
    expect(() =>
      parseRulesJson('[{"actions": [{"field": "depTerminal", "kind": "uppercase", "value": ""}]}]'),
    ).toThrow(/invalid action/);
    expect(() =>
      parseRulesJson('[{"actions": [{"field": "depTerminal", "kind": "setValue", "value": 5}]}]'),
    ).toThrow(/invalid action/);
  });
});
