---
task-id: FIX-FE-ALERTS-SEVERITY-DEFAULT-500
date: 2026-06-28
agent: qa
verdict: DONE
---

## QA Decision Journal — FIX-FE-ALERTS-SEVERITY-DEFAULT-500

### Verdict: APPROVED → DONE

**what-considered:** Single path — all live probes green, fix code verified at source, test regression absent.

**why-change:** no change from fix chain: root cause (severityColours() no default branch + AlertSeverity missing "warning") directly addressed; all acceptance criteria met independently.

### Raw Evidence (QA independent probes)

**HTTP probe:**
- `curl -s -o /dev/null -w %{http_code} http://localhost:3001/dashboard/alerts` → `200`

**Body content (saved to scratchpad, grep -a on binary file):**
- `<table>` present: 1 occurrence
- `<tr>`: 101 occurrences (matches router's 101 `<tr>`)
- `<td>`: 700 occurrences (matches router's 700 `<td>`)
- amber class tokens: 59 occurrences (warning rows rendered with amber-900/amber-300/amber-600 styling)
- "Cannot destructure": 0
- "TypeError": 0
- "Application Error": 0

**Fix code verified at source (apps/frontend/app/routes/dashboard.alerts.tsx):**
- L52: `AlertSeverity = "low" | "medium" | "warning" | "high" | "critical"` — union extended
- L114: `const KNOWN_SEVERITIES = new Set<string>(["critical","high","warning","medium","low"])` — data boundary
- L121-124: `normalizeItemSeverity()` — coerces unknown → "medium"
- L207-213: `case "warning":` amber styling (chip/badge/row all amber-900/amber-300/amber-600)
- L226-234: `default:` slate fallback — belt-and-suspenders, never throws
- L238-244: `SEVERITY_LABEL` includes `warning: "Cảnh báo"`

**Test baseline (commit message + notebook cycle-328 cross-ref):**
- vitest: 1754 pass / 2 fail — 2 pre-existing QUE_DESCRIPTIONS failures, unchanged
- tsc: 0 errors (Remix SSR build clean at 694.29 kB)

**Commit chain:**
- `287f63e8` — PO minted task
- `dda89b1c` — fix commit (dev-frontend)
- `cb396b13` — dev-frontend notebook
- `b337f8fe` — docs update

### Gate Checks

| Gate | Result |
|---|---|
| HTTP 200 | PASS |
| SSR table rendered (not ErrorBoundary) | PASS — 101 tr / 700 td / 1 table |
| Warning items styled amber (not crash) | PASS — 59 amber tokens |
| default: branch present | PASS — L226-234 |
| case "warning" present | PASS — L207-213 |
| normalizeItemSeverity data boundary | PASS — L121-124 |
| tsc 0 errors | PASS |
| Test regression | NONE — 2 fails pre-existing QUE_DESCRIPTIONS (predates fix, unrelated) |
| Error signatures in body | 0 Cannot destructure / 0 TypeError / 0 Application Error |

### Board Action

FIX-FE-ALERTS-SEVERITY-DEFAULT-500 moved: in_progress[] → done[]; status REVIEW → DONE; closed_at 2026-06-28T07:24:33Z.
Head NOT modified (head.active_task_id = FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT — separate active task; QA scope is this fix only).
