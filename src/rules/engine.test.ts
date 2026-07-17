import { describe, expect, it } from "vitest";
import { parseSsim } from "../ssim/parse";
import { headerField, legField } from "../ssim/types";
import { makeSampleSsim } from "../ssim/fixture";
import { applyRules, parseSsimDate } from "./engine";
import type { HeaderRule, LegRule, Rule } from "./types";

const legs = () => parseSsim(makeSampleSsim()).legs;
const headers = () => parseSsim(makeSampleSsim()).headers;

const rule = (over: Partial<LegRule>): Rule => ({
  id: "r1",
  name: "test rule",
  enabled: true,
  target: "leg",
  conditions: [],
  actions: [],
  ...over,
});

const headerRule = (over: Partial<HeaderRule>): Rule => ({
  id: "hr1",
  name: "test header rule",
  enabled: true,
  target: "header",
  conditions: [],
  actions: [],
  ...over,
});

describe("conditions", () => {
  const cases: [string, Rule["conditions"], number][] = [
    ["equals", [{ field: "depStation", op: "equals", value: "FCO" }], 3],
    ["notEquals", [{ field: "airline", op: "notEquals", value: "XX" }], 1],
    ["oneOf", [{ field: "arrStation", op: "oneOf", value: "LIN, CTA" }], 2],
    ["contains", [{ field: "daysOfOperation", op: "contains", value: "2" }], 3],
    ["operatesOnDay", [{ field: "daysOfOperation", op: "operatesOnDay", value: "2" }], 3],
    ["inDateRange overlap", [{ field: "periodFrom", op: "inDateRange", value: "01FEB26-05FEB26" }], 4],
    ["inDateRange miss", [{ field: "periodFrom", op: "inDateRange", value: "01MAY26-30JUN26" }], 0],
    ["no conditions applies to all legs", [], 4],
    ["isBlank", [{ field: "trafficRestriction", op: "isBlank", value: "" }], 3],
    ["isNotBlank", [{ field: "trafficRestriction", op: "isNotBlank", value: "" }], 1],
    ["AND semantics", [
      { field: "depStation", op: "equals", value: "FCO" },
      { field: "airline", op: "equals", value: "YY" },
    ], 1],
  ];
  for (const [name, conditions, expected] of cases) {
    it(`${name} matches ${expected} legs`, () => {
      const { changes } = applyRules(legs(), headers(), [
        rule({ conditions, actions: [{ field: "depTerminal", kind: "setValue", value: "T9" }] }),
      ]);
      expect(changes).toHaveLength(expected);
    });
  }
});

