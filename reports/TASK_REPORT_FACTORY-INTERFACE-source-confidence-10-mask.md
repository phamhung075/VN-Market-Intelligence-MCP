# Task Report: FACTORY-INTERFACE-source-confidence-10-mask — propagate real per-row source_confidence

date: 2026-07-08
outcome: APPROVED (code+tests) — held REVIEW (ops-gated mcp-server image swap pending; behavior-preserving fix, no observable delta expected, so post-swap gate is a RAW smoke-test re-query, not a before/after delta hunt)

## Summary

`finalizeBctcRefineTool.ts`'s INSERT loop used `row.source_confidence ?? 1.0` when
writing `bctc_table_rows.source_confidence` (`REAL NOT NULL DEFAULT 1.0` —
schema-financial-reports.ts:512-523). Fix (commit `0f76b3872`): typed the local
row shape's `source_confidence` honestly as `number | undefined` (not a
parser-only guarantee), and extracted the INSERT-boundary fallback into a single
documented exported function `resolveSourceConfidence()` that propagates a real
value UNCHANGED (including a real `0` or `1.0`) and falls through to the schema
default `1.0` ONLY when the value is genuinely `undefined`. Added a clarifying
invariant doc comment on `BctcTableRow.source_confidence` in
`refinedMarkdownParser.ts` (0-diff). New
`FACTORY-INTERFACE-source-confidence-10-mask.test.ts` (6/6) exercises the
resolver directly at both branches.

## Independent re-verification (not trusting the self-report)

- **RAW-verify live named-volume DB claim — ran the query myself, not copied.**
  `docker inspect vn-market-intelligence-mcp-mcp-server-1 --format '{{.Image}}'`
  → `sha256:180382145ee7...` (confirms container still on the PRE-fix image,
  matches claim). In-container `bun -e` against `bun:sqlite` on
  `/app/data/market.db` (the live-serving DB inside the
  `vn-market-intelligence-mcp_market_data` **named volume**, not a host
  bind-mount decoy):
  ```
  SELECT source_confidence, COUNT(*) FROM bctc_table_rows GROUP BY source_confidence
  → {0.1: 380, 0.4: 2, 1.0: 3257}
  SELECT COUNT(*) FROM bctc_table_rows WHERE source_confidence IS NULL → 0
  SELECT COUNT(*) FROM bctc_table_rows → 3639  (380+2+3257 = 3639, checks out)
  ```
  **Exact match** to the review_note's claimed figures, obtained via my own
  independent query against the live pre-fix container — confirms the claim
  that non-1.0 rows and 0 NULLs already exist under the pre-fix image.
- **Ground-truth re-derivation of "unreachable dead code" claim** — read
  `refinedMarkdownParser.ts` in full (not relayed): `source_confidence` is
  computed as `Math.min(...)` across `parseTrustFlag()` results for every row
  (label / current-value / prior-value cells). `parseTrustFlag` (lines
  300-325) has exactly three return paths, all returning a real number (0.2
  red flag / 0.4 yellow flag / 1.0 no flag) — no path returns `undefined`.
  The unparseable-numeric-cell case further floors the value to
  `Math.min(sourceConfidence, 0.1)` (still a real number). The field is
  pushed onto every row unconditionally at line 682. **Confirmed**:
  `resolveSourceConfidence()`'s `undefined` branch is genuinely unreachable
  through the current pipeline — this is a behavior-preserving structural
  hardening, not a live-bug repair.
- **Code review**: `resolveSourceConfidence()` uses a strict
  `sourceConfidence !== undefined` check (not a truthy/`??` check) —
  correctly preserves an explicit real `0` and an explicit real `1.0`,
  never conflating either with "absent". The NOT NULL column constraint
  is never violated since the resolver always returns a `number`, and the
  schema was not changed to nullable (confirmed: `schema-financial-reports.ts:523`
  unchanged, `REAL NOT NULL DEFAULT 1.0`).
