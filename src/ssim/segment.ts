// IATA SSIM Chapter 7 §7.5.4 — Segment Data Record, Type 4.
//
// One record carries one Data Element Identifier for one segment of one flight
// leg. We author these to attach data the Type 3 record has no room for; today
// that means DEI 505 (Electronic Ticketing Information).
//
// The manual's own worked example (Ch.2 glossary, "Board Point Indicator"):
//
//   3 SQ 0010101J20AUG0828AUG081234 SFO01200120-0700 HKG06300630+08001
//   4 SQ 0010101J        AB505SFOHKGET
//   3 SQ 0010102J21AUG0829AUG08 2345 HKG08000800+08001 SIN11401140+0800
//   4 SQ 0010102J        BC505HKGSINET
//
// layout.test.ts pins buildSegmentLine against those exact lines.
import {
  SEGMENT_FIELDS,
  legField,
  padField,
  padSegmentField,
  type FlightLeg,
  type SegmentField,
} from "./types";

/** A Type 4 record to splice into the output after its anchor leg's line. */
export interface SegmentRecord {
  /** index into SsimFile.lines of the Type 3 leg this record follows */
  afterLineIndex: number;
  /** full 200-char record; its serial number is assigned at serialize time.
   *  Null when the record can't be built — `error` says why, and serializing
   *  throws it. An unwritable record must fail the export, not vanish from it. */
  line: string | null;
  error?: string;
}

/** Bytes 2-14: Operational Suffix through Service Type. Identical on Types 3 and
 *  4, and per §7.5.4 this is what ties a segment record to its flight leg. */
const LEG_KEY = { start: 1, end: 14 };

/** The Type 3 fields making up bytes 2-14, in byte order. Their column widths
 *  sum to the 13 bytes of the key. */
const LEG_KEY_FIELDS = [
  "operationalSuffix",
  "airline",
  "flightNumber",
  "itineraryVariation",
  "legSequence",
  "serviceType",
] as const;

/**
 * Bytes 2-14 for a leg, rebuilt from its *applied* values rather than sliced
 * from the raw line — a leg rule that rewrites the flight number or leg sequence
 * must carry into the segment record, or the record would key to a leg that no
 * longer exists in the file.
 */
function legKeyOf(leg: FlightLeg): string {
  return LEG_KEY_FIELDS.map((f) => padField(f, legField(leg, f))).join("");
}

/** Type 3 byte 128 — Itinerary Variation Identifier Overflow. Copied to Type 4
 *  byte 28. (Type 3 byte 28 is the tail of Period of Operation, not this.) */
const LEG_IVI_OVERFLOW = 127;

/** Highest leg sequence a segment record can name: the off point indicator of
 *  leg 26 would be one past "Z". */
const MAX_POINT_INDICATOR_LEG = 25;

/**
 * Board and Off Point Indicators for a leg — single alpha characters marking the
 * segment's endpoints by their position in the routing. Leg 01 departs the first
 * point and arrives at the second, so it is ["A", "B"]; leg 02 is ["B", "C"].
 *
 * Null when the sequence has no letter pair, which is also the spec's own limit
 * on how many legs a segment record can address.
 */
export function pointIndicators(seq: number): [string, string] | null {
  if (!Number.isInteger(seq) || seq < 1 || seq > MAX_POINT_INDICATOR_LEG)
    return null;
  const board = String.fromCharCode("A".charCodeAt(0) + seq - 1);
  const off = String.fromCharCode("A".charCodeAt(0) + seq);
  return [board, off];
}

/** Type 4 byte 28 — the same Itinerary Variation Identifier Overflow that sits at
 *  Type 3 byte 128. The two record types carry it at different offsets. */
const SEGMENT_IVI_OVERFLOW = 27;

/**
 * Identity of the flight leg a segment record belongs to, read off an existing
 * Type 3 or Type 4 line.
 *
 * §7.5.4: a segment record "specifies the information applicable to a unique
 * Flight Leg Record as specified in bytes 02-14" — those bytes sit at the same
 * offsets on both record types. The Itinerary Variation Identifier Overflow is
 * appended because bytes 2-14 alone are not unique once a flight designator needs
 * more than 99 itineraries: per Ch.2 the IVI then wraps to "00" and the overflow
 * byte carries the true hundreds digit.
 *
 * Read as raw bytes on both sides of the comparison, so a file whose fields are
 * justified unconventionally still matches itself.
 */
