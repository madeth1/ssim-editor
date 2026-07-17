import {
  type FlightLeg,
  type HeaderField,
  type HeaderRecord,
  type LegField,
  type SsimFile,
  HEADER_FIELDS,
  LEG_FIELDS,
  padField,
  padHeaderField,
} from "./types";

/** Splice a record's (possibly modified) values back into its original raw line. */
function patchLine<F extends string>(
  raw: string,
  values: Partial<Record<F, string>> | undefined,
  specs: Record<F, { start: number; len: number }>,
  pad: (field: F, value: string) => string,
): string {
  let line = raw;
  for (const [field, value] of Object.entries(values ?? {}) as [F, string][]) {
    const { start, len } = specs[field];
    if (line.slice(start, start + len).trim() === value) continue; // untouched
    line = line.slice(0, start) + pad(field, value) + line.slice(start + len);
  }
  return line;
}

export function patchLegLine(leg: FlightLeg): string {
  return patchLine<LegField>(leg.raw, leg.values, LEG_FIELDS, padField);
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
