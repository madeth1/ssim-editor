import { describe, expect, it } from "vitest";
import { parseSsim } from "./parse";
import { buildSegmentLine } from "./segment";
import { serializeSsim } from "./serialize";
import { headerField, legField } from "./types";
import { makeSampleSsim, makeSegmentLine } from "./fixture";

const sample = makeSampleSsim();

describe("parseSsim", () => {
  it("parses only type 3 records into legs", () => {
    const file = parseSsim(sample);
    expect(file.lines).toHaveLength(8);
    expect(file.legs).toHaveLength(4);
    expect(legField(file.legs[0], "airline")).toBe("XX");
    expect(legField(file.legs[0], "flightNumber")).toBe("1002");
    expect(legField(file.legs[0], "depStation")).toBe("FCO");
    expect(legField(file.legs[0], "passengerSTD")).toBe("0710");
    expect(legField(file.legs[0], "aircraftType")).toBe("32N");
    expect(legField(file.legs[0], "prbd")).toBe("JCDZPIYBMUHXQVWSTLK");
    expect(legField(file.legs[0], "salesConfig")).toBe("Y180");
    expect(legField(file.legs[2], "daysOfOperation")).toBe("1 3 5 7");
    expect(legField(file.legs[3], "airline")).toBe("YY");
  });

  it("parses type 2 records into headers", () => {
    const file = parseSsim(sample);
    expect(file.headers).toHaveLength(1);
    expect(file.headers[0].lineIndex).toBe(2);
    expect(headerField(file.headers[0], "airline")).toBe("XX");
  });

  it("handles CRLF and remembers it", () => {
    const crlf = sample.replaceAll("\n", "\r\n");
    const file = parseSsim(crlf);
    expect(file.eol).toBe("\r\n");
    expect(file.legs).toHaveLength(4);
    expect(serializeSsim(file, file.legs, file.headers)).toBe(crlf);
  });
});

// Built by hand rather than via makeLegLine, so these assert against the spec's
// own byte numbers instead of against LEG_FIELDS. `codes` maps a 1-based byte in
// 150-160 to its character. Sentinels sit on either side of the field: 1-based
// 149 (0-based 148) and the 1-based 161 overflow indicator (0-based 160).
function handBuiltLeg(legSequence: string, codes: Record<number, string> = {}): string {
  const line = "3".padEnd(200).split("");
  line[11] = legSequence[0];
  line[12] = legSequence[1];
  line[148] = "<";
  line[160] = ">";
  for (const [byte, code] of Object.entries(codes)) line[Number(byte) - 1] = code;
  return line.join("");
}

const setRestriction = (file: ReturnType<typeof parseSsim>, value: string) =>
  serializeSsim(
    file,
    file.legs.map((l) => ({ ...l, values: { ...l.values, trafficRestriction: value } })),
    file.headers,
  );

// Bytes 150-160 are 11 one-character slots, each naming a different off point in
// the routing. A leg's own slot is legSequence - 1. See SSIM Ch.2 glossary
// "Traffic Restriction Code" (Chapter 7 Application).
describe("traffic restriction is positional", () => {
  it("reads the slot belonging to this leg, not the whole field", () => {
    // leg 04's own off point is the 4th, at byte 153
    const file = parseSsim(handBuiltLeg("04", { 153: "A" }));
    expect(legField(file.legs[0], "trafficRestriction")).toBe("A");
  });

  it("ignores codes that belong to other off points", () => {
    // leg 02 owns byte 151; the A at 153 is a different segment's
    const file = parseSsim(handBuiltLeg("02", { 153: "A" }));
    expect(legField(file.legs[0], "trafficRestriction")).toBe("");
  });

  it("writes to this leg's slot, offset by leg sequence", () => {
    const out = setRestriction(parseSsim(handBuiltLeg("02")), "K");
    expect(out[150]).toBe("K"); // byte 151 = 2nd off point
    expect(out[149]).toBe(" "); // byte 150 untouched
    expect(out[148]).toBe("<");
    expect(out[160]).toBe(">");
    expect(out).toHaveLength(200);
  });

  it("leaves other off points' codes byte-identical when writing", () => {
    const raw = handBuiltLeg("02", { 150: "B", 153: "A", 156: "Q" });
    const out = setRestriction(parseSsim(raw), "K");
    expect(out[150]).toBe("K"); // this leg's slot, byte 151
    expect(out.slice(149, 150)).toBe("B"); // byte 150 preserved
    expect(out.slice(152, 153)).toBe("A"); // byte 153 preserved
    expect(out.slice(155, 156)).toBe("Q"); // byte 156 preserved
    // everything outside this leg's single byte is untouched
    expect(out.slice(0, 150)).toBe(raw.slice(0, 150));
    expect(out.slice(151)).toBe(raw.slice(151));
  });

  it("rejects a value longer than one character", () => {
    expect(() => setRestriction(parseSsim(handBuiltLeg("01")), "KA")).toThrow(/too long/);
  });

  // The field holds 11 off points, so a 12th leg has nowhere to put its code.
  // Export must fail rather than drop the change silently — the engine warns
  // about this at preview time so it can be fixed before we get here.
  it("refuses to export when the leg has no slot (12+ leg flights)", () => {
    const raw = handBuiltLeg("12");
    expect(legField(parseSsim(raw).legs[0], "trafficRestriction")).toBe("");
    expect(() => setRestriction(parseSsim(raw), "K")).toThrow(/only legs 1-11/);
  });

  // SSIM Ch.2, Chapter 7 Application Example 1: LHR-FCO-THR-DEL-BKK
  it("matches the manual's worked example", () => {
    const routing = [
      handBuiltLeg("01", { 150: "Z" }), // LHR-FCO, differing restrictions -> Z
      handBuiltLeg("02", { 151: "Q" }), // FCO-THR
      handBuiltLeg("03"), //              THR-DEL, none
      handBuiltLeg("04", { 153: "A" }), // DEL-BKK
    ].join("\n");
    const file = parseSsim(routing);
    expect(file.legs.map((l) => legField(l, "trafficRestriction"))).toEqual([
      "Z",
      "Q",
      "",
      "A",
    ]);
  });
});

