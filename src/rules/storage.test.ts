import { describe, expect, it } from "vitest";
import { parseRulesJson } from "./storage";
import type { HeaderRule, LegRule, Rule, SegmentRule } from "./types";

/** These cases only build condition/action rules; narrow past the filter variant. */
const ca = (r: Rule): LegRule | HeaderRule | SegmentRule => {
  if (r.target === "filter") throw new Error("unexpected filter rule");
  return r;
};

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
    expect(ca(r).conditions).toHaveLength(1);
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

  it("defaults missing target to leg (back-compat)", () => {
    const [r] = parseRulesJson('[{"conditions": [], "actions": []}]');
    expect(r.target).toBe("leg");
  });

  it("accepts a valid header rule", () => {
    const [r] = parseRulesJson(
      '[{"target": "header", "conditions": [{"field": "airline", "op": "equals", "value": "UXX"}], "actions": [{"field": "airline", "kind": "setValue", "value": "ABC"}]}]',
    );
    expect(r.target).toBe("header");
    expect(ca(r).conditions).toHaveLength(1);
    expect(ca(r).actions).toHaveLength(1);
  });

  it("rejects a header rule using a leg-only field", () => {
    expect(() =>
      parseRulesJson(
        '[{"target": "header", "conditions": [{"field": "depStation", "op": "equals", "value": "FCO"}], "actions": []}]',
      ),
    ).toThrow(/invalid condition/);
  });

  it("rejects a header rule using a leg-only op", () => {
    expect(() =>
      parseRulesJson(
        '[{"target": "header", "conditions": [{"field": "airline", "op": "inDateRange", "value": "01JAN26-31MAR26"}], "actions": []}]',
      ),
    ).toThrow(/invalid condition/);
  });

  // A segment rule that silently downgraded to "leg" here would throw in the
  // engine on a field the leg target doesn't have.
  it("accepts a segment rule, with leg conditions", () => {
    const [r] = parseRulesJson(
      '[{"target": "segment", "conditions": [{"field": "depStation", "op": "equals", "value": "FCO"}], "actions": [{"field": "eticket", "kind": "setValue", "value": "ET"}]}]',
    );
    expect(r.target).toBe("segment");
    expect(ca(r).actions).toEqual([{ field: "eticket", kind: "setValue", value: "ET" }]);
  });

  it("rejects a segment rule writing a leg field", () => {
    expect(() =>
      parseRulesJson(
        '[{"target": "segment", "conditions": [], "actions": [{"field": "aircraftType", "kind": "setValue", "value": "32Q"}]}]',
      ),
    ).toThrow(/invalid action/);
  });

  // The editor only offers setValue for a segment rule; an import must not be
  // able to smuggle in a kind the engine would ignore and write literally.
  it("rejects a segment rule using replaceText", () => {
    expect(() =>
      parseRulesJson(
        '[{"target": "segment", "conditions": [], "actions": [{"field": "eticket", "kind": "replaceText", "value": "EN=>ET"}]}]',
      ),
    ).toThrow(/invalid action/);
  });

  it("still accepts replaceText on a leg rule", () => {
    const [r] = parseRulesJson(
      '[{"target": "leg", "conditions": [], "actions": [{"field": "aircraftType", "kind": "replaceText", "value": "32N=>32Q"}]}]',
    );
    expect(ca(r).actions[0].kind).toBe("replaceText");
  });

  it("falls back to leg for an unknown target", () => {
    const [r] = parseRulesJson('[{"target": "nonsense", "conditions": [], "actions": []}]');
    expect(r.target).toBe("leg");
  });

  it("accepts a route filter rule and normalizes its values", () => {
    const [r] = parseRulesJson(
      '[{"target":"filter","disposition":"remove","filterBy":"route","values":["fco-jfk"," lin-fco "]}]',
    );
    if (r.target !== "filter") throw new Error("expected a filter rule");
    expect(r.disposition).toBe("remove");
    expect(r.filterBy).toBe("route");
    expect(r.values).toEqual(["FCO-JFK", "LIN-FCO"]);
  });

  it("accepts a flight-number filter rule", () => {
    const [r] = parseRulesJson(
      '[{"target":"filter","disposition":"keep","filterBy":"flightNumber","values":["1408","0610"]}]',
    );
    if (r.target !== "filter") throw new Error("expected a filter rule");
    expect(r.values).toEqual(["1408", "0610"]);
  });

  it("rejects an invalid disposition", () => {
    expect(() =>
      parseRulesJson('[{"target":"filter","disposition":"nuke","filterBy":"route","values":["FCO-JFK"]}]'),
    ).toThrow(/disposition/);
  });

  it("rejects an unknown filter dimension", () => {
    expect(() =>
      parseRulesJson('[{"target":"filter","disposition":"remove","filterBy":"airline","values":[]}]'),
    ).toThrow(/filter type/);
  });

  it("rejects a malformed route pair", () => {
    expect(() =>
      parseRulesJson('[{"target":"filter","disposition":"remove","filterBy":"route","values":["FCO/JFK"]}]'),
    ).toThrow(/route pair/);
  });

  it("rejects non-string filter values", () => {
    expect(() =>
      parseRulesJson('[{"target":"filter","disposition":"remove","filterBy":"route","values":[123]}]'),
    ).toThrow(/filter values as strings/);
  });
});
