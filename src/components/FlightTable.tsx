import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TriangleAlert } from "lucide-react";
import { LEG_FIELDS, type FlightLeg, type LegField } from "@/ssim/types";
import type { Change } from "@/rules/types";
import { cn } from "@/lib/utils";

export type ChangeMap = Map<string, Change>; // key: `${lineIndex}:${field}`

export const changeKey = (lineIndex: number, field: string) =>
  `${lineIndex}:${field}`;

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function DaysStrip({ value }: { value: string }) {
  return (
    <span className="inline-flex gap-px" aria-label={`days of operation ${value}`}>
      {DAY_LABELS.map((label, i) => {
        const active = value.includes(String(i + 1));
        return (
          <span
            key={i}
            className={cn(
              "flex h-4.5 w-4.5 items-center justify-center rounded-[3px] font-mono text-[10px] leading-none",
              active
                ? "bg-primary/12 font-semibold text-primary"
                : "text-muted-foreground/40",
            )}
          >
            {label}
          </span>
        );
      })}
    </span>
  );
}

/** Renders a field value; amber with a before→after tooltip when a rule changed it. */
function F({
  leg,
  field,
  changes,
  className,
}: {
  leg: FlightLeg;
  field: LegField;
  changes: ChangeMap;
  className?: string;
}) {
  const change = changes.get(changeKey(leg.lineIndex, field));
  if (!change) return <span className={className}>{leg.values[field]}</span>;
  return (
    <span
      className={cn(
        "rounded-[4px] bg-amber-400/25 px-1 font-semibold text-amber-700 dark:text-amber-400",
        className,
      )}
      title={`${change.before || "(blank)"} → ${change.after || "(blank)"} · ${change.ruleName}${change.warning ? ` · ⚠ ${change.warning}` : ""}`}
    >
      {leg.values[field] || "·"}
    </span>
  );
}

const GRID =
  "grid grid-cols-[7.5rem_8.5rem_4.5rem_4.5rem_9.5rem_9.5rem_4rem_5.5rem_8.5rem_8.5rem_11rem_2rem] items-center gap-x-3 px-4";
// keep in sync with the column tracks above (tracks + gaps + padding)
const MIN_W = "min-w-[94rem]";

export function FlightTable({
  legs,
  changes,
  warningsByLine,
}: {
  legs: FlightLeg[];
  changes: ChangeMap;
  warningsByLine: Map<number, string>;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: legs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 20,
  });

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
      <div
        className={cn(
          GRID,
          MIN_W,
          "sticky top-0 z-10 border-b bg-muted py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase",
        )}
      >
        {/* single-field columns take their header from LEG_FIELDS so the
            table and the rule editor always use the same names */}
        <span>Flight</span>
        <span>Sector</span>
        <span>{LEG_FIELDS.aircraftSTD.label}</span>
        <span>{LEG_FIELDS.aircraftSTA.label}</span>
        <span>{LEG_FIELDS.daysOfOperation.label}</span>
        <span>Period</span>
        <span>{LEG_FIELDS.aircraftType.label}</span>
        <span>{LEG_FIELDS.serviceType.label}</span>
        <span>{LEG_FIELDS.trafficRestriction.label}</span>
        <span>{LEG_FIELDS.salesConfig.label}</span>
        <span>{LEG_FIELDS.prbd.label}</span>
        <span />
      </div>
      <div
        className={cn("relative", MIN_W)}
        style={{ height: virtualizer.getTotalSize() }}
      >
          {virtualizer.getVirtualItems().map((row) => {
            const leg = legs[row.index];
            const warning = warningsByLine.get(leg.lineIndex);
            return (
              <div
                key={row.key}
                className={cn(
                  GRID,
                  "absolute top-0 left-0 w-full border-b border-border/50 font-mono text-[13px] hover:bg-muted/30",
                )}
                style={{
                  height: row.size,
                  transform: `translateY(${row.start}px)`,
                }}
              >
                <span className="flex gap-1.5 whitespace-nowrap">
                  <F leg={leg} field="airline" changes={changes} className="text-muted-foreground" />
                  <F leg={leg} field="flightNumber" changes={changes} className="font-medium" />
                  <F leg={leg} field="operationalSuffix" changes={changes} />
                </span>
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <F leg={leg} field="depStation" changes={changes} />
                  <span className="text-muted-foreground/50">–</span>
                  <F leg={leg} field="arrStation" changes={changes} />
                </span>
                <F leg={leg} field="aircraftSTD" changes={changes} />
                <F leg={leg} field="aircraftSTA" changes={changes} />
                {changes.has(changeKey(leg.lineIndex, "daysOfOperation")) ? (
                  <F leg={leg} field="daysOfOperation" changes={changes} />
                ) : (
                  <DaysStrip value={leg.values.daysOfOperation} />
                )}
                <span className="flex gap-1 whitespace-nowrap text-xs">
                  <F leg={leg} field="periodFrom" changes={changes} />
                  <span className="text-muted-foreground/50">–</span>
                  <F leg={leg} field="periodTo" changes={changes} />
                </span>
                <F leg={leg} field="aircraftType" changes={changes} />
                <F leg={leg} field="serviceType" changes={changes} className="text-muted-foreground" />
                <F leg={leg} field="trafficRestriction" changes={changes} />
                <F leg={leg} field="salesConfig" changes={changes} />
                <F leg={leg} field="prbd" changes={changes} className="truncate" />
                {warning ? (
                  <TriangleAlert
                    className="size-3.5 text-amber-600"
                    aria-label={warning}
                  />
                ) : (
                  <span />
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
