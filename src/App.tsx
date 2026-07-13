import { useEffect, useMemo, useState } from "react";
import { FileUp, FolderOpen, PlaneTakeoff, TriangleAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FlightTable, changeKey, type ChangeMap } from "@/components/FlightTable";
import { RulesPanel } from "@/components/RulesPanel";
import { basename, pickAndReadSsim, saveSsimAs } from "@/lib/file-io";
import { applyRules } from "@/rules/engine";
import { loadRules, saveRules } from "@/rules/storage";
import type { Change, Rule } from "@/rules/types";
import { LEG_FIELDS, type FlightLeg, type SsimFile } from "@/ssim/types";
import { parseSsim } from "@/ssim/parse";
import { serializeSsim } from "@/ssim/serialize";

const DRAWER_BATCH = 200;

function ChangesDrawer({
  applied,
}: {
  applied: { legs: FlightLeg[]; changes: Change[] };
}) {
  const [visible, setVisible] = useState(DRAWER_BATCH);
  const legByLine = useMemo(
    () => new Map(applied.legs.map((l) => [l.lineIndex, l])),
    [applied.legs],
  );
  const remaining = applied.changes.length - visible;

  return (
    <div className="max-h-52 overflow-y-auto border-t">
      <table className="w-full text-left font-mono text-xs">
        <thead className="sticky top-0 bg-muted/60 text-[10px] tracking-wider uppercase">
          <tr>
            <th className="px-4 py-1.5 font-semibold">Flight</th>
            <th className="px-2 py-1.5 font-semibold">Field</th>
            <th className="px-2 py-1.5 font-semibold">Before</th>
            <th className="px-2 py-1.5 font-semibold">After</th>
            <th className="px-2 py-1.5 font-semibold">Rule</th>
            <th className="px-2 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {applied.changes.slice(0, visible).map((c, i) => {
            const leg = legByLine.get(c.lineIndex);
            return (
              <tr key={i} className="border-t border-border/50">
                <td className="px-4 py-1">
                  {leg?.values.airline} {leg?.values.flightNumber}
                </td>
                <td className="px-2 py-1">{LEG_FIELDS[c.field].label}</td>
                <td className="px-2 py-1 text-muted-foreground line-through">
                  {c.before || "(blank)"}
                </td>
                <td className="px-2 py-1 font-semibold text-amber-700 dark:text-amber-400">
                  {c.after || "(blank)"}
                </td>
                <td className="px-2 py-1 text-muted-foreground">{c.ruleName}</td>
                <td className="px-2 py-1">
                  {c.warning && (
                    <span className="text-amber-600" title={c.warning}>
                      <TriangleAlert className="inline size-3" /> {c.warning}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {remaining > 0 && (
        <div className="border-t p-2 text-center">
          <Button
            variant="outline"
            size="xs"
            onClick={() => setVisible((v) => v + DRAWER_BATCH)}
          >
            Show {Math.min(DRAWER_BATCH, remaining).toLocaleString()} more (
            {remaining.toLocaleString()} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}

function App() {
  const [file, setFile] = useState<SsimFile | null>(null);
  const [filePath, setFilePath] = useState<string>("");
  const [rules, setRulesState] = useState<Rule[]>(loadRules);
  const [preview, setPreview] = useState(true);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const setRules = (next: Rule[]) => {
    setRulesState(next);
    saveRules(next);
  };

  // ponytail: dev-only harness — open http://localhost:1420/?demo in a plain
  // browser (no Tauri) to smoke-test the UI with fixture data. DCE'd in prod.
  useEffect(() => {
    if (!import.meta.env.DEV || !location.search.includes("demo")) return;
    import("@/ssim/fixture").then(({ makeSampleSsim }) => {
      setFile(parseSsim(makeSampleSsim()));
      setFilePath("/demo/sample.ssim");
      setRulesState([
        {
          id: "demo",
          name: "FCO departures on 32Q",
          enabled: true,
          conditions: [{ field: "depStation", op: "equals", value: "FCO" }],
          actions: [{ field: "aircraftType", kind: "setValue", value: "32Q" }],
        },
        {
          id: "demo2",
          name: "Add K restriction where none",
          enabled: true,
          conditions: [
            { field: "trafficRestriction", op: "isBlank", value: "" },
          ],
          actions: [
            { field: "trafficRestriction", kind: "setValue", value: "K" },
          ],
        },
      ]);
    });
  }, []);

  // Live preview: rules re-run on every change; original file is never touched.
  const applied = useMemo(
    () => (file ? applyRules(file.legs, rules) : null),
    [file, rules],
  );

  const changeMap: ChangeMap = useMemo(() => {
    const map: ChangeMap = new Map();
    for (const c of applied?.changes ?? [])
      map.set(changeKey(c.lineIndex, c.field), c);
    return map;
  }, [applied]);

  const warningsByLine = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of applied?.changes ?? [])
      if (c.warning) map.set(c.lineIndex, c.warning);
    return map;
  }, [applied]);

  const shownLegs = useMemo(() => {
    const legs = (preview ? applied?.legs : file?.legs) ?? [];
    const q = filter.trim().toUpperCase();
    if (!q) return legs;
    return legs.filter((l) =>
      [
        l.values.airline + l.values.flightNumber,
        l.values.airline + " " + l.values.flightNumber,
        l.values.depStation,
        l.values.arrStation,
        l.values.aircraftType,
      ].some((v) => v.includes(q)),
    );
  }, [file, applied, preview, filter]);

  const meta = useMemo(() => {
    if (!file || file.legs.length === 0) return null;
    const carriers = [...new Set(file.legs.map((l) => l.values.airline))];
    return { carriers: carriers.join(", "), count: file.legs.length };
  }, [file]);

  const openFile = async () => {
    try {
      const picked = await pickAndReadSsim();
      if (!picked) return;
      const parsed = parseSsim(picked.text);
      if (parsed.legs.length === 0) {
        setStatus({ kind: "error", text: "No flight leg (type 3) records found in that file." });
        return;
      }
      setFile(parsed);
      setFilePath(picked.path);
      setFilter("");
      setStatus(null);
    } catch (e) {
      setStatus({ kind: "error", text: `Couldn't open file: ${e instanceof Error ? e.message : e}` });
    }
  };

  const exportFile = async () => {
    if (!file || !applied) return;
    try {
      const text = serializeSsim(file, applied.legs);
      const path = await saveSsimAs(text, filePath);
      if (path)
        setStatus({
          kind: "info",
          text: `Exported ${applied.changes.length} change${applied.changes.length === 1 ? "" : "s"} to ${basename(path)}`,
        });
    } catch (e) {
      setStatus({ kind: "error", text: `Export failed: ${e instanceof Error ? e.message : e}` });
    }
  };

  const changeCount = applied?.changes.length ?? 0;
  const warningCount = warningsByLine.size;
  const fileName = basename(filePath);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b px-4 py-2.5">
        <PlaneTakeoff className="size-4.5 text-primary" aria-hidden />
        <h1 className="text-sm font-semibold tracking-tight">SSIM Editor</h1>
        {file && (
          <>
            <Badge variant="secondary" className="font-mono">{fileName}</Badge>
            {meta && (
              <span className="text-xs text-muted-foreground">
                {meta.count.toLocaleString()} legs · {meta.carriers}
              </span>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-3">
          {file && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Preview changes
              <Switch size="sm" checked={preview} onCheckedChange={setPreview} />
            </label>
          )}
          <Button variant="outline" size="sm" onClick={openFile}>
            <FolderOpen /> Open
          </Button>
          <Button size="sm" onClick={exportFile} disabled={!file}>
            <FileUp /> Export
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          {file ? (
            <>
              <div className="flex items-center gap-3 border-b px-4 py-2">
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter by flight, station, or equipment…"
                  className="h-7 max-w-72 text-sm"
                />
                {filter && (
                  <span className="text-xs text-muted-foreground">
                    {shownLegs.length.toLocaleString()} of {file.legs.length.toLocaleString()} legs
                  </span>
                )}
              </div>
              <FlightTable legs={shownLegs} changes={preview ? changeMap : new Map()} warningsByLine={preview ? warningsByLine : new Map()} />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <PlaneTakeoff className="size-10 text-muted-foreground/40" aria-hidden />
              <div className="text-center">
                <p className="font-medium">Open a schedule to get started</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Your original SSIM file is never modified — rules preview here
                  and export as a new file.
                </p>
              </div>
              <Button onClick={openFile}>
                <FolderOpen /> Open SSIM file
              </Button>
            </div>
          )}

          {file && drawerOpen && applied && changeCount > 0 && (
            <ChangesDrawer key={changeCount} applied={applied} />
          )}

          <footer className="flex items-center gap-4 border-t bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground">
            {file && (
              <button
                className="cursor-pointer font-medium hover:text-foreground disabled:cursor-default"
                onClick={() => setDrawerOpen((o) => !o)}
                disabled={changeCount === 0}
              >
                {changeCount === 0
                  ? "No changes"
                  : `${changeCount.toLocaleString()} change${changeCount === 1 ? "" : "s"} ${drawerOpen ? "▾" : "▴"}`}
              </button>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <TriangleAlert className="size-3" />
                {warningCount} warning{warningCount === 1 ? "" : "s"}
              </span>
            )}
            {status && (
              <span
                className={`ml-auto flex items-center gap-2 ${status.kind === "error" ? "text-destructive" : ""}`}
              >
                {status.text}
                <button onClick={() => setStatus(null)} aria-label="Dismiss" className="cursor-pointer">
                  <X className="size-3" />
                </button>
              </span>
            )}
          </footer>
        </main>

        <RulesPanel
          rules={rules}
          onChange={setRules}
          onError={(text) => setStatus({ kind: "error", text })}
        />
      </div>
    </div>
  );
}

export default App;