describe("serializeSsim", () => {
  it("round-trips byte-identical with no changes", () => {
    const file = parseSsim(sample);
    expect(serializeSsim(file, file.legs, file.headers)).toBe(sample);
  });

  it("patches only the modified field, preserving the rest of the line", () => {
    const file = parseSsim(sample);
    const legs = file.legs.map((l, i) =>
      i === 0
        ? { ...l, values: { ...l.values, passengerSTD: "0725" } }
        : l,
    );
    const out = serializeSsim(file, legs, file.headers);
    const [origLine, newLine] = [file.lines[3], out.split("\n")[3]];
    expect(newLine.slice(39, 43)).toBe("0725");
    // everything outside the patched columns is untouched
    expect(newLine.slice(0, 39)).toBe(origLine.slice(0, 39));
    expect(newLine.slice(43)).toBe(origLine.slice(43));
    // other lines verbatim
    expect(out.split("\n")[4]).toBe(file.lines[4]);
  });

  it("right-justifies flight number and rejects oversize values", () => {
    const file = parseSsim(sample);
    const legs = file.legs.map((l, i) =>
      i === 0 ? { ...l, values: { ...l.values, flightNumber: "88" } } : l,
    );
    expect(serializeSsim(file, legs, file.headers).split("\n")[3].slice(5, 9)).toBe("  88");

    const bad = file.legs.map((l, i) =>
      i === 0 ? { ...l, values: { ...l.values, depStation: "FCOX" } } : l,
    );
    expect(() => serializeSsim(file, bad, file.headers)).toThrow(/too long/);
  });

  it("patches only the modified header field, preserving the rest of the line", () => {
    const file = parseSsim(sample);
    const headers = file.headers.map((h) => ({
      ...h,
      values: { ...h.values, airline: "ABC" },
    }));
    const out = serializeSsim(file, file.legs, headers);
    const [origLine, newLine] = [file.lines[2], out.split("\n")[2]];
    expect(newLine.slice(2, 5)).toBe("ABC");
    // record type and time mode (byte 1) are untouched
    expect(newLine.slice(0, 2)).toBe(origLine.slice(0, 2));
    expect(newLine.slice(5)).toBe(origLine.slice(5));
    // legs verbatim
    expect(out.split("\n")[3]).toBe(file.lines[3]);
  });

  it("rejects an oversize header field value", () => {
    const file = parseSsim(sample);
    const headers = file.headers.map((h) => ({
      ...h,
      values: { ...h.values, airline: "ABCD" },
    }));
    expect(() => serializeSsim(file, file.legs, headers)).toThrow(/too long/);
  });
});

