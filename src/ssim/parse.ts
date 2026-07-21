import {
  SEGMENT_DEI,
  deiOfLine,
  legIdentityOfLine,
  segmentKey,
  type ExistingSegments,
} from "./segment";
import { type FlightLeg, type HeaderRecord, type SsimFile } from "./types";

export function parseSsim(text: string): SsimFile {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = text.endsWith(eol);
  const body = trailingNewline ? text.slice(0, -eol.length) : text;
  const lines = body.length === 0 ? [] : body.split(eol);

  const legs: FlightLeg[] = [];
  const headers: HeaderRecord[] = [];
  const existingSegments: ExistingSegments = { keys: new Set(), byLeg: new Map() };
  // §7.5.4 groups segment records after the flight leg record they describe, so
  // the most recent Type 3 line is the one a Type 4 attaches to.
  let lastLegLine = -1;
  lines.forEach((line, lineIndex) => {
    // field values are sliced from raw on demand (legField/headerField) — keeps big files cheap
    if (line[0] === "3" && line.length >= 75) {
      legs.push({ lineIndex, raw: line });
      lastLegLine = lineIndex;
      return;
    }
    // Type 2 = carrier header. Zero-filler and other record types pass through raw.
    if (line[0] === "2" && line.length >= 5) {
      headers.push({ lineIndex, raw: line });
      return;
    }
    // Type 4 = segment data. Not parsed into a model — indexed only: by identity
    // so we never author a second record for a leg that already carries the DEI,
    // and by anchor leg so a new record can be placed in the recommended DEI order.
    if (line[0] === "4" && line.length >= SEGMENT_DEI.end) {
      const dei = deiOfLine(line);
      existingSegments.keys.add(segmentKey(legIdentityOfLine(line), dei));
      if (lastLegLine !== -1) {
        const records = existingSegments.byLeg.get(lastLegLine);
        if (records) records.push({ dei, lineIndex });
        else existingSegments.byLeg.set(lastLegLine, [{ dei, lineIndex }]);
      }
    }
  });

  return { lines, eol, trailingNewline, legs, headers, existingSegments };
}
