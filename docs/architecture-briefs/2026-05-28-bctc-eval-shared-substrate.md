# Architecture Brief — BCTC-EVAL-SUBSTRATE
## Shared Per-PDF Extraction Evaluation Framework

**Sprint:** BCTC-EVAL-SUBSTRATE
**Date:** 2026-05-28
**Author:** architect
**Status:** DESIGN COMPLETE — awaiting G1 review

---

## §1 PROBLEM — Why FE-only or Agent-only Fails

### Current state

The 6-stage BCTC extraction pipeline (RASTERIZE → LAYOUT_DETECT → OCR → TABLE_RECONSTRUCT → MARKDOWN_RENDER → STRUCTURED_EXTRACT) produces no per-stage quality signal. The only persistent quality artifact is `bctc_balance_checks.balance_pass`, which has been confirmed as a false-gate 5 times (memory: `project_bctc_table_sprint`). Agents and the inspector surface receive zero structured trust metadata; they infer quality from absence of errors (the false-green pattern).

### Why two separate systems both fail

**FE-only evaluation (e.g. extending bctc-inspect viewer):** Human spot-check is not a gate. A developer visually confirming "looks OK" on the FPT sentinel does not prevent a qa agent from marking a sprint DONE on a 🔴 report. FE is a debugging aid, not a trust enforcer. Memory `feedback_trust_verification_is_system_job` is explicit: agents are the trust verifier.

**Agent-only evaluation (e.g. each agent re-running detectors on demand):** Three problems. (1) Redundant compute — every consumer re-runs the same expensive OCR analysis. (2) No shared denominator — qa may compute different thresholds than financial-analyst, creating split verdicts. (3) No human visibility — ops cannot see the fleet eval state without querying raw tables they do not own.

### Why shared substrate

One canonical `bctc_eval_results` table (6 rows per PDF, one per stage) written at extraction time, served via two versioned endpoints, read by both FE (spot-check) and all agents (hard-gate). Single JSON contract. Single thresholds SSOT. Version tag on every row enables stale-detection and nightly recompute.

---

## §2 ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────────────┐
│  apps/pdf-extractor  (WRITE path)                                    │
│                                                                      │
│  Stage 1-3 detectors (rasterize / layout / OCR)                      │
│    domain/eval_detectors.py ──metrics_json──►  POST /api/push-bctc-eval
│                                                  (mcp-server)        │
│  Stage 4-6 detectors called by mcp-server push handlers              │
│    (TABLE_RECONSTRUCT, MARKDOWN_RENDER, STRUCTURED_EXTRACT)          │
│    written in-process after data arrives via existing push routes     │
└───────────────────────────────────┬──────────────────────────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │   apps/mcp-server              │
                    │                                │
                    │   bctc_eval_results (SQLite)   │
                    │   6 rows × N reports            │
                    │                                │
                    │   GET /api/bctc-eval           │  ◄── FE (list)
                    │   GET /api/bctc-eval/{id}      │  ◄── FE (detail) + agents
                    │   POST /api/bctc-eval/recompute│  ◄── nightly cron
                    └───────────────────────────────┘
                             │                │
               ┌─────────────┘                └──────────────────┐
               │                                                  │
    ┌──────────▼──────────────┐              ┌────────────────────▼────┐
    │  apps/frontend           │              │  Agent consumers         │
    │  (Remix dashboard)       │              │                          │
    │                          │              │  qa — hard-gate DONE     │
    │  /dashboard/bctc-eval    │              │  system-auditor — sweep  │
    │  /dashboard/bctc-eval/$  │              │  financial-analyst — skip│
    │  (human spot-check only) │              │  report-analyzer — pill  │
    └──────────────────────────┘              │  dev-pdf-extractor — reg │
                                              │  ops — fleet OCR alert   │
                                              └──────────────────────────┘
