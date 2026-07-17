// IATA SSIM Chapter 7 — fixed-width 200-char records.
// Type 3 (flight leg) column layout; start is 0-based.
export const LEG_FIELDS = {
  operationalSuffix: { start: 1, len: 1, label: "Op. suffix" },
  airline: { start: 2, len: 3, label: "Airline" },
  flightNumber: { start: 5, len: 4, label: "Flight no.", rightJustified: true },
  itineraryVariation: { start: 9, len: 2, label: "Itin. variation" },
  legSequence: { start: 11, len: 2, label: "Leg seq." },
  serviceType: { start: 13, len: 1, label: "Service type" },
  periodFrom: { start: 14, len: 7, label: "Period from" },
  periodTo: { start: 21, len: 7, label: "Period to" },
  daysOfOperation: { start: 28, len: 7, label: "Days" },
  depStation: { start: 36, len: 3, label: "Departure" },
  passengerSTD: { start: 39, len: 4, label: "STD (pax)" },
  aircraftSTD: { start: 43, len: 4, label: "STD" },
  depTimeVariation: { start: 47, len: 5, label: "Dep UTC offset" },
  depTerminal: { start: 52, len: 2, label: "Dep terminal" },
  arrStation: { start: 54, len: 3, label: "Arrival" },
  aircraftSTA: { start: 57, len: 4, label: "STA" },
  passengerSTA: { start: 61, len: 4, label: "STA (pax)" },
  arrTimeVariation: { start: 65, len: 5, label: "Arr UTC offset" },
  arrTerminal: { start: 70, len: 2, label: "Arr terminal" },
  aircraftType: { start: 72, len: 3, label: "Equipment" },
  prbd: { start: 75, len: 20, label: "Booking classes (PRBD)" },
  trafficRestriction: { start: 148, len: 12, label: "Traffic restriction" },
  salesConfig: { start: 172, len: 20, label: "Sales config (ACV)" },
} as const;

export type LegField = keyof typeof LEG_FIELDS;

export const LEG_FIELD_NAMES = Object.keys(LEG_FIELDS) as LegField[];

export interface FlightLeg {
  /** index into SsimFile.lines */
  lineIndex: number;
  raw: string;
  /** only rule-modified fields; absent on freshly parsed legs */
  values?: Partial<Record<LegField, string>>;
}

// Type 2 (carrier header) column layout. Byte 1 is Time Mode ("U"/"L",
// unmodeled — must not be touched by the airline field's column range).
// Only the airline designator is modeled — other known offsets (airline
// numeric code, season, validity period, creation date) are intentionally
// unmodeled until something needs to read or edit them.
export const HEADER_FIELDS = {
  airline: { start: 2, len: 3, label: "Airline" },
} as const;

export type HeaderField = keyof typeof HEADER_FIELDS;

export const HEADER_FIELD_NAMES = Object.keys(HEADER_FIELDS) as HeaderField[];

export interface HeaderRecord {
  /** index into SsimFile.lines */
  lineIndex: number;
  raw: string;
  /** only rule-modified fields; absent on freshly parsed headers */
  values?: Partial<Record<HeaderField, string>>;
}

export type RecordTarget = "leg" | "header";

function readField(
  raw: string,
  values: Partial<Record<string, string>> | undefined,
  spec: { start: number; len: number },
  field: string,
): string {
  const v = values?.[field];
  if (v !== undefined) return v;
  return raw.slice(spec.start, spec.start + spec.len).trim();
}

/** Trimmed field value: rule override if present, else sliced from the raw line. */
export function legField(leg: FlightLeg, field: LegField): string {
  return readField(leg.raw, leg.values, LEG_FIELDS[field], field);
}

/** Trimmed field value: rule override if present, else sliced from the raw line. */
export function headerField(header: HeaderRecord, field: HeaderField): string {
  return readField(header.raw, header.values, HEADER_FIELDS[field], field);
}

export interface SsimFile {
  /** every original line, verbatim */
  lines: string[];
  eol: "\n" | "\r\n";
  trailingNewline: boolean;
  legs: FlightLeg[];
  headers: HeaderRecord[];
}

function padToSpec(
  spec: { len: number; label: string; rightJustified?: boolean },
  value: string,
): string {
  if (value.length > spec.len) {
    throw new Error(
      `Value "${value}" is too long for ${spec.label} (max ${spec.len} chars)`,
    );
  }
  return spec.rightJustified ? value.padStart(spec.len) : value.padEnd(spec.len);
}

/** Pad a trimmed value back to its fixed column width. Throws if it doesn't fit. */
export function padField(field: LegField, value: string): string {
  return padToSpec(LEG_FIELDS[field], value);
}

/** Pad a trimmed value back to its fixed column width. Throws if it doesn't fit. */
export function padHeaderField(field: HeaderField, value: string): string {
  return padToSpec(HEADER_FIELDS[field], value);
}

/** Field spec for either record kind, keyed by a rule's target. */
export function fieldSpec(target: RecordTarget, field: LegField | HeaderField) {
  return target === "header"
    ? HEADER_FIELDS[field as HeaderField]
    : LEG_FIELDS[field as LegField];
}
