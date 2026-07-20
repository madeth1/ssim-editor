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

/**
 * Serialize back to SSIM text. Lines whose legs/headers are unmodified — and
 * every other line — are emitted verbatim, so no-change round-trips are
 * byte-identical to the input.
 */
export function serializeSsim(
  file: SsimFile,
  legs: FlightLeg[],
  headers: HeaderRecord[],
): string {
  const lines = [...file.lines];
  for (const leg of legs) {
    if (leg.values) lines[leg.lineIndex] = patchLegLine(leg);
  }
  for (const header of headers) {
    if (header.values) lines[header.lineIndex] = patchHeaderLine(header);
  }
  return lines.join(file.eol) + (file.trailingNewline ? file.eol : "");
}
