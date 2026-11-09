import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

function sourceFiles(dir = "src") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = `${dir}/${name}`;
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}
const files = sourceFiles();

const HEAVY = ["xlsx", "jspdf", "jspdf-autotable", "recharts"];
// A normal (value) import, not `import type`.
const staticImportOf = (lib) => new RegExp(`^import\\s+(?!type\\b)[^;]*?from\\s+["']${lib}["']`, "m");

/** Files allowed to import a heavy library at the top, and why. */
const ALLOWED = new Map([
  ["src/components/analytics/AnalyticsTrendChart.tsx", "it is only ever loaded through the lazy import in AnalyticsPanel"],
  ["src/components/ui/chart.tsx", "nothing imports it (a test below checks), so it never reaches a bundle"],
]);

test("the big libraries are not imported at the top of any file, except the two named with a reason", () => {
  const offenders = [];
  for (const p of files) {
    const src = read(p);
    for (const lib of HEAVY) if (staticImportOf(lib).test(src) && !ALLOWED.has(p)) offenders.push(`${p} -> ${lib}`);
  }
  assert.deepEqual(offenders, []);
  for (const p of ALLOWED.keys()) assert.ok(files.includes(p), `${p} still exists`);
});

test("the exceptions really are only reached lazily or not at all", () => {
  const importers = (needle) => files.filter((p) => read(p).includes(needle));
  assert.deepEqual(importers('@/components/ui/chart"'), [], "nothing imports ui/chart");
  const trend = importers("AnalyticsTrendChart").filter((p) => !p.endsWith("AnalyticsTrendChart.tsx"));
  assert.deepEqual(trend, ["src/components/analytics/AnalyticsPanel.tsx"]);
  const panel = read("src/components/analytics/AnalyticsPanel.tsx");
  assert.doesNotMatch(panel, /^import \{[^}]*AnalyticsTrendChart[^}]*\} from/m, "no top-level import of the chart");
  assert.match(panel, /lazy\(\(\) => import\("\.\/AnalyticsTrendChart"\)/);
});

test("the chart shows a placeholder while it loads, and the rest of the dashboard does not wait for it", () => {
  const panel = read("src/components/analytics/AnalyticsPanel.tsx");
  assert.match(panel, /<Suspense fallback=\{<Skeleton[^>]*\/>\}>\s*<AnalyticsTrendChart trend=\{data\.trend\} \/>\s*<\/Suspense>/);
  // The department list is a sibling, outside the Suspense boundary.
  assert.ok(panel.indexOf("</Suspense>") < panel.indexOf("<AnalyticsDepartments"));
});

test("the export helpers load their libraries when a file is asked for, and not before", () => {
  const src = read("src/lib/exporters.ts");
  assert.doesNotMatch(src, /^import /m, "no imports at the top");
  for (const fn of ["exportToExcel", "exportToCSV", "exportToPDF"]) {
    assert.match(src, new RegExp(`export async function ${fn}\\(`), `${fn} is async`);
  }
  assert.equal((src.match(/await import\("xlsx"\)/g) ?? []).length, 2, "Excel and CSV load the spreadsheet library");
  assert.match(src, /import\("jspdf"\)/);
  assert.match(src, /import\("jspdf-autotable"\)/);
});

test("History waits for the file, and says so if it cannot be made", () => {
  const src = read("src/routes/_authenticated/history.tsx");
  assert.match(src, /const runExport = async \(make: \(\) => Promise<void>\)/);
  assert.match(src, /Could not create the file\. Please try again\./);
  for (const call of ["exportToCSV(", "exportToExcel(", "exportToPDF("]) {
    const at = src.indexOf(call, src.indexOf("const handleExportCSV"));
    assert.ok(at > 0, call);
    assert.ok(src.slice(Math.max(0, at - 30), at).includes("runExport(() => "), `${call} runs inside runExport`);
  }
  assert.doesNotMatch(src, /^\s+exportTo(CSV|Excel|PDF)\(/m, "no export is started without waiting for it");
});

test("the files the timesheet and reports make also load their libraries on demand", () => {
  assert.match(read("src/components/timesheet/TimesheetView.tsx"), /import\("@\/lib\/timesheet-files"\)/);
  assert.match(read("src/lib/timesheet-files.ts"), /import\("jspdf"\)/);
  assert.match(read("src/lib/report-export.ts"), /import\("jspdf"\)/);
});
