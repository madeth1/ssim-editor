import { describe, expect, it } from "vitest";
import { HEADER_FIELDS, LEG_FIELDS } from "./types";

// Byte ranges transcribed from IATA SSIM (March 2011), Chapter 7 §7.5.3
// "Flight Leg Record — Record Type 3", printed pages 377-379. Ranges are the
// spec's own 1-based inclusive [from, to]; LEG_FIELDS stores 0-based start +
// length, so start = from - 1 and len = to - from + 1.
//
// Only the fields the app models are listed. Unmodeled bytes are deliberately
// absent — see the "no field overlaps" test for what guards the gaps.
const TYPE_3: Record<string, [from: number, to: number]> = {
  operationalSuffix: [2, 2],
  airline: [3, 5],
  flightNumber: [6, 9],
  itineraryVariation: [10, 11],
  legSequence: [12, 13],
  serviceType: [14, 14],
  periodFrom: [15, 21],
  periodTo: [22, 28],
  daysOfOperation: [29, 35],
  depStation: [37, 39],
  passengerSTD: [40, 43],
  aircraftSTD: [44, 47],
  depTimeVariation: [48, 52],
  depTerminal: [53, 54],
  arrStation: [55, 57],
  aircraftSTA: [58, 61],
  passengerSTA: [62, 65],
  arrTimeVariation: [66, 70],
  arrTerminal: [71, 72],
  aircraftType: [73, 75],
  prbd: [76, 95],
  trafficRestriction: [150, 160],
  salesConfig: [173, 192],
};

describe("Type 3 leg record byte layout", () => {
  it("models every field at its spec byte range", () => {
    const actual = Object.fromEntries(
      Object.keys(TYPE_3).map((f) => {
        const s = LEG_FIELDS[f as keyof typeof LEG_FIELDS];
        return [f, [s.start + 1, s.start + s.len]];
      }),
    );
    expect(actual).toEqual(TYPE_3);
  });

  it("covers every modeled field", () => {
    expect(Object.keys(LEG_FIELDS).sort()).toEqual(Object.keys(TYPE_3).sort());
  });

  it("has no field overlapping another", () => {
    const ranges = Object.entries(LEG_FIELDS)
      .map(([f, s]) => ({ f, from: s.start, to: s.start + s.len }))
      .sort((a, b) => a.from - b.from);
    for (let i = 1; i < ranges.length; i++) {
      expect(
        `${ranges[i].f} starts at ${ranges[i].from} (prev ${ranges[i - 1].f} ends ${ranges[i - 1].to})`,
      ).toBe(
        `${ranges[i].f} starts at ${Math.max(ranges[i].from, ranges[i - 1].to)} (prev ${ranges[i - 1].f} ends ${ranges[i - 1].to})`,
      );
    }
  });

  it("keeps every field inside the 200-byte record", () => {
    for (const [f, s] of Object.entries(LEG_FIELDS)) {
      expect(`${f}:${s.start >= 1 && s.start + s.len <= 200}`).toBe(`${f}:true`);
    }
  });
});

// Chapter 7 §7.5.2 "Carrier Record — Record Type 2". Byte 2 is Time Mode and is
// intentionally unmodeled; only the airline designator is read or written.
describe("Type 2 carrier record byte layout", () => {
  it("models the airline designator at bytes 3-5", () => {
    expect([HEADER_FIELDS.airline.start + 1, HEADER_FIELDS.airline.start + HEADER_FIELDS.airline.len]).toEqual([3, 5]);
  });
});
