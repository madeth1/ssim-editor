import { describe, expect, it } from "vitest";
import { buildSegmentLine, pointIndicators } from "./segment";
import { HEADER_FIELDS, LEG_FIELDS, SEGMENT_FIELDS } from "./types";

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

// Chapter 7 §7.5.4 "Segment Data Record — Record Type 4", printed pages 379-380.
//
// Every byte of this record is authored by us — unlike Types 2 and 3, where we
// patch fields into a line the file already provides — so the whole layout, not
// just the modeled field, has to be pinned. The Type 3 input and the expected
// Type 4 output below are both assembled by hand from the spec's own byte
// numbers: buildSegmentLine must not be able to validate itself.
//
// The subject is the manual's worked example (Ch.2 glossary, "Board Point
// Indicator"): SQ 001, itinerary variation 01, leg 01, SFO-HKG, an Electronic
// Ticketing Candidate — rendered there as `4 SQ 0010101J        AB505SFOHKGET`.
function handBuiltSqLeg(legSequence: string, dep: string, arr: string): string {
  const line = " ".repeat(200).split("");
  const put = (from: number, text: string) => {
    // `from` is the spec's 1-based byte number
    for (let i = 0; i < text.length; i++) line[from - 1 + i] = text[i];
  };
  put(1, "3"); //          record type
  put(2, " "); //          operational suffix
  put(3, "SQ "); //        airline designator
  put(6, " 001"); //       flight number, right justified
  put(10, "01"); //        itinerary variation identifier
  put(12, legSequence); // leg sequence number
  put(14, "J"); //         service type
  put(15, "20AUG08"); //   period of operation from
  put(22, "28AUG08"); //   period of operation to
  put(29, "1234   "); //   days of operation
  put(37, dep); //         departure station
  put(40, "0120"); //      passenger STD
  put(44, "0120"); //      aircraft STD
  put(48, "-0700"); //     UTC variation, departure
  put(55, arr); //         arrival station
  put(58, "0630"); //      aircraft STA
  put(62, "0630"); //      passenger STA
  put(66, "+0800"); //     UTC variation, arrival
  put(73, "77W"); //       aircraft type
  put(128, "X"); //        itinerary variation identifier overflow — sentinel
  put(195, "000003"); //   record serial number
  return line.join("");
}

describe("Type 4 segment record byte layout", () => {
  it("models the Data field at byte 40 with the DEI's own format width", () => {
    // Data spans bytes 40-194, but DEI 505's format is `aa` — exactly 2
    // characters (Ch.2 glossary, "Electronic Ticketing Information").
    expect(SEGMENT_FIELDS.eticket.start + 1).toBe(40);
    expect(SEGMENT_FIELDS.eticket.len).toBe(2);
    expect(SEGMENT_FIELDS.eticket.dei).toBe("505");
  });

  it("builds the manual's worked example byte for byte", () => {
    const legLine = handBuiltSqLeg("01", "SFO", "HKG");
    const expected =
      "4" + //                 1      record type
      " " + //                 2      operational suffix
      "SQ " + //             3-5      airline designator
      " 001" + //            6-9      flight number
      "01" + //            10-11      itinerary variation identifier
      "01" + //            12-13      leg sequence number
      "J" + //                14      service type
      " ".repeat(13) + //  15-27      spare
      "X" + //                28      itinerary variation identifier overflow
      "A" + //                29      board point indicator
      "B" + //                30      off point indicator
      "505" + //           31-33      data element identifier
      "SFO" + //           34-36      board point
      "HKG" + //           37-39      off point
      "ET" + //            40-41      data
      " ".repeat(153) + // 42-194     data, blank filled
      "000000"; //        195-200     record serial number, assigned at export

    expect(expected).toHaveLength(200);
    expect(
      buildSegmentLine({ lineIndex: 0, raw: legLine }, "eticket", "ET"),
    ).toBe(expected);
  });

  it("takes the overflow byte from Type 3 byte 128, not Type 3 byte 28", () => {
    // Type 3 byte 28 is the last byte of Period of Operation ("28AUG08" -> "8").
    const legLine = handBuiltSqLeg("01", "SFO", "HKG");
    expect(legLine[27]).toBe("8");
    expect(buildSegmentLine({ lineIndex: 0, raw: legLine }, "eticket", "ET")[27]).toBe("X");
  });

  // Ch.2 glossary: "the departure station (board point) on the first leg of a
  // flight is indicated by A, the departure station on the second leg by B".
  it("advances the point indicators with the leg sequence", () => {
    const legLine = handBuiltSqLeg("02", "HKG", "SIN");
    const line = buildSegmentLine({ lineIndex: 0, raw: legLine }, "eticket", "ET");
    expect(line.slice(28, 39)).toBe("BC505HKGSIN");
  });

  it("has no indicator pair past leg 25 — the off point would run off the alphabet", () => {
    expect(pointIndicators(1)).toEqual(["A", "B"]);
    expect(pointIndicators(25)).toEqual(["Y", "Z"]);
    expect(pointIndicators(26)).toBeNull();
    expect(pointIndicators(0)).toBeNull();
  });
});
