import {
  type FlightLeg,
  type LegField,
  type SsimFile,
  LEG_FIELDS,
  padField,
} from "./types";

/** Splice a leg's (possibly modified) values back into its original raw line. */
export function patchLegLine(leg: FlightLeg): string {
  let line = leg.raw;
  for (const [field, value] of Object.entries(leg.values) as [
    LegField,
    string,
  ][]) {
    const { start, len } = LEG_FIELDS[field];
    if (line.slice(start, start + len).trim() === value) continue; // untouched
    line =
      line.slice(0, start) + padField(field, value) + line.slice(start + len);
  }
  return line;
}

/**
 * Serialize back to SSIM text. Lines whose legs are unmodified — and every
 * non-leg line — are emitted verbatim, so no-change round-trips are
 * byte-identical to the input.
 */
export function serializeSsim(file: SsimFile, legs: FlightLeg[]): string {
  const lines = [...file.lines];
  for (const leg of legs) {
    lines[leg.lineIndex] = patchLegLine(leg);
  }
  return lines.join(file.eol) + (file.trailingNewline ? file.eol : "");
}
