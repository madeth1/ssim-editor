import { describe, expect, it } from "vitest";
import { parseSsim } from "./parse";
import { serializeSsim } from "./serialize";
import { makeSampleSsim } from "./fixture";

const sample = makeSampleSsim();

describe("parseSsim", () => {
  it("parses only type 3 records into legs", () => {
    const file = parseSsim(sample);
    expect(file.lines).toHaveLength(8);
    expect(file.legs).toHaveLength(4);
    expect(file.legs[0].values.airline).toBe("XX");
    expect(file.legs[0].values.flightNumber).toBe("1002");
    expect(file.legs[0].values.depStation).toBe("FCO");
    expect(file.legs[0].values.passengerSTD).toBe("0710");
    expect(file.legs[0].values.aircraftType).toBe("32N");
    expect(file.legs[0].values.prbd).toBe("JCDZPIYBMUHXQVWSTLK");
    expect(file.legs[0].values.salesConfig).toBe("Y180");
    expect(file.legs[2].values.daysOfOperation).toBe("1 3 5 7");
    expect(file.legs[3].values.airline).toBe("YY");
  });

  it("handles CRLF and remembers it", () => {
    const crlf = sample.replaceAll("\n", "\r\n");
    const file = parseSsim(crlf);
    expect(file.eol).toBe("\r\n");
    expect(file.legs).toHaveLength(4);
    expect(serializeSsim(file, file.legs)).toBe(crlf);
  });
});

describe("serializeSsim", () => {
  it("round-trips byte-identical with no changes", () => {
    const file = parseSsim(sample);
    expect(serializeSsim(file, file.legs)).toBe(sample);
  });

  it("patches only the modified field, preserving the rest of the line", () => {
    const file = parseSsim(sample);
    const legs = file.legs.map((l, i) =>
      i === 0
        ? { ...l, values: { ...l.values, passengerSTD: "0725" } }
        : l,
    );
    const out = serializeSsim(file, legs);
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
    expect(serializeSsim(file, legs).split("\n")[3].slice(5, 9)).toBe("  88");

    const bad = file.legs.map((l, i) =>
      i === 0 ? { ...l, values: { ...l.values, depStation: "FCOX" } } : l,
    );
    expect(() => serializeSsim(file, bad)).toThrow(/too long/);
  });
});
