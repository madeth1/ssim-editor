// IATA SSIM Chapter 7 — fixed-width 200-char records.
// Type 3 (flight leg) column layout; start is 0-based.
export const LEG_FIELDS = {
  operationalSuffix: { start: 1, len: 1, label: "Op. suffix" },
  airline: { start: 2, len: 3, label: "Airline" },
  flightNumber: { start: 5, len: 4, label: "Flight no.", rightJustified: true },
  itineraryVariation: { start: 9, len: 2, label: "Itin. variation" },
  legSequence: { start: 11, len: 2, label: "Leg seq." },
  serviceType: { start: 13, len: 1, label: "Service type" },
  periodFrom: { start: 14, len: 7, label: "From" },
  periodTo: { start: 21, len: 7, label: "To" },
  daysOfOperation: { start: 28, len: 7, label: "Days" },
  depStation: { start: 36, len: 3, label: "Dep" },
  passengerSTD: { start: 39, len: 4, label: "STD (pax)" },
  aircraftSTD: { start: 43, len: 4, label: "STD (acft)" },
  depTimeVariation: { start: 47, len: 5, label: "Dep UTC offset" },
  depTerminal: { start: 52, len: 2, label: "Dep terminal" },
  arrStation: { start: 54, len: 3, label: "Arr" },
  aircraftSTA: { start: 57, len: 4, label: "STA (acft)" },
  passengerSTA: { start: 61, len: 4, label: "STA (pax)" },
  arrTimeVariation: { start: 65, len: 5, label: "Arr UTC offset" },
  arrTerminal: { start: 70, len: 2, label: "Arr terminal" },
  aircraftType: { start: 72, len: 3, label: "Aircraft" },
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
  /** trimmed field values, keyed by field name */
  values: Record<LegField, string>;
}

export interface SsimFile {
  /** every original line, verbatim */
  lines: string[];
  eol: "\n" | "\r\n";
  trailingNewline: boolean;
  legs: FlightLeg[];
}

/** Pad a trimmed value back to its fixed column width. Throws if it doesn't fit. */
export function padField(field: LegField, value: string): string {
  const spec = LEG_FIELDS[field];
  if (value.length > spec.len) {
    throw new Error(
      `Value "${value}" is too long for ${spec.label} (max ${spec.len} chars)`,
    );
  }
  return "rightJustified" in spec && spec.rightJustified
    ? value.padStart(spec.len)
    : value.padEnd(spec.len);
}