describe("actions", () => {
  it("setValue + change log before/after", () => {
    const { legs: out, changes } = applyRules(legs(), headers(), [
      rule({
        conditions: [{ field: "flightNumber", op: "equals", value: "1002" }],
        actions: [{ field: "aircraftType", kind: "setValue", value: "32Q" }],
      }),
    ]);
    expect(legField(out[0], "aircraftType")).toBe("32Q");
    expect(changes).toEqual([
      expect.objectContaining({ field: "aircraftType", before: "32N", after: "32Q", ruleName: "test rule" }),
    ]);
  });

  it("never mutates the input legs", () => {
    const input = legs();
    const { legs: out } = applyRules(input, headers(), [
      rule({
        conditions: [{ field: "depStation", op: "equals", value: "FCO" }],
        actions: [{ field: "aircraftType", kind: "setValue", value: "32Q" }],
      }),
    ]);
    expect(legField(out[0], "aircraftType")).toBe("32Q");
    expect(legField(input[0], "aircraftType")).toBe("32N"); // untouched
  });

  it("replaceText", () => {
    const { legs: out } = applyRules(legs(), headers(), [
      rule({
        conditions: [{ field: "flightNumber", op: "equals", value: "1408" }],
        actions: [{ field: "daysOfOperation", kind: "replaceText", value: "7=> " }],
      }),
    ]);
    expect(legField(out[2], "daysOfOperation")).toBe("1 3 5");
  });

  it("adds a traffic restriction only where none is present", () => {
    const { legs: out, changes } = applyRules(legs(), headers(), [
      rule({
        conditions: [{ field: "trafficRestriction", op: "isBlank", value: "" }],
        actions: [{ field: "trafficRestriction", kind: "setValue", value: "B" }],
      }),
    ]);
    expect(changes).toHaveLength(3);
    expect(legField(out[0], "trafficRestriction")).toBe("B"); // was blank
    expect(legField(out[3], "trafficRestriction")).toBe("A"); // YY leg untouched
  });

  it("changes equipment 319 -> 320 without touching adjacent booking classes", () => {
    const { legs: out, changes } = applyRules(legs(), headers(), [
      rule({
        conditions: [{ field: "aircraftType", op: "equals", value: "32N" }],
        actions: [{ field: "aircraftType", kind: "setValue", value: "32Q" }],
      }),
    ]);
    expect(changes).toHaveLength(3);
    expect(legField(out[0], "aircraftType")).toBe("32Q");
    expect(legField(out[0], "prbd")).toBe("JCDZPIYBMUHXQVWSTLK"); // untouched
  });

  it("warns at preview time when a value overflows its column", () => {
    const { changes } = applyRules(legs(), headers(), [
      rule({
        conditions: [{ field: "flightNumber", op: "equals", value: "1002" }],
        actions: [{ field: "aircraftType", kind: "replaceText", value: "32N=>32N-NEO" }],
      }),
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0].warning).toMatch(/doesn't fit/);
  });

  it("disabled rules and later rules chain in order", () => {
    const { legs: out, changes } = applyRules(legs(), headers(), [
      rule({ id: "a", enabled: false, conditions: [{ field: "airline", op: "equals", value: "XX" }], actions: [{ field: "serviceType", kind: "setValue", value: "C" }] }),
      rule({ id: "b", conditions: [{ field: "flightNumber", op: "equals", value: "1002" }], actions: [{ field: "depStation", kind: "setValue", value: "CIA" }] }),
      rule({ id: "c", conditions: [{ field: "depStation", op: "equals", value: "CIA" }], actions: [{ field: "depTerminal", kind: "setValue", value: "T2" }] }),
    ]);
    expect(legField(out[0], "serviceType")).toBe("J");
    expect(legField(out[0], "depStation")).toBe("CIA");
    expect(legField(out[0], "depTerminal")).toBe("T2"); // rule c saw rule b's output
    expect(changes.map((c) => c.ruleId)).toEqual(["b", "c"]);
  });
});

describe("header rules", () => {
  it("updates the airline designator on the header record", () => {
    const { headers: out, changes } = applyRules(legs(), headers(), [
      headerRule({
        conditions: [{ field: "airline", op: "equals", value: "XX" }],
        actions: [{ field: "airline", kind: "setValue", value: "ABC" }],
      }),
    ]);
    expect(headerField(out[0], "airline")).toBe("ABC");
    expect(changes).toEqual([
      expect.objectContaining({ target: "header", field: "airline", before: "XX", after: "ABC" }),
    ]);
  });

  it("never touches leg data", () => {
    const inputLegs = legs();
    const before = inputLegs.map((l) => legField(l, "airline"));
    const { legs: outLegs } = applyRules(inputLegs, headers(), [
      headerRule({
        conditions: [{ field: "airline", op: "equals", value: "XX" }],
        actions: [{ field: "airline", kind: "setValue", value: "ABC" }],
      }),
    ]);
    expect(outLegs.map((l) => legField(l, "airline"))).toEqual(before);
  });

  it("leg rules never touch header data", () => {
    const { headers: out } = applyRules(
      legs(),
      headers(),
      [rule({ actions: [{ field: "aircraftType", kind: "setValue", value: "32Q" }] })],
    );
    expect(headerField(out[0], "airline")).toBe("XX"); // untouched
  });
});

describe("date helpers", () => {
  it("parseSsimDate", () => {
    expect(parseSsimDate("01JAN26")).toBe(20260101);
    expect(parseSsimDate("28MAR26")).toBe(20260328);
    expect(parseSsimDate("BOGUS")).toBeNull();
  });
});
