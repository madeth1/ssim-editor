import { type FlightLeg, type HeaderRecord, type SsimFile } from "./types";

export function parseSsim(text: string): SsimFile {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = text.endsWith(eol);
  const body = trailingNewline ? text.slice(0, -eol.length) : text;
  const lines = body.length === 0 ? [] : body.split(eol);

  const legs: FlightLeg[] = [];
  const headers: HeaderRecord[] = [];
  lines.forEach((line, lineIndex) => {
    // field values are sliced from raw on demand (legField/headerField) — keeps big files cheap
    if (line[0] === "3" && line.length >= 75) {
      legs.push({ lineIndex, raw: line });
      return;
    }
    // Type 2 = carrier header. Zero-filler and other record types pass through raw.
    if (line[0] === "2" && line.length >= 5) {
      headers.push({ lineIndex, raw: line });
    }
  });

  return { lines, eol, trailingNewline, legs, headers };
}