export function legIdentityOfLine(raw: string): string {
  const line = raw.padEnd(200);
  const overflow =
    line[0] === "4" ? line[SEGMENT_IVI_OVERFLOW] : line[LEG_IVI_OVERFLOW];
  return line.slice(LEG_KEY.start, LEG_KEY.end) + overflow;
}

/**
 * Identity of a segment record: the leg it belongs to plus its DEI. Lets a record
 * we are about to author be matched against one already in the file.
 */
export function segmentKey(legIdentity: string, dei: string): string {
  return legIdentity + dei;
}

/** Type 4 bytes 31-33, the Data Element Identifier. */
export const SEGMENT_DEI = { start: 30, end: 33 };

/** DEI of an existing Type 4 line. */
export function deiOfLine(raw: string): string {
  return raw.slice(SEGMENT_DEI.start, SEGMENT_DEI.end);
}

/** The Type 4 records already in the file, as the engine needs them. */
export interface ExistingSegments {
  /** legIdentity+DEI of every record present, so we never author a duplicate */
  keys: Set<string>;
  /** records following each leg's line, in file order, keyed by that line index */
  byLeg: Map<number, { dei: string; lineIndex: number }[]>;
}

/**
 * Line index a new record for `dei` should be spliced after.
 *
 * §7.5.4 recommends that records sharing an off point "appear together and be
 * ordered according to the numeric sequence of the Data Element Identifiers
 * starting with the lowest number", so a new record goes after any the leg
 * already carries with a lower DEI — not straight after the leg line, which would
 * put DEI 505 ahead of an existing 010. DEIs are zero-filled 3-digit strings, so
 * lexicographic order is numeric order.
 */
export function placeAfter(
  existing: ExistingSegments | undefined,
  legLineIndex: number,
  dei: string,
): number {
  let at = legLineIndex;
  for (const record of existing?.byLeg.get(legLineIndex) ?? []) {
    if (record.dei <= dei) at = Math.max(at, record.lineIndex);
  }
  return at;
}

/** DEI of the record a given segment field is carried on. */
export function segmentDei(field: SegmentField): string {
  return SEGMENT_FIELDS[field].dei;
}

/**
 * A complete 200-character Type 4 record for one leg, with the Record Serial
 * Number left as zeroes — serializeSsim assigns it when the record is spliced in.
 *
 * Stations are read through legField, not sliced from the raw line, so a leg rule
 * that rewrites a station is reflected in the segment record built from it.
 *
 * Throws rather than degrading: a record that cannot be placed must fail the
 * export, not silently name the wrong airports. Same contract as patchLegLine.
 */
export function buildSegmentLine(
  leg: FlightLeg,
  field: SegmentField,
  value: string,
): string {
  const raw = leg.raw.padEnd(200);
  const spec = SEGMENT_FIELDS[field];
  // padSegmentField enforces the DEI's own format width; the Data field is then
  // blank filled across the rest of bytes 40-194.
  const data = padSegmentField(field, value.trim()).padEnd(155);

  const seqText = legField(leg, "legSequence");
  const indicators = pointIndicators(Number(seqText));
  if (!indicators) {
    throw new Error(
      `${spec.label} record can't be placed on leg ${seqText || "(blank)"} (line ${leg.lineIndex + 1}) — only legs 1-${MAX_POINT_INDICATOR_LEG} have a board/off point indicator`,
    );
  }
  const board = legField(leg, "depStation");
  const off = legField(leg, "arrStation");
  if (!board || !off) {
    throw new Error(
      `${spec.label} record can't be placed on line ${leg.lineIndex + 1} — the ${board ? "arrival" : "departure"} station is blank`,
    );
  }

  return (
    "4" +
    legKeyOf(leg) + //                             2-14  flight leg key
    " ".repeat(13) + //                           15-27  spare
    raw[LEG_IVI_OVERFLOW] + //                       28  itin. variation overflow
    indicators[0] + //                               29  board point indicator
    indicators[1] + //                               30  off point indicator
    spec.dei.padStart(3, "0") + //                31-33  data element identifier
    board.padEnd(3) + //                          34-36  board point
    off.padEnd(3) + //                            37-39  off point
    data + //                                    40-194  data
    "000000" //                                 195-200  record serial number
  );
}
