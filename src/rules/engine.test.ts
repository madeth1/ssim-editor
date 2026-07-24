import { describe, expect, it } from "vitest";
import { parseSsim } from "../ssim/parse";
import { headerField, legField } from "../ssim/types";
import { DEFAULT_LEG, makeLegLine, makeSampleSsim } from "../ssim/fixture";
import { legIdentityOfLine, segmentKey, type ExistingSegments } from "../ssim/segment";
import { applyRules, parseSsimDate } from "./engine";
import type { FilterRule, HeaderRule, LegRule, Rule, SegmentRule } from "./types";

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
  const cases: [string, LegRule["conditions"], number][] = [
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

  it("warns when a restriction has no off-point slot (12+ leg flight)", () => {
    const leg = { lineIndex: 0, raw: makeLegLine({ ...DEFAULT_LEG, legSequence: "12" }) };
    const { changes } = applyRules([leg], [], [
      rule({
        actions: [{ field: "trafficRestriction", kind: "setValue", value: "K" }],
      }),
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0].warning).toMatch(/can't be placed on leg 12/);
  });

  it("warns when a restriction code is longer than one character", () => {
    const { changes } = applyRules(legs(), headers(), [
      rule({
        actions: [{ field: "trafficRestriction", kind: "setValue", value: "KA" }],
      }),
    ]);
    expect(changes[0].warning).toMatch(/max 1 chars/);
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

// A segment rule authors a Type 4 record for each leg it matches, rather than
// editing an existing one. It matches on leg conditions like any leg rule.
describe("segment rules", () => {
  const segmentRule = (over: Partial<SegmentRule> = {}): Rule => ({
    id: "sr1",
    name: "e-ticket everything",
    enabled: true,
    target: "segment",
    conditions: [],
    actions: [{ field: "eticket", kind: "setValue", value: "ET" }],
    ...over,
  });

  it("adds one record per matching leg, anchored to that leg's line", () => {
    const { segments, changes } = applyRules(legs(), headers(), [segmentRule()]);
    expect(segments).toHaveLength(4);
    expect(segments.map((s) => s.afterLineIndex)).toEqual([3, 4, 5, 6]);
    expect(segments[0].line?.slice(28, 39)).toBe("AB505FCOLIN");
    expect(changes).toHaveLength(4);
    expect(changes[0]).toMatchObject({
      target: "segment",
      field: "eticket",
      before: "", // the record did not exist
      after: "ET",
    });
  });

  it("honours conditions, same matcher as leg rules", () => {
    const { segments } = applyRules(legs(), headers(), [
      segmentRule({ conditions: [{ field: "depStation", op: "equals", value: "LIN" }] }),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].line?.slice(33, 39)).toBe("LINFCO");
  });

  const carrying = (leg: { raw: string }, dei = "505"): ExistingSegments => ({
    keys: new Set([segmentKey(legIdentityOfLine(leg.raw), dei)]),
    byLeg: new Map(),
  });

  it("skips a leg that already carries the same DEI", () => {
    const all = legs();
    const { segments } = applyRules(all, headers(), [segmentRule()], carrying(all[0]));
    expect(segments).toHaveLength(3);
    expect(segments.map((s) => s.afterLineIndex)).toEqual([4, 5, 6]);
  });

  // The "already carries it?" lookup is a question about the input file, so it
  // must use the leg's original identity. Keyed off the applied leg it would miss
  // and author a second DEI 505 record on a leg that already has one.
  it("still skips that leg when a leg rule rewrites the flight designator", () => {
    const all = legs();
    const { segments } = applyRules(
      all,
      headers(),
      [
        rule({ actions: [{ field: "flightNumber", kind: "setValue", value: "77" }] }),
        segmentRule(),
      ],
      carrying(all[0]),
    );
    expect(segments).toHaveLength(3);
    expect(segments.map((s) => s.afterLineIndex)).toEqual([4, 5, 6]);
    // and the records that are written key to the leg as exported, not as parsed
    expect(segments[0].line?.slice(5, 9)).toBe("  77");
  });

  // §7.5.4: records for the same off point "should appear together and be ordered
  // according to the numeric sequence of the Data Element Identifiers starting
  // with the lowest number" — so 505 goes after an existing 010, not before it.
  it("places a new record after the lower DEIs the leg already carries", () => {
    const all = legs();
    const { segments } = applyRules(all, headers(), [segmentRule()], {
      keys: new Set(),
      byLeg: new Map([
        [3, [{ dei: "010", lineIndex: 4 }, { dei: "106", lineIndex: 5 }]],
      ]),
    });
    expect(segments[0].afterLineIndex).toBe(5); // after 106, not after the leg
    expect(segments[1].afterLineIndex).toBe(4); // a leg with none is unaffected
  });

  it("places a new record before a higher DEI the leg already carries", () => {
    const all = legs();
    const { segments } = applyRules(all, headers(), [segmentRule()], {
      keys: new Set(),
      byLeg: new Map([[3, [{ dei: "710", lineIndex: 4 }]]]),
    });
    expect(segments[0].afterLineIndex).toBe(3);
  });

  it("adds one record when two rules ask for the same leg and DEI", () => {
    const { segments } = applyRules(legs(), headers(), [
      segmentRule(),
      segmentRule({ id: "sr2", name: "duplicate" }),
    ]);
    expect(segments).toHaveLength(4);
  });

  // Segment records are derived from the applied legs, so an earlier leg rule
  // rewriting a station must be reflected in the board/off points.
  it("uses stations as a leg rule left them", () => {
    const { segments } = applyRules(legs(), headers(), [
      rule({ actions: [{ field: "depStation", kind: "setValue", value: "CIA" }] }),
      segmentRule(),
    ]);
    expect(segments[0].line?.slice(33, 39)).toBe("CIALIN");
  });

  // Bytes 2-14 tie the record to its leg. Sliced from the raw line they would
  // still name the old flight, leaving the record keyed to a leg that no longer
  // exists in the exported file.
  it("uses the flight designator as a leg rule left it", () => {
    const { segments } = applyRules(legs(), headers(), [
      rule({
        conditions: [{ field: "flightNumber", op: "equals", value: "1002" }],
        actions: [{ field: "flightNumber", kind: "setValue", value: "77" }],
      }),
      segmentRule(),
    ]);
    // 13 bytes: suffix(1) airline(3) flight no.(4) itin(2) leg(2) service(1)
    expect(segments[0].line?.slice(1, 14)).toBe(" " + "XX " + "  77" + "01" + "01" + "J");
    expect(segments[0].line?.slice(5, 9)).toBe("  77"); // right justified
  });

  // Preview warns; the unbuildable record then throws at export (see ssim.test).
  it("warns instead of throwing when a record can't be placed", () => {
    const unplaceable = [{ ...legs()[0], values: { legSequence: "26" } }];
    const { segments, changes } = applyRules(unplaceable, headers(), [segmentRule()]);
    expect(changes[0].warning).toMatch(/only legs 1-25/);
    expect(segments[0].line).toBeNull();
    expect(segments[0].error).toMatch(/only legs 1-25/);
  });

  it("warns when the value doesn't fit the DEI's format", () => {
    const { changes, segments } = applyRules(legs(), headers(), [
      segmentRule({ actions: [{ field: "eticket", kind: "setValue", value: "ETX" }] }),
    ]);
    expect(changes[0].warning).toMatch(/max 2 chars/);
    expect(segments[0].line).toBeNull();
  });

  it("adds nothing when disabled", () => {
    const { segments } = applyRules(legs(), headers(), [
      segmentRule({ enabled: false }),
    ]);
    expect(segments).toHaveLength(0);
  });

  it("is absent from a run with no segment rules", () => {
    const { segments } = applyRules(legs(), headers(), [
      rule({ actions: [{ field: "aircraftType", kind: "setValue", value: "32Q" }] }),
    ]);
    expect(segments).toEqual([]);
  });
});

// Sample legs (by index): 0 XX1002 FCO-LIN · 1 XX1003 LIN-FCO ·
// 2 XX1408 FCO-CTA · 3 YY0610 FCO-JFK.
describe("filter rules", () => {
  const filterRule = (over: Partial<FilterRule>): FilterRule => ({
    id: "f1",
    name: "filter",
    enabled: true,
    target: "filter",
    disposition: "remove",
    filterBy: "route",
    values: [],
    ...over,
  });
  const line = (i: number) => legs()[i].lineIndex;

  it("remove drops legs matching a route pair, keeps the rest", () => {
    const r = applyRules(legs(), headers(), [
      filterRule({ disposition: "remove", filterBy: "route", values: ["FCO-JFK"] }),
    ]);
    expect([...r.removedLines]).toEqual([line(3)]);
    expect(r.legs).toHaveLength(4); // engine still returns every leg 1:1
  });

  it("keep drops every leg not on a listed route", () => {
    const r = applyRules(legs(), headers(), [
      filterRule({ disposition: "keep", filterBy: "route", values: ["FCO-JFK"] }),
    ]);
    expect(r.removedLines.size).toBe(3);
    expect(r.removedLines.has(line(3))).toBe(false);
  });

  it("matches per leg, not itinerary — FCO-CTA touches only that leg", () => {
    const r = applyRules(legs(), headers(), [
      filterRule({ filterBy: "route", values: ["FCO-CTA"] }),
    ]);
    expect([...r.removedLines]).toEqual([line(2)]);
  });

  it("filters by flight number", () => {
    const r = applyRules(legs(), headers(), [
      filterRule({ filterBy: "flightNumber", values: ["1408"] }),
    ]);
    expect([...r.removedLines]).toEqual([line(2)]);
  });

  it("applies filter rules sequentially over the survivors", () => {
    const r = applyRules(legs(), headers(), [
      filterRule({ id: "a", disposition: "remove", filterBy: "flightNumber", values: ["1002"] }),
      filterRule({ id: "b", disposition: "keep", filterBy: "route", values: ["LIN-FCO"] }),
    ]);
    // a drops leg0; b then keeps only LIN-FCO (leg1), dropping legs 2 and 3
    expect(r.removedLines.size).toBe(3);
    expect(r.removedLines.has(line(1))).toBe(false);
  });

  it("warns when a rule removes every remaining leg", () => {
    const r = applyRules(legs(), headers(), [
      filterRule({ disposition: "keep", filterBy: "route", values: ["ZZZ-ZZZ"] }),
    ]);
    expect(r.removedLines.size).toBe(4);
    expect(r.changes.every((c) => c.warning)).toBe(true);
  });

  it("a disabled filter rule drops nothing", () => {
    const r = applyRules(legs(), headers(), [
      filterRule({ enabled: false, values: ["FCO-JFK"] }),
    ]);
    expect(r.removedLines.size).toBe(0);
    expect(r.changes).toHaveLength(0);
  });

  it("does not author a segment record for a leg a filter removes", () => {
    const seg: SegmentRule = {
      id: "s",
      name: "seg",
      enabled: true,
      target: "segment",
      conditions: [{ field: "depStation", op: "equals", value: "FCO" }],
      actions: [{ field: "eticket", kind: "setValue", value: "ET" }],
    };
    const r = applyRules(legs(), headers(), [
      seg,
      filterRule({ disposition: "remove", filterBy: "route", values: ["FCO-JFK"] }),
    ]);
    // FCO departures are legs 0, 2, 3; leg 3 is removed, so only 0 and 2 get records
    expect(r.segments).toHaveLength(2);
    expect(r.segments.some((s) => s.afterLineIndex === line(3))).toBe(false);
  });
});

describe("date helpers", () => {
  it("parseSsimDate", () => {
    expect(parseSsimDate("01JAN26")).toBe(20260101);
    expect(parseSsimDate("28MAR26")).toBe(20260328);
    expect(parseSsimDate("BOGUS")).toBeNull();
  });
});
