import { type FlightLeg, type SsimFile } from "./types";

export function parseSsim(text: string): SsimFile {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = text.endsWith(eol);
  const body = trailingNewline ? text.slice(0, -eol.length) : text;
  const lines = body.length === 0 ? [] : body.split(eol);

  const legs: FlightLeg[] = [];
  lines.forEach((line, lineIndex) => {
    // Type 3 = flight leg. Zero-filler and other record types pass through raw.
    if (line[0] !== "3" || line.length < 75) return;
    // field values are sliced from raw on demand (legField) — keeps big files cheap
    legs.push({ lineIndex, raw: line });
  });

  return { lines, eol, trailingNewline, legs };
}
