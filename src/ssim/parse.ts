import {
  type FlightLeg,
  type LegField,
  type SsimFile,
  LEG_FIELDS,
  LEG_FIELD_NAMES,
} from "./types";

export function parseSsim(text: string): SsimFile {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = text.endsWith(eol);
  const body = trailingNewline ? text.slice(0, -eol.length) : text;
  const lines = body.length === 0 ? [] : body.split(eol);

  const legs: FlightLeg[] = [];
  lines.forEach((line, lineIndex) => {
    // Type 3 = flight leg. Zero-filler and other record types pass through raw.
    if (line[0] !== "3" || line.length < 75) return;
    const values = {} as Record<LegField, string>;
    for (const field of LEG_FIELD_NAMES) {
      const { start, len } = LEG_FIELDS[field];
      values[field] = line.slice(start, start + len).trim();
    }
    legs.push({ lineIndex, raw: line, values });
  });

  return { lines, eol, trailingNewline, legs };
}
