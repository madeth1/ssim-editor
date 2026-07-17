import { describe, expect, it } from "vitest";
import { parseSsim } from "./parse";
import { serializeSsim } from "./serialize";
import { headerField, legField } from "./types";
import { makeSampleSsim } from "./fixture";

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