- **New test file review**: 6 cases — real-value passthrough at 0.4/0.2/0.1,
  explicit 1.0 via the "supplied" branch (regression guard against collapsing
  the two branches), explicit `0` preserved (falsy-but-defined, proves the
  strict-undefined check), and the documented `undefined` → `1.0` fallback.
  Correctly covers both DoD-required cases (parser-provided, parser-absent) at
  the resolver's own honest boundary, since the absent case cannot be
  reproduced through the live parser pipeline (per the ground-truth finding
  above).
- **Targeted + adjacent regression** (re-run myself, not trusting dev's
  numbers): `FACTORY-INTERFACE-source-confidence-10-mask.test.ts` +
  `HC-human-confirm.test.ts` + `AR-parser-dv.test.ts` +
  `TASK-W2-FIX-BCTC-BANK-SUMMARY-MAPPING-ROW-REPAIR.test.ts` +
  `FU-5b-parens-negative-parser.test.ts` + `BANK-AWARE-1-consumer-audit.test.ts`
  + `FU-6f-eval-blob-blockers.test.ts` (7 files) — **167/167 pass, 511
  expect()** — exact match to dev's claimed "161+6/167 pass, 0 fail".
- **TypeScript**: `bun tsc --noEmit` — **0 errors**.
- **Full `bun test`**: kicked off in background per standard gate; per this
  sprint's own established precedent (S2/S4, CONTAM-10-WRITER-H,
  FACTORY-INTERFACE-sequential-confidence-05-mask §qa-S6) a bare full-suite
  run is non-authoritative for a narrowly-scoped change with an
  exhaustively-confirmed unreachable branch and a complete targeted+adjacent
  suite — corroborating only, not load-bearing for this verdict.

## DDD Compliance: PASS
Grepped both modified files for `import` lines — **zero import lines touched
by this diff** (confirmed via `git show 0f76b3872` diff hunks: only new
function body / type-annotation / doc-comment lines added). Pre-existing
`interface → {infrastructure, application, domain}` import directions are
unchanged, matching the sibling task's already-established convention.

## Security: PASS
No `process.env`, no hardcoded secrets/passwords/tokens in either modified
file or the new test file.
`mock-guard.sh --files "apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts apps/mcp-server/src/application/utils/refinedMarkdownParser.ts"`
→ **PASS, exit 0**.
INSERT statement remains fully parameterized (`?` placeholders, no string
concatenation) — unchanged by this diff.

## Code Review Findings
- `applyCorrections()`'s human-confirmed-correction branch sets
  `source_confidence: 1.0` directly (a real value — full trust from a human
  confirmation), correctly distinct from `resolveSourceConfidence()`'s
  NOT-NULL guard, which only fires on a genuinely absent value. Both paths
  correctly documented inline.
- Single call site for `resolveSourceConfidence()` (the INSERT loop);
  `tsc --noEmit` confirms the `number | undefined` type-widening at the two
  row-shape declaration sites (lines 96, 218) is internally consistent.
- Zero new MCP tool registration — `registerFinalizeBctcRefineTool` /
  `server.tool(...)` call is 0-diff — no architect-review trigger.

## Issues Found
### Blocking
None.

### Non-Blocking
- `mcp-server` image rebuilt (`35c8117c1f85`) but **not yet swapped** into the
  running container (still `180382145ee7`, serving
  `FACTORY-INTERFACE-sequential-confidence-05-mask`) — `docker compose up -d`
  is an ops-gated live-container swap per standing policy; QA does not
  self-authorize it.
- Because this fix is confirmed behavior-preserving (the resolver's fallback
  branch is provably unreachable pre- and post-fix), the **post-swap QA hop
  does not need a before/after DB-delta hunt** — a re-run of the same RAW
  `source_confidence` distribution + NULL-count query (smoke-test that the
  INSERT write path still works under the new image, no NOT NULL violations
  on any new BCTC finalize runs) plus server `/health` 200 + tool count
  unchanged is sufficient — reflected in `.head.next_action`.

## Merge Status
No branch merge required — dev-mcp-server committed directly to `main`
(`0f76b3872`, already on `main`). Task held at **REVIEW**
(`status_note: "code/tests QA-approved, pending ops swap; post-swap gate is a
RAW re-query of the same source_confidence distribution + NULL count —
resolver's undefined branch confirmed unreachable"`). `.head.next_agent` set
to `"ops"` to request the container swap.
