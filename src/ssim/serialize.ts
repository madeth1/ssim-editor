import type { SegmentRecord } from "./segment";
import {
  type FlightLeg,
  type HeaderField,
  type HeaderRecord,
  type LegField,
  type SsimFile,
  HEADER_FIELDS,
  LEG_FIELDS,
  MAX_OFF_POINTS,
  legField,
  offPointIndex,
  padField,
  padHeaderField,
} from "./types";

/**
 * Splice a record's (possibly modified) values back into its original raw line.
 *
 * `slotOf` narrows a field to the sub-range actually being written. Positional
 * fields (traffic restriction) occupy one byte per off point, so only that leg's
 * own byte is replaced — codes belonging to other segments stay untouched. It
 * throws when the record has no slot for the value; an unwritable change must
 * fail the export rather than vanish from it.
 */
function patchLine<F extends string>(
  raw: string,
  values: Partial<Record<F, string>> | undefined,
  specs: Record<F, { start: number; len: number; positional?: boolean }>,
  pad: (field: F, value: string) => string,
  slotOf?: (field: F) => number,
): string {
  let line = raw;
  for (const [field, value] of Object.entries(values ?? {}) as [F, string][]) {
    const spec = specs[field];
    let { start, len } = spec;
    if (spec.positional) {
      if (!slotOf) throw new Error(`no slot resolver for positional field ${field}`);
      start += slotOf(field);
      len = 1;
    }
    if (line.slice(start, start + len).trim() === value) continue; // untouched
    line = line.slice(0, start) + pad(field, value) + line.slice(start + len);
  }
  return line;
}

export function patchLegLine(leg: FlightLeg): string {
  return patchLine<LegField>(leg.raw, leg.values, LEG_FIELDS, padField, (field) => {
    const slot = offPointIndex(leg);
    if (slot === null)
      throw new Error(
        `${LEG_FIELDS[field].label} can't be placed on leg ${legField(leg, "legSequence")} (line ${leg.lineIndex + 1}) — only legs 1-${MAX_OFF_POINTS} have a slot`,
      );
    return slot;
  });
}

export function patchHeaderLine(header: HeaderRecord): string {
  return patchLine<HeaderField>(
    header.raw,
    header.values,
    HEADER_FIELDS,
    padHeaderField,
  );
}

/** Record Serial Number, bytes 195-200 — on every record type. */
const SERIAL = { start: 194, len: 6 };
/** Serial Number Check Reference, bytes 188-193 — Type 5 trailer only. */
const TRAILER_CHECK = { start: 187, len: 6 };

const serialText = (n: number) => String(n).padStart(SERIAL.len, "0");

const splice = (line: string, at: number, text: string) =>
  line.slice(0, at) + text + line.slice(at + text.length);

/**
 * Rewrite every Record Serial Number so the sequence is unbroken after records
 * have been inserted. Serials run sequentially across all record types; zero
 * filler records (type "0") carry 000000 and sit outside the sequence.
 *
 * The Type 5 trailer additionally carries a check reference equal to the previous
 * record's serial, i.e. one less than its own.
 */
function renumber(lines: string[]): string[] {
  let serial = 0;
  return lines.map((line, i) => {
    if (line[0] === "0") return line;
    // Skipping a short record would leave every later serial one too low with
    // nothing to show for it — the same silent-corruption trap as a dropped
    // traffic restriction. Fail the export instead.
    if (line.length < SERIAL.start + SERIAL.len) {
      throw new Error(
        `Line ${i + 1} is ${line.length} characters — too short to hold a Record Serial Number (bytes ${SERIAL.start + 1}-${SERIAL.start + SERIAL.len}), so the file cannot be renumbered`,
      );
    }
    serial++;
    let out = splice(line, SERIAL.start, serialText(serial));
    if (out[0] === "5") out = splice(out, TRAILER_CHECK.start, serialText(serial - 1));
    return out;
  });
}

/**
 * Serialize back to SSIM text. Lines whose legs/headers are unmodified — and
 * every other line — are emitted verbatim, so no-change round-trips are
 * byte-identical to the input.
 *
 * Two things cannot preserve that, and both shift every serial after them, so
 * both force a full renumber (nothing is renumbered otherwise):
 *  - Adding a segment record inserts a line.
 *  - A filter rule dropping a leg removes its line — and the Type 4 segment
 *    records anchored to it, which would otherwise dangle with no leg.
 */
export function serializeSsim(
  file: SsimFile,
  legs: FlightLeg[],
  headers: HeaderRecord[],
  segments: SegmentRecord[] = [],
  /** line indices of legs to drop from the output (from applyRules) */
  removedLines: Set<number> = new Set(),
): string {
  let lines = [...file.lines];
  for (const leg of legs) {
    if (removedLines.has(leg.lineIndex)) continue; // dropping it — don't patch
    if (leg.values) lines[leg.lineIndex] = patchLegLine(leg);
  }
  for (const header of headers) {
    if (header.values) lines[header.lineIndex] = patchHeaderLine(header);
  }

  // A dropped leg takes its Type 4 segment records with it — a record keyed to a
  // leg no longer in the file is exactly the dangling reference we must not emit.
  const removedSegmentLines = new Set<number>();
  for (const legLineIndex of removedLines) {
    for (const rec of file.existingSegments.byLeg.get(legLineIndex) ?? [])
      removedSegmentLines.add(rec.lineIndex);
  }

  // Records authored for a leg that is being dropped never reach the output.
  const addable = segments.filter(
    (s) =>
      !removedLines.has(s.afterLineIndex) &&
      !removedSegmentLines.has(s.afterLineIndex),
  );

  if (addable.length > 0 || removedLines.size > 0) {
    // group first so one pass builds the output — splicing in place would be
    // quadratic on a file with tens of thousands of legs
    const byLine = new Map<number, string[]>();
    for (const segment of addable) {
      if (segment.line === null) throw new Error(segment.error);
      const at = byLine.get(segment.afterLineIndex);
      if (at) at.push(segment.line);
      else byLine.set(segment.afterLineIndex, [segment.line]);
    }
    const out: string[] = [];
    lines.forEach((line, i) => {
      if (removedLines.has(i) || removedSegmentLines.has(i)) return; // dropped
      out.push(line);
      const added = byLine.get(i);
      if (added) out.push(...added);
    });
    lines = renumber(out);
  }

  return lines.join(file.eol) + (file.trailingNewline ? file.eol : "");
}
