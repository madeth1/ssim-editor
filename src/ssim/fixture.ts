// Builds realistic SSIM lines for tests and the sample fixture file.
import {
  type HeaderField,
  type LegField,
  HEADER_FIELDS,
  LEG_FIELDS,
  MAX_OFF_POINTS,
  padField,
  padHeaderField,
} from "./types";

const pad200 = (s: string) => s.padEnd(200);

export function makeLegLine(
  values: Partial<Record<LegField, string>>,
  serial = 10,
): string {
  let line = pad200("3");
  // legSequence first: positional fields are placed relative to it
  const ordered = (Object.entries(values) as [LegField, string][]).sort(
    ([a], [b]) => Number(b === "legSequence") - Number(a === "legSequence"),
  );
  for (const [field, value] of ordered) {
    const spec = LEG_FIELDS[field];
    let { start, len } = spec;
    if ("positional" in spec && spec.positional) {
      const seq = Number(line.slice(LEG_FIELDS.legSequence.start, LEG_FIELDS.legSequence.start + 2));
      if (!Number.isInteger(seq) || seq < 1 || seq > MAX_OFF_POINTS) {
        throw new Error(
          `Cannot place ${spec.label}: leg sequence must be 01-${MAX_OFF_POINTS}`,
        );
      }
      start += seq - 1;
      len = 1;
    }
    line = line.slice(0, start) + padField(field, value) + line.slice(start + len);
  }
  return line.slice(0, 194) + String(serial).padStart(6, "0");
}

export function makeHeaderLine(values: Partial<Record<HeaderField, string>>): string {
  let line = pad200("2");
  for (const [field, value] of Object.entries(values) as [
    HeaderField,
    string,
  ][]) {
    const { start, len } = HEADER_FIELDS[field];
    line =
      line.slice(0, start) + padHeaderField(field, value) + line.slice(start + len);
  }
  return line;
}

export const DEFAULT_LEG: Partial<Record<LegField, string>> = {
  airline: "XX",
  flightNumber: "1002",
  itineraryVariation: "01",
  legSequence: "01",
  serviceType: "J",
  periodFrom: "01JAN26",
  periodTo: "28MAR26",
  daysOfOperation: "1234567",
  depStation: "FCO",
  passengerSTD: "0710",
  aircraftSTD: "0710",
  depTimeVariation: "+0100",
  arrStation: "LIN",
  aircraftSTA: "0820",
  passengerSTA: "0820",
  arrTimeVariation: "+0100",
  aircraftType: "32N",
  prbd: "JCDZPIYBMUHXQVWSTLK",
  salesConfig: "Y180",
};

export function makeSampleSsim(): string {
  const lines = [
    pad200("1AIRLINE STANDARD SCHEDULE DATA SET" + " ".repeat(160) + "00001"),
    "0".repeat(200),
    pad200("2UXX  0008    S26 01JAN2628MAR2604JUL25"),
    makeLegLine(DEFAULT_LEG, 4),
    makeLegLine(
      { ...DEFAULT_LEG, flightNumber: "1003", depStation: "LIN", arrStation: "FCO", passengerSTD: "0905", aircraftSTD: "0905", aircraftSTA: "1015", passengerSTA: "1015" },
      5,
    ),
    makeLegLine(
      { ...DEFAULT_LEG, flightNumber: "1408", depStation: "FCO", arrStation: "CTA", passengerSTD: "1130", aircraftSTD: "1130", aircraftSTA: "1245", passengerSTA: "1245", daysOfOperation: "1 3 5 7" },
      6,
    ),
    makeLegLine(
      { ...DEFAULT_LEG, airline: "YY", flightNumber: "0610", depStation: "FCO", arrStation: "JFK", passengerSTD: "1015", aircraftSTD: "1015", arrTimeVariation: "-0500", aircraftSTA: "1340", passengerSTA: "1340", aircraftType: "339", trafficRestriction: "A" },
      7,
    ),
    pad200("5 XX 04JUL25" + " ".repeat(175) + "000008E"),
  ];
  return lines.join("\n") + "\n";
}