```

**Threshold SSOT:** `docs/data/bctc-eval-thresholds.json` — read by both detector code (Python) and FE loader (via mcp-server endpoint that exposes it, or Remix loader calling the same file). No hardcoded numbers anywhere.

---

## §3 SCHEMA — `bctc_eval_results`

New table added to `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` (additive migration pattern, existing tables untouched).

```sql
CREATE TABLE IF NOT EXISTS bctc_eval_results (
  report_id         TEXT    NOT NULL,
  stage_no          INTEGER NOT NULL,   -- 1..6
  stage_name        TEXT    NOT NULL,   -- 'RASTERIZE' | 'LAYOUT_DETECT' | 'OCR'
                                        -- | 'TABLE_RECONSTRUCT' | 'MARKDOWN_RENDER'
                                        -- | 'STRUCTURED_EXTRACT'
  status            TEXT    NOT NULL    CHECK(status IN ('green','yellow','red')),
  metrics_json      TEXT    NOT NULL DEFAULT '{}',
  gate_failures_json TEXT   NOT NULL DEFAULT '[]',
  golden_diff_json  TEXT    NOT NULL DEFAULT '{}',
  detector_version  TEXT    NOT NULL DEFAULT 'v1',
  computed_at       TEXT    NOT NULL DEFAULT (datetime('now')),

  PRIMARY KEY (report_id, stage_no),

  CONSTRAINT fk_report
    FOREIGN KEY (report_id) REFERENCES financial_reports(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ber_report ON bctc_eval_results(report_id);
CREATE INDEX IF NOT EXISTS idx_ber_status ON bctc_eval_results(status, stage_no);
CREATE INDEX IF NOT EXISTS idx_ber_version ON bctc_eval_results(detector_version, computed_at);
```

### Column contracts

| Column | Contract |
|---|---|
| `report_id` | UUID FK → `financial_reports.id`. Part of composite PK. |
| `stage_no` | Integer 1–6 matching pipeline order. Part of composite PK. |
| `stage_name` | Canonical string. Enum enforced in application layer, not DB constraint (avoids migration on stage rename). |
| `status` | Three-value: `green` = all gates pass, `yellow` = soft warnings only, `red` = at least one hard gate fails. |
| `metrics_json` | Stage-specific key/value bag. Structure defined per stage in §4. |
| `gate_failures_json` | Array of `{gate_id, threshold, actual, provenance}` objects. Empty array when `status=green`. |
| `golden_diff_json` | Diff against golden fixture. Empty object when no golden defined for this stage/report. |
| `detector_version` | Semver-like string `"v1"`, `"v2"`, etc. Incremented when threshold file or detector logic changes. Used to detect stale rows. |
| `computed_at` | ISO-8601 UTC timestamp. Used by FE "Recompute" button logic and nightly staleness check. |

### Upsert pattern

`INSERT OR REPLACE INTO bctc_eval_results (report_id, stage_no, ...)` — full row replacement on recompute. No soft-delete. No history table (git history is the audit log).

---

## §4 JSON CONTRACT

### Endpoint shapes

#### `GET /api/bctc-eval` — list all reports with summary

```json
{
  "schema_version": "1",
  "generated_at": "2026-05-28T08:00:00Z",
  "reports": [
    {
      "report_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65",
      "ticker": "FPT",
      "period": "Q4-2025",
      "overall_status": "green",
      "stage_statuses": {
        "1_RASTERIZE": "green",
        "2_LAYOUT_DETECT": "green",
        "3_OCR": "green",
        "4_TABLE_RECONSTRUCT": "green",
        "5_MARKDOWN_RENDER": "green",
        "6_STRUCTURED_EXTRACT": "yellow"
      },
      "detector_version": "v1",
      "computed_at": "2026-05-28T07:00:00Z",
      "is_stale": false
    }
  ],
  "sort": "trust_ascending",
  "thresholds_version": "v1"
}
```

`overall_status` = worst of the 6 stage statuses (red > yellow > green). List sorted by `overall_status` trust-ascending (red first, then yellow, then green) so worst PDFs surface immediately.

`is_stale` = `detector_version` on ANY row for this report does not match the current `DETECTOR_VERSION` constant in the deployed server.

#### `GET /api/bctc-eval/{report_id}` — full detail for one report

```json
{
  "schema_version": "1",
  "report_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65",
  "ticker": "FPT",
  "period": "Q4-2025",
  "overall_status": "green",
  "has_pek": true,
  "stages": [
    {
      "stage_no": 1,
      "stage_name": "RASTERIZE",
      "status": "green",
      "metrics": {
        "page_count_pdf": 46,
        "page_count_rasterized": 46,
        "sha_stable": true
      },
      "gate_failures": [],
      "golden_diff": {},
      "detector_version": "v1",
      "computed_at": "2026-05-28T07:00:00Z"
    },
    {
      "stage_no": 2,
      "stage_name": "LAYOUT_DETECT",
      "status": "green",
      "metrics": {
        "golden_table_count": 23,
        "detected_table_count": 23,
        "abandon_rate": 0.0,
        "median_conf": 0.91
      },
      "gate_failures": [],
      "golden_diff": {},
      "detector_version": "v1",
      "computed_at": "2026-05-28T07:00:00Z"
    },
    {
      "stage_no": 3,
      "stage_name": "OCR",
      "status": "green",
      "metrics": {
        "vn_diacritic_ratio": 0.38,
        "numeric_ratio_in_tables": 0.52,
        "anchor_phrases_found": ["TỔNG CỘNG TÀI SẢN", "LỢI NHUẬN SAU THUẾ"],
        "anchor_phrases_missing": []
      },
      "gate_failures": [],
      "golden_diff": {},
      "detector_version": "v1",
      "computed_at": "2026-05-28T07:00:00Z"
    },
    {
      "stage_no": 4,
      "stage_name": "TABLE_RECONSTRUCT",
      "status": "green",
      "metrics": {
        "label_coverage": 0.97,
        "code_coverage": 0.94,
        "exact_dup_count": 0,
        "value_blank_label_count": 0,
        "total_rows": 312
      },
      "gate_failures": [],
      "golden_diff": {},
      "detector_version": "v1",
      "computed_at": "2026-05-28T07:00:00Z"
    },
    {
      "stage_no": 5,
      "stage_name": "MARKDOWN_RENDER",
      "status": "green",
      "metrics": {
        "roundtrip_row_match_ratio": 0.99,
        "roundtrip_value_drift_max": 0.0
      },
      "gate_failures": [],
      "golden_diff": {},
      "detector_version": "v1",
      "computed_at": "2026-05-28T07:00:00Z"
    },
    {
      "stage_no": 6,
      "stage_name": "STRUCTURED_EXTRACT",
      "status": "yellow",
      "metrics": {
        "golden_row_match_ratio": 0.95,
        "balance_pass": true,
        "balance_pass_is_signal_only": true,
        "qoq_outlier_flags": ["net_profit_qoq: +340%"]
      },
      "gate_failures": [],
      "golden_diff": {
        "missing_rows": ["code_230"],
        "extra_rows": []
      },
      "detector_version": "v1",
      "computed_at": "2026-05-28T07:00:00Z"
    }
  ],
  "detector_version": "v1",
  "is_stale": false
}
```

**Schema lock:** `schema_version: "1"`. Breaking changes require incrementing. Consumers must check `schema_version` before parsing.

**Both FE and agents consume this identical JSON** — no separate agent-only or FE-only shape.

#### `GET /api/bctc-eval/thresholds` — expose SSOT to FE

```json
{
  "schema_version": "1",
  "detector_version": "v1",
  "thresholds": { ... }
}
```

Returns the contents of `docs/data/bctc-eval-thresholds.json`. FE Remix loader calls this once on mount. Agents load from the file directly.

---

## §5 THRESHOLDS SSOT — `docs/data/bctc-eval-thresholds.json`

New file. **No numbers hardcoded anywhere else.** Detectors import from this file (Python reads JSON). FE reads via `/api/bctc-eval/thresholds`. Detector code and FE both treat this as read-only at runtime.

```json
{
  "schema_version": "1",
  "detector_version": "v1",
  "stages": {
    "1_RASTERIZE": {
      "page_count_tolerance": 0,
      "sha_stability_required": true
    },
    "2_LAYOUT_DETECT": {
      "golden_table_count_exact": true,
      "abandon_rate_max": 0.20,
      "median_conf_min": 0.70
    },
    "3_OCR": {
      "vn_diacritic_ratio_min": 0.30,
      "numeric_ratio_in_tables_min": 0.40,
      "required_anchor_phrases": [
        "TỔNG CỘNG TÀI SẢN",
        "LỢI NHUẬN SAU THUẾ"
      ]
    },
    "4_TABLE_RECONSTRUCT": {
      "label_coverage_min": 0.90,
      "code_coverage_min": 0.80,
      "exact_dup_max": 0,
      "value_blank_label_max": 0
    },
    "5_MARKDOWN_RENDER": {
      "roundtrip_row_match_min": 0.95,
      "roundtrip_value_drift_max": 0.01
    },
    "6_STRUCTURED_EXTRACT": {
      "golden_row_match_min": 0.90,
      "balance_pass_is_signal_only": true,
      "qoq_outlier_threshold": 2.0
    }
  },
  "status_rules": {
    "red": "any hard gate fails",
    "yellow": "soft warnings only (balance_pass=false, qoq_outlier, golden_diff non-empty but within tolerance)",
    "green": "all hard gates pass, no warnings"
  }
}
```

**Balance pass is SIGNAL not gate:** `"balance_pass_is_signal_only": true` encodes the lesson from 5 false-greens. No detector may mark stage 6 red solely because `balance_pass=false`. It is flagged in `metrics_json` as informational.

---

## §6 HYBRID COMPUTE — Write-at-Extraction + Versioned Recompute

### Write at extraction time

When a stage completes (pdf-extractor pushes stage 1-3 results, mcp-server evaluates stages 4-6 immediately after push handlers write tables), the eval row is computed and inserted/replaced in `bctc_eval_results`. This means reads from the eval endpoints are instant (no on-demand compute).

### Staleness detection

Every row carries `detector_version`. At server startup, mcp-server reads `DETECTOR_VERSION` from `docs/data/bctc-eval-thresholds.json`. A row is stale if its `detector_version` != current `DETECTOR_VERSION`. The list endpoint computes `is_stale` per report and exposes it.

### FE "Recompute" button

The detail route (`/dashboard/bctc-eval/$reportId`) shows a "Recompute" button when `is_stale: true` for any stage. The button POSTs to `POST /api/bctc-eval/recompute/{report_id}`. The server synchronously re-runs all 6 detectors for that report and returns the updated eval JSON (HTTP 200 with the new full detail shape). No queueing needed for single-report recompute — detectors are fast (no re-extraction, only re-evaluation of stored DB rows).

### Nightly cron recompute

A new cron job (`bctcEvalRecomputeJob`) runs at `2 22 * * *` (22:02 UTC = off-market). It sweeps all reports where any row's `detector_version` != current version and recomputes. Uses `wrapRun()` pattern from `startScheduler.ts`. No market-hours guard needed (reads only stored DB data, no extraction).

---

## §7 ENDPOINTS

### Route table

| Method | Path | Handler | Response codes |
|---|---|---|---|
| `GET` | `/api/bctc-eval` | `bctcEvalListHandler` | `200` list / `500` server error |
| `GET` | `/api/bctc-eval/{report_id}` | `bctcEvalDetailHandler` | `200` detail / `400` invalid UUID / `404` report not found / `409` eval not yet computed |
| `POST` | `/api/bctc-eval/recompute/{report_id}` | `bctcEvalRecomputeHandler` | `200` recomputed / `400` invalid UUID / `404` report not found / `503` extraction running |
| `GET` | `/api/bctc-eval/thresholds` | `bctcEvalThresholdsHandler` | `200` thresholds JSON / `500` file unreadable |

**Status code reasoning:**
- `400` for invalid UUID input (client error — malformed request).
- `404` for unknown report_id (resource not found).
- `409 Conflict` for "eval not yet computed" — the report exists but the eval rows do not. `409` communicates "resource exists but is in a conflicting state" per RFC 9110. Not `404` (report IS found in `financial_reports`). Not `202` (we are not async).
- `503 Service Unavailable` on recompute when an extraction is actively running (market-hours guard: 02:00–08:59 UTC Mon–Fri). Includes `Retry-After` header.

### Error contract

All error responses use:
```json
{
  "error": "human-readable message",
  "code": "INVALID_UUID | REPORT_NOT_FOUND | EVAL_NOT_COMPUTED | EXTRACTION_RUNNING"
}
```

### Route registration in `server.ts`

New routes registered in the same `handleRequest` switch block as existing `/api/bctc-inspect/*` routes. Pattern identical to `bctcInspectHandler.ts`. DI: `db` injected by caller; thresholds file path resolved via `projectRoot.ts`.

---

## §8 FRONTEND SURFACE

### Q2 Resolution: FE location

**Decision: Remix dashboard at `apps/frontend/`.**

Rationale:
- `apps/mcp-server/dashboard/` is a static HTML/JS + Playwright page. It has no component framework, no typed fetchers, no Tailwind, no shadcn/ui. Adding a multi-stage scorecard there requires rebuilding the entire component tree in vanilla JS — same work, worse outcome.
- `apps/frontend/` is a full Remix app with Tailwind (confirmed in `tailwind.config.ts`), `@radix-ui/react-slot` installed (the shadcn/ui peer dep), `lucide-react` installed, and `class-variance-authority` + `clsx` + `tailwind-merge` (the full shadcn/ui utility stack). The scaffolding exists.
- The existing BCTC inspector lives at the mcp-server HTML dashboard (`GET /api/bctc-inspect`). The eval surface is a NEW capability (quality scorecard), not an extension of the inspector viewer. They serve different needs and different audiences: inspector = dev debugging single-PDF content; eval = fleet-wide quality gate visibility for devs AND agents.
- No duplication: inspector remains at mcp-server's `/api/bctc-inspect`, eval lives at Remix's `/dashboard/bctc-eval`. Cross-links are nav items.

### shadcn/ui note

The frontend has `@radix-ui/react-slot`, CVA, clsx, and tailwind-merge installed (confirmed from `package.json`). It does NOT have the full shadcn/ui CLI components directory (no `components/ui/` found). Dev-frontend must install the specific components via `npx shadcn@latest add table card badge collapsible` before implementing. This is a one-time setup step dev-frontend owns.

### Route definitions

```
apps/frontend/app/routes/
  dashboard.bctc-eval._index.tsx   — list view  (maps to /dashboard/bctc-eval)
  dashboard.bctc-eval.$reportId.tsx — detail view (maps to /dashboard/bctc-eval/:reportId)
```

Remix flat-file routing: `dashboard.bctc-eval._index.tsx` renders inside the existing `dashboard.tsx` layout (inherits the nav bar automatically).

### Nav entry

Add to `NAV_ITEMS` in `apps/frontend/app/routes/dashboard.tsx`:
```typescript
{ to: "/dashboard/bctc-eval", label: "BCTC Eval" }
```

### List view — `/dashboard/bctc-eval`

- Remix `loader` calls `GET /api/bctc-eval` (mcp-server base URL from env).
- shadcn `Table` with columns: Ticker | Period | Overall Status | Stage breakdown (6 badge columns) | Computed At | Stale.
- Row sort: red first, yellow second, green last (trust-ascending — worst PDFs surface immediately).
- Status badges: `Badge variant="destructive"` for red, `Badge variant="outline"` for yellow, `Badge variant="default"` for green.
- Stale row: shows "Recompute" button in last column. Button POSTs to `/api/bctc-eval/recompute/{report_id}` and reloads.
- Error state: if mcp-server unreachable, show static error card (not throw).

### Detail view — `/dashboard/bctc-eval/:reportId`

- Remix `loader` calls `GET /api/bctc-eval/{reportId}`.
- `404` from API → Remix `Response("Not Found", {status: 404})`.
- `409` from API → shows "Eval not yet computed" Card with instructions.
- Six `Card` components (one per stage), arranged vertically.
- Each card: title = `Stage N — STAGE_NAME`, header badge = status color, body = `Collapsible` with `metrics` key/value table + `gate_failures` list (red text when non-empty) + `golden_diff` when non-empty.
- "Recompute" button in page header (shown when `is_stale: true`).

---

## §9 AGENT CONTRACTS

### qa agent

**Contract:** Before marking any BCTC sprint task DONE, qa calls `GET /api/bctc-eval/{report_id}` for every report touched in the sprint. If `overall_status = "red"` for any report, qa MUST refuse DONE and write `BLOCKED: stage N red — <gate_failures summary>` in the handoff. If `overall_status = "yellow"` for any report, qa flags it in the handoff as `CAUTION: yellow eval — <stage names>` but does not block.

**Encode in:** `docs/agents/qa/flow/main.md` — add step after existing "run tests" step: "Call GET /api/bctc-eval for each BCTC report_id in task scope. Block on red. Flag yellow."

### system-auditor agent

**Contract:** Nightly sweep. Calls `GET /api/bctc-eval`. For each report where status changed since last sweep (compare against previous snapshot in notebook), posts a delta message to WORK Telegram and updates `DASHBOARD.md` per signal-dashboard skill. Alert format: `[BCTC-EVAL] FPT Q4-2025: stage 3 green→yellow (vn_diacritic_ratio dropped to 0.28)`.

**Encode in:** `docs/agents/system-auditor/flow/main.md`.

### financial-analyst agent

**Q1 Resolution: DEMOTE, not HARD-BLOCK.**

**Decision:** financial-analyst demotes citations from red reports (cite with prominent warning), rather than hard-blocking. Hard-block makes financial-analyst useless for the exact PDFs that are broken — which is also when the user most needs any signal, even imperfect. The risk of citing wrong numbers (demote path) is mitigated by the prominent `[BAIXA CONFIANÇA — EXTRAÇÃO VERMELHA]` inline warning. Hard-block risks silent data gaps that look like "no data" rather than "bad data." A known-bad citation is more honest than silence.

**Contract:** Before citing any BCTC figure, financial-analyst calls `GET /api/bctc-eval/{report_id}`. If `overall_status = "red"`: cite with prefix `[BAIXA CONFIANÇA — EXTRAÇÃO VERMELHA stage N]`. If `overall_status = "yellow"`: cite with inline `[baixa confiança]` flag. If green: cite normally.

**Encode in:** `docs/agents/financial-analyst/flow/main.md`.

### report-analyzer agent

**Contract:** Every WORK notebook entry that references a BCTC report includes a one-line eval pill: `BCTC-EVAL: FPT Q4-2025 = 🟢 (all 6 stages green, v1, 2026-05-28)` or `🟡 (stage 6 yellow)` or `🔴 (stage 4 red — label_coverage: 0.72)`.

**Encode in:** `docs/agents/report-analyzer/flow/main.md`.

### dev-pdf-extractor agent

**Contract:** When investigating a BCTC extraction failure, read `gate_failures_json` from the relevant stage row in `GET /api/bctc-eval/{report_id}` as the regression test set. Each `gate_id` in `gate_failures_json` corresponds to a named detector gate; it is the failing AC to target.

**Encode in:** `docs/agents/dev-pdf-extractor/flow/main.md`.

### ops agent

**Contract:** Fleet-wide OCR regression alert. If system-auditor sweep reports that `3_OCR.vn_diacritic_ratio` dropped below threshold for 3+ reports simultaneously, ops treats it as a model/library regression. Diagnostic: check PaddleOCR version in running container, compare to `requirements-pek.txt`, check for accidental base image update.

**Encode in:** `docs/agents/ops/flow/main.md`.

---

## §10 MIGRATION / BACKFILL

### One-shot backfill script

**Location:** `apps/mcp-server/src/interface/mcp/routes/bctcEvalBackfillRunner.ts`

**Trigger:** Ops runs once after table migration lands: `docker exec <mcp-server-container> bun run src/interface/mcp/routes/bctcEvalBackfillRunner.ts`

**What it does:**

1. Queries `SELECT id, ticker, period FROM financial_reports ORDER BY parsed_at ASC` — all 14 reports.
2. For each `report_id`, runs all 6 stage detectors against existing stored data:
   - Stage 1: reads `pdf_extracted_text` page count, compares to `financial_reports.page_count` if present.
   - Stage 2: reads `bctc_layout_units` count and `bctc_page_zones` confidence fields.
   - Stage 3: reads `pdf_extracted_text.text_content` for diacritic ratio + anchor phrase presence.
   - Stage 4: reads `bctc_table_rows` for label/code coverage, dups, blank-label rows.
   - Stage 5: reads `bctc_md_tables.md_tables_json` for round-trip drift computation.
   - Stage 6: reads `financial_reports` scalar columns for golden-row match ratio, balance_pass as signal.
3. Writes 6 rows per report to `bctc_eval_results` with `detector_version = "v1"`.
4. Logs: `BACKFILL: {ticker} {period} — stages 1-6 written, status={overall_status}`.

**Constraints:**
- PEK subtree NOT touched: `git -C apps/pdf-extractor/PDF-Extract-Kit diff` MUST be EMPTY.
- Existing extractions NOT re-run. Detectors read from already-stored rows only.
- `has_pek: true` flag on FPT Q4-2025 sentinel `e71f845d-ffa5-48f9-8f09-30ac2cd09c65` MUST remain after backfill. The backfill writes `bctc_eval_results` only — no mutation of `financial_reports`, `bctc_layout_units`, or `bctc_page_zones`.

### Verify backfill integrity

```bash
docker exec <mcp-server> bun -e "
  const { Database } = await import('bun:sqlite');
  const db = new Database('/app/data/market.db', { readonly: true });
  const rows = db.query('SELECT report_id, COUNT(*) as cnt FROM bctc_eval_results GROUP BY report_id').all();
  console.log(JSON.stringify(rows, null, 2));
  const fpt = db.query(\"SELECT * FROM bctc_eval_results WHERE report_id = 'e71f845d-ffa5-48f9-8f09-30ac2cd09c65'\").all();
  console.log('FPT sentinel eval rows:', fpt.length, '(expect 6)');
"
```

---

## §11 MVP ORDER

1. **FPT Q4-2025 sentinel golden** — dev-pdf-extractor creates `apps/pdf-extractor/domain/eval_detectors.py` with stage 1-3 detector functions + golden fixture for FPT sentinel. No DB writes yet — pure function verification.
2. **Per-stage manifests emitted by extraction** — extraction hook in `apps/pdf-extractor/application/extract_layout_first_usecase.py` calls stage detectors after each stage and packages `metrics_json` + `gate_failures_json`.
3. **Stage 4 detectors** (highest-value, most-burned) — `bctcEvalDetectors.ts` in mcp-server, called from `pushBctcTableHandler.ts` after write.
4. **Round-trip drift stage 5** — called from `pushBctcMdTablesHandler.ts`.
5. **Table + endpoints** — schema migration + `bctcEvalListHandler.ts` + `bctcEvalDetailHandler.ts`.
6. **FE list view** — Remix `dashboard.bctc-eval._index.tsx`.
7. **FE detail view** — Remix `dashboard.bctc-eval.$reportId.tsx`.
8. **qa hard-gate hook** — update `docs/agents/qa/flow/main.md`.
9. **system-auditor sweep** — update `docs/agents/system-auditor/flow/main.md`.
10. **Nightly recompute cron** — `bctcEvalRecomputeJob.ts` + cron registration.
11. **Other agent consumers** — financial-analyst, report-analyzer, dev-pdf-extractor, ops flow updates.

---

## §12 HARD CONSTRAINTS CHECKLIST

- NO branches — all work on `main`.
- Scoped `git add` per file. NEVER `-A`. Pre-existing unrelated changes MUST NOT be staged.
- PEK subtree pristine: `git -C apps/pdf-extractor/PDF-Extract-Kit diff` MUST be EMPTY at every commit.
- Market-hours guard intact: `CRON_BCTC_REPARSE_JOB=0 21 * * *` + HTTP 503 guard on `/pek-extract` (02:00–08:59 UTC Mon–Fri). The new `/api/bctc-eval/recompute` endpoint also returns 503 during extraction window (reads only, but avoids race with active extraction updating the rows being evaluated).
- CPU-only, 8GB Docker cap, no paddlepaddle-gpu/lmdeploy/struct-eqtable.
- Frozen files UNTOUCHED: `text_table_extractor.py`, `sandbox/runner.py`, `pilot-status-pdf-extractor.json`, `generic_md_table_extractor.py`.
- REBUILD not restart: ops runs `docker compose build --build-arg GIT_SHA=$(git rev-parse HEAD) mcp-server` then `up -d --no-deps --force-recreate mcp-server`. pdf-extractor rebuild only if detector code lands there.
- QA verifies via DIRECT market.db COUNT in-container: `docker exec <mcp-server> bun -e "..."` (bun:sqlite, no sqlite3).
- FPT Q4-2025 sentinel `e71f845d-ffa5-48f9-8f09-30ac2cd09c65` regression anchor: `has_pek: true` MUST remain after backfill. Verified by qa reading `bctc_layout_units` count for this report_id (not backfill rows).
- Thresholds SSOT in `docs/data/bctc-eval-thresholds.json` — NO hardcoded numbers in detector code or FE.
- `feedback_trust_verification_is_system_job` honored: agents are the trust verifier (hard-gate DONE on red), FE is human spot-check only.
- `balance_pass` is SIGNAL not gate — encoded in thresholds JSON and enforced by code review gate.

---

## §13 DDD LAYER ASSIGNMENT

### Q3 Resolution: Detector location

**Decision: `apps/pdf-extractor/domain/eval_detectors.py` for stages 1-3. `apps/mcp-server/src/domain/services/bctcEvalDetectors.ts` for stages 4-6.**

Rationale:
- Stages 1-3 (RASTERIZE, LAYOUT_DETECT, OCR) evaluate artifacts that exist ONLY on the pdf-extractor side: rasterized PNG files, PaddleOCR layout units, OCR text confidence. These detectors MUST run on the pdf-extractor host where the artifacts are computed. Placing them in mcp-server would require mcp-server to reach into pdf-extractor's filesystem — a severe DDD violation and a coupling that would break the bind-mount separation.
- Stages 4-6 (TABLE_RECONSTRUCT, MARKDOWN_RENDER, STRUCTURED_EXTRACT) evaluate data that already exists in mcp-server's `market.db` (`bctc_table_rows`, `bctc_md_tables`, `financial_reports`). These detectors are pure functions over SQLite rows — no filesystem access. They live close to the DB they read. The eval write path is mcp-server (it owns `bctc_eval_results`), so stages 4-6 detectors are called from mcp-server push handlers immediately after the table writes.

### Full DDD layer table

| File | Zone | Layer | Responsibility |
|---|---|---|---|
| `apps/pdf-extractor/domain/eval_detectors.py` | pdf-extractor | domain | Stage 1-3 detector pure functions (no HTTP, no FS side-effects beyond reading stored OCR text) |
| `apps/pdf-extractor/application/extract_layout_first_usecase.py` | pdf-extractor | application | Call stage 1-3 detectors after each extraction stage; package `metrics_json`; POST to `/api/bctc-eval/push-stage` |
| `apps/pdf-extractor/infrastructure/eval_push_client.py` | pdf-extractor | infrastructure | HTTP POST to mcp-server `/api/bctc-eval/push-stage` (new port adapter, mirrors `layout_first_push_client.py`) |
| `apps/mcp-server/src/domain/services/bctcEvalDetectors.ts` | mcp-server | domain | Stage 4-6 detector pure functions (accept `BctcTableRows[]`, `BctcMdTables`, `FinancialReport` — no DB imports) |
| `apps/mcp-server/src/infrastructure/db/bctcEvalStore.ts` | mcp-server | infrastructure | `upsertEvalRow()`, `getEvalForReport()`, `listEvalSummaries()`, `getStaleReportIds()` |
| `apps/mcp-server/src/application/usecases/computeBctcEval.ts` | mcp-server | application | Orchestrate: read rows → call domain detectors → call bctcEvalStore.upsertEvalRow() |
| `apps/mcp-server/src/interface/mcp/routes/bctcEvalListHandler.ts` | mcp-server | interface | `GET /api/bctc-eval` |
| `apps/mcp-server/src/interface/mcp/routes/bctcEvalDetailHandler.ts` | mcp-server | interface | `GET /api/bctc-eval/{report_id}` |
| `apps/mcp-server/src/interface/mcp/routes/bctcEvalRecomputeHandler.ts` | mcp-server | interface | `POST /api/bctc-eval/recompute/{report_id}` |
| `apps/mcp-server/src/interface/mcp/routes/bctcEvalThresholdsHandler.ts` | mcp-server | interface | `GET /api/bctc-eval/thresholds` |
| `apps/mcp-server/src/interface/mcp/routes/bctcEvalPushStageHandler.ts` | mcp-server | interface | `POST /api/bctc-eval/push-stage` (receives stages 1-3 from pdf-extractor) |
| `apps/mcp-server/src/interface/mcp/routes/bctcEvalBackfillRunner.ts` | mcp-server | interface | One-shot backfill script |
| `apps/mcp-server/src/scheduler/financial-reports/bctcEvalRecomputeJob.ts` | mcp-server | interface | Nightly recompute cron (22:02 UTC) |
| `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` | mcp-server | infrastructure | Add `bctc_eval_results` DDL (additive migration) |
| `docs/data/bctc-eval-thresholds.json` | shared | data | Thresholds SSOT (no layer violation — it is data, not code) |
| `apps/frontend/app/routes/dashboard.bctc-eval._index.tsx` | frontend | interface | List view Remix route |
| `apps/frontend/app/routes/dashboard.bctc-eval.$reportId.tsx` | frontend | interface | Detail view Remix route |

### FE location — final ruling

**`apps/frontend/` (Remix dashboard), NOT `apps/mcp-server/dashboard/`.**

Full rationale in §8. One location only — no duplication. The BCTC inspector viewer (`GET /api/bctc-inspect`) remains at mcp-server HTML. The eval scorecard (`/dashboard/bctc-eval/*`) lives in Remix. Nav cross-link: add a "BCTC Inspect" external link in the Remix nav bar pointing to mcp-server inspector URL.

---

## §14 HANDOFF CHAIN

**This brief (G1) → parallel fan-out:**

```
architect (this brief)
    │
    ├── dev-pdf-extractor
    │     Stage 1-3 detectors + extraction hook
    │     Files: domain/eval_detectors.py,
    │            application/extract_layout_first_usecase.py (hook),
    │            infrastructure/eval_push_client.py
    │
    ├── dev-mcp-server
    │     Table migration + 5 routes + backfill script + nightly cron
    │     Stage 4-6 detectors + computeBctcEval orchestrator
    │     Files: schema-financial-reports.ts (DDL),
    │            bctcEvalDetectors.ts (domain),
    │            bctcEvalStore.ts (infra),
    │            computeBctcEval.ts (application),
    │            bctcEvalListHandler.ts, bctcEvalDetailHandler.ts,
    │            bctcEvalRecomputeHandler.ts, bctcEvalThresholdsHandler.ts,
    │            bctcEvalPushStageHandler.ts, bctcEvalBackfillRunner.ts,
    │            bctcEvalRecomputeJob.ts, server.ts (route wiring),
    │            startScheduler.ts (cron wiring)
    │     SSOT: docs/data/bctc-eval-thresholds.json (CREATE)
    │
    ├── dev-frontend
    │     2 Remix routes + nav entry + shadcn components install
    │     Files: dashboard.tsx (NAV_ITEMS append),
    │            dashboard.bctc-eval._index.tsx (CREATE),
    │            dashboard.bctc-eval.$reportId.tsx (CREATE)
    │
    └── agents-architect
          Update 6 agent flows to read eval
          Files: docs/agents/qa/flow/main.md,
                 docs/agents/system-auditor/flow/main.md,
                 docs/agents/financial-analyst/flow/main.md,
                 docs/agents/report-analyzer/flow/main.md,
                 docs/agents/dev-pdf-extractor/flow/main.md,
                 docs/agents/ops/flow/main.md

    ↓ (after dev-mcp-server done)

    ops
      Rebuild mcp-server only (off-hours, REBUILD not restart)
      Run backfill script
      Verify bctc_eval_results row count = 14 reports × 6 stages = 84 rows

    ↓ (after ops done)

    qa
      G2 gate: unit tests + integration tests + FPT sentinel deliberate-violation smoke
      G3 gate: live FE scorecard for FPT Q4-2025, qa hard-gate triggers on injected red,
               system-auditor test WORK alert
```

**Parallel dispatch safety:** dev-pdf-extractor, dev-mcp-server, dev-frontend, and agents-architect have disjoint file scopes. They can run in parallel with `isolation: "worktree"`. Sequential constraint: ops gated on dev-mcp-server complete (needs rebuilt image); qa gated on ops complete.

---

## §15 GATES G1/G2/G3

### G1 — Brief reviewed, devs unblocked

Criteria:
- This brief reviewed by at least one dev agent (dev-pdf-extractor, dev-mcp-server, or dev-frontend) acknowledging §3 schema, §4 JSON contract, §5 thresholds, §7 endpoints.
- No open questions remain. (All three Q1/Q2/Q3 resolved in this brief.)
- `docs/data/bctc-eval-thresholds.json` CREATED by dev-mcp-server before any detector code merges.

### G2 — Detectors + table + endpoints + FE shipped

Criteria:
- `bctc_eval_results` table exists in live container: `docker exec <mcp-server> bun -e "const {Database}=await import('bun:sqlite'); const db=new Database('/app/data/market.db',{readonly:true}); console.log(db.query('SELECT COUNT(*) as n FROM bctc_eval_results').get())"`
- All stage 1-6 unit tests pass (domain detector functions: pure input → output, no DB).
- Integration test: FPT sentinel pushed through extraction hook → 6 rows appear in `bctc_eval_results` with correct statuses.
- **Deliberate-violation smoke test (mandatory — see anti-false-green hardening):**
  - Stage 4: inject a row in `bctc_table_rows` with `label=NULL` (blank-label bug). Confirm `4_TABLE_RECONSTRUCT` detector emits `value_blank_label_count >= 1` and `status = "red"`. Revert injection.
  - Stage 3: inject `pdf_extracted_text` rows with ASCII-only text (no diacritics). Confirm `3_OCR` detector emits `vn_diacritic_ratio < 0.30` and `status = "red"`. Revert injection.
  - Stage 6: set `balance_pass_is_signal_only = true` in thresholds, inject a report with `balance_pass = false`, confirm stage 6 is NOT red (signal only). Remove injection.
- FE list view renders sorted red-first at `/dashboard/bctc-eval`.
- FE detail view renders 6 stage cards at `/dashboard/bctc-eval/e71f845d-ffa5-48f9-8f09-30ac2cd09c65`.

### G3 — Live production verification

Criteria:
- Live FE at `/dashboard/bctc-eval` shows scorecard for FPT Q4-2025 sentinel with `overall_status` visible.
- `has_pek: true` confirmed for FPT sentinel via direct DB query (NOT from eval rows — from `bctc_layout_units` count > 0 for `report_id = e71f845d-...`).
- qa agent hardgate test: qa spawned on a synthetic task that references a report with an injected red stage. qa returns `BLOCKED: stage 4 red`. Test passes. Injection reverted.
- system-auditor test: system-auditor sweep manually triggered, posts a test delta alert to WORK Telegram channel.
- backfill: `SELECT report_id, COUNT(*) FROM bctc_eval_results GROUP BY report_id` shows 14 rows with count=6 each (84 total rows).

---

## Anti-False-Green Hardening Summary

All four anti-false-green principles from the sprint goal are embedded in this design:

| Principle | Where encoded |
|---|---|
| `balance_pass` as SIGNAL not gate | `docs/data/bctc-eval-thresholds.json` `balance_pass_is_signal_only: true` + G2 deliberate-violation smoke test |
| Deliberate-violation smoke tests per gate | G2 gate criteria — inject bad row, confirm red fires, revert |
| Fail-loud-first one-pass audit | `gate_failures_json` surfaces ALL failures in one read (not one-at-a-time discovery); `eval_push_client.py` raises on HTTP error (no bare except) |
| Provenance per metric | Every metric in `metrics_json` carries source: `page_no`, `layout_unit_id`, `ocr_conf`, `parser_path` (see §4 metric shapes per stage) |

---

## Brownfield Scan Summary

- `bctc_eval_results` table: ABSENT. Greenfield addition.
- `/api/bctc-eval/*` routes: ABSENT. Greenfield addition.
- Remix `/dashboard/bctc-eval/*` routes: ABSENT. Greenfield addition.
- `docs/data/bctc-eval-thresholds.json`: ABSENT. Greenfield creation.
- DDD pattern for new mcp-server routes: confirmed via `bctcInspectHandler.ts` — db injected by caller, UUID validation, same switch block in `server.ts`.
- Frontend shadcn/ui base dependencies: PRESENT (`@radix-ui/react-slot`, CVA, clsx, tailwind-merge). Component files not yet installed — dev-frontend adds via shadcn CLI.
- PEK subtree: UNTOUCHED by this sprint. Confirmed frozen.
- Frozen surfaces: `text_table_extractor.py`, `sandbox/runner.py`, `pilot-status-pdf-extractor.json`, `generic_md_table_extractor.py` — all confirmed untouched.

**BUILD-STANDARD: lean** (multi-zone new feature, all services already exist).