// Inserting a record is the one operation that cannot preserve the byte-identical
// round-trip: Record Serial Numbers (bytes 195-200) are sequential across all
// record types, so everything after an insertion shifts. See §7.5.4 and the
// Record Serial Number remarks on every record type.
describe("segment records", () => {
  const file = parseSsim(sample);
  // the sample ends with a newline, so the split has a trailing empty element
  const recordsOf = (text: string) => text.split("\n").slice(0, -1);
  // legs 0 and 3 sit at lines 3 and 6 of the 8-line sample
  const segmentsAt = (...legIndexes: number[]) =>
    legIndexes.map((i) => ({
      afterLineIndex: file.legs[i].lineIndex,
      line: buildSegmentLine(file.legs[i], "eticket", "ET"),
    }));

  it("inserts each record directly after the leg it belongs to", () => {
    const out = recordsOf(serializeSsim(file, file.legs, file.headers, segmentsAt(0, 3)));
    expect(out).toHaveLength(10);
    expect(out[3][0]).toBe("3"); // leg 0
    expect(out[4][0]).toBe("4"); // its segment record
    expect(out[4].slice(28, 39)).toBe("AB505FCOLIN");
    expect(out[5][0]).toBe("3"); // leg 1, unchanged
    expect(out[7][0]).toBe("3"); // leg 3
    expect(out[8].slice(28, 39)).toBe("AB505FCOJFK");
    expect(out[9][0]).toBe("5"); // trailer
  });

  it("renumbers every serial and the trailer's check reference", () => {
    const out = recordsOf(serializeSsim(file, file.legs, file.headers, segmentsAt(0, 3)));
    // filler (line 1) is skipped, so the sequence runs 1,_,2,3,4,5,6,7,8,9
    expect(out.map((l) => l.slice(194, 200))).toEqual([
      "000001", // type 1 header
      "0".repeat(200).slice(194, 200), // filler, untouched
      "000002", // type 2 carrier
      "000003", // leg 0
      "000004", // segment record
      "000005", // leg 1
      "000006", // leg 2
      "000007", // leg 3
      "000008", // segment record
      "000009", // type 5 trailer
    ]);
    // the trailer's check reference is the previous record's serial
    expect(out[9].slice(187, 193)).toBe("000008");
  });

  it("leaves zero-filler records out of the sequence, byte for byte", () => {
    const out = recordsOf(serializeSsim(file, file.legs, file.headers, segmentsAt(0)));
    expect(out[1]).toBe("0".repeat(200));
  });

  it("renumbers nothing when no records are added", () => {
    expect(serializeSsim(file, file.legs, file.headers, [])).toBe(sample);
    expect(serializeSsim(file, file.legs, file.headers)).toBe(sample);
  });

  // A record that can't be built must fail the export, not vanish from it — the
  // engine surfaces the same reason as a preview warning first.
  it("throws the reason when a record could not be built", () => {
    const unbuildable = [
      { afterLineIndex: 3, line: null, error: "leg 26 has no board/off point indicator" },
    ];
    expect(() => serializeSsim(file, file.legs, file.headers, unbuildable)).toThrow(
      /no board\/off point indicator/,
    );
  });

  it("refuses to build a record for a leg past the indicator alphabet", () => {
    const leg = { ...file.legs[0], values: { legSequence: "26" } };
    expect(() => buildSegmentLine(leg, "eticket", "ET")).toThrow(/only legs 1-25/);
  });

  it("rejects a data value longer than the DEI's format", () => {
    expect(() => buildSegmentLine(file.legs[0], "eticket", "ETX")).toThrow(/too long/);
  });

  // Skipping a short record would leave every later serial one too low and say
  // nothing — the serial is mandatory on every record type, so this must fail.
  it("refuses to renumber when a record is too short to hold a serial", () => {
    const truncated = sample.split("\n");
    truncated[0] = truncated[0].slice(0, 50);
    const f = parseSsim(truncated.join("\n"));
    expect(() =>
      serializeSsim(f, f.legs, f.headers, [
        { afterLineIndex: 3, line: buildSegmentLine(f.legs[0], "eticket", "ET") },
      ]),
    ).toThrow(/too short to hold a Record Serial Number/);
  });
});

describe("parsing existing segment records", () => {
  it("indexes them by leg and DEI without parsing them into a model", () => {
    const legKey = sample.split("\n")[3].slice(1, 14);
    const withSegment = [
      ...sample.split("\n").slice(0, 4),
      makeSegmentLine({ legKey, board: "FCO", off: "LIN" }),
      ...sample.split("\n").slice(4),
    ].join("\n");

    const file = parseSsim(withSegment);
    expect(file.legs).toHaveLength(4); // the type 4 line is not a leg
    // identity is bytes 2-14 plus the Itinerary Variation Identifier Overflow,
    // blank on both records here
    expect(file.existingSegments.keys.has(legKey + " " + "505")).toBe(true);
    expect(file.existingSegments.keys.size).toBe(1);
    // and it is anchored to the leg line it follows, for DEI-ordered placement
    expect(file.existingSegments.byLeg.get(3)).toEqual([{ dei: "505", lineIndex: 4 }]);
    // and it still passes through untouched
    expect(serializeSsim(file, file.legs, file.headers)).toBe(withSegment);
  });

  // Ch.2 (PDF p64): past 99 itineraries for one designator the IVI wraps to "00"
  // and the overflow byte carries the true hundreds digit, so bytes 2-14 alone
  // stop being unique. Two legs identical but for that byte are different legs.
  it("distinguishes legs that differ only in the IVI overflow byte", () => {
    const legKey = sample.split("\n")[3].slice(1, 14);
    const overflowed = (b: string) =>
      makeSegmentLine({ legKey, board: "FCO", off: "LIN" }).replace(
        /^(.{27}) /,
        `$1${b}`,
      );
    const file = parseSsim(
      [...sample.split("\n").slice(0, 4), overflowed("1"), overflowed("2"), ...sample.split("\n").slice(4)].join("\n"),
    );
    expect(file.existingSegments.keys.size).toBe(2);
    expect(file.existingSegments.keys.has(legKey + "1" + "505")).toBe(true);
    expect(file.existingSegments.keys.has(legKey + "2" + "505")).toBe(true);
  });
});
