# FIX-BCTC-DATA-GAP-FAMILY — Design

**Zone:** multi — `apps/mcp-server/src/interface/mcp/tools/financial-reports/` +
`apps/mcp-server/src/application/usecases/` + `apps/mcp-server/src/scheduler/financial-reports/` +
`apps/mcp-server/src/infrastructure/db/` + `apps/mcp-server/src/domain/services/financial-reports/`
**Task board row:** `FIX-BCTC-DATA-GAP-FAMILY` (P1, size L, FIX, design track)
**Architect:** dispatch session `session-123eed97-8701-47f8-b7ee-90afc862380e`
**BUILD-STANDARD:** not-applicable (bug-fix family, in-zone, no new primitives)
**Scan clean:** true — verified against live DB + container logs; overlap analysis vs sibling rows below.

---

## 0. Live evidence (verified this cycle, not carried forward unexamined)

All figures below re-derived from the LIVE DB (`data/live/market.db`, 465 MB — the
container's bind-mounted `/app/data`, not the stale 14 MB host copy) and the live
mcp-server container logs (`docker logs vn-market-intelligence-mcp-mcp-server-1`).

**Serving symptom (DXG):** all 12 DXG `financial_reports` rows are
`refine_status=PENDING` with `total_assets=0`, `extraction_confidence` 0.31–0.63 →
`get_bctc_full` PUB-1 (`refine_status IN ('DONE','PARTIAL')`) rejects → "Chưa có dữ liệu BCTC"
(46th+ consecutive cycle per envelope). **But** DXG has 465 `bctc_layout_units`
(PEK table extraction WORKED) and **0** `bctc_table_rows` + **0** `bctc_refined_units` —
the agentic-refine stage never ran/completed for DXG. The `fallback-DXG-*` rows
(id pattern from `composition-root.ts:213` bootstrap fallback insert when the reparse
pipeline returned null) carry **no `pdf_path`**, so reconcile cannot re-fire PEK on them.

**Serving symptom (HPG):** HPG 2026-Q1 (PARTIAL, conf 0.8, `passed_with_warnings`) and
HPG 2025-Q4 (PARTIAL, conf 0.5, low_confidence) both hold `operating_profit=0.0`,
`net_revenue≈0.0`, `net_profit≈0.0` while `total_assets>0` — income-statement
extraction is corrupt/absent while the balance sheet survived. PUB-8 parent-only
heuristic (NR=0 AND NP>0 AND conf<0.6 → BLOCK) does NOT fire because NP is also 0;
the identity guard (TA<=0 / TA<equity) passes. Envelope: "operating_profit reported
as 0 … 42nd+ consecutive cycle".

**Extraction symptom (BID, telegram 5214-5228):** live container logs 2026-08-27/28:
`push-bctc-pdf` for BID 2025-Q4 → Tier 1 pdf_path OCR succeeded (102,163 chars) →
`parseBctcReport` period-content check: **"Period mismatch for BID: supplied period is
2025-Q4, but document content indicates 2025-Q3 (6 matching boundary-date occurrences
vs 4 runner-up). Refusing to store"** → `BctcPeriodContentMismatchError` →
`fetchParseAndStoreBctc` returns null → `runPipeline returned null for BID 2025-Q4`
→ push failed, queue row 255870 stays `pending` with `attempts=0` forever. The queue
row's `source_url` is `https://owa.hnx.vn/ftp///cims/2026/1_W5/000000015833101_VI_BaoCaoQuanTri_2025.pdf`
— a **corporate-governance report** (Báo cáo quản trị), NOT a financial statement.
The enricher populated the wrong document class. Additionally, `bctcPdfPullJob.ts`
pull predicate only matches `VPS_BCTC_BASE_URL%` / `HSX_STATICFILE_BASE_URL%` prefixes —
`owa.hnx.vn` rows are **structurally unpullable** and stay `pending` forever.

**Write-block symptom (total_assets=0):** `storeReport()` correctly blocks
`totalAssets<=0` (BSR/SSI/EIB/DGC/FRT blocked 08-15, recorded in `bctc_zero_extract_blocks`),
but the blocklist table is **empty** for DXG/HPG/BID/VNM/VEA — those tickers never
REACH `storeReport` (they fail upstream: refine never runs / period mismatch /
url_not_found). The write-block mechanism itself is healthy; the family gap is upstream.

**OCR-corruption signature (VNM/VEA):** VEA 2025-Q4 PARTIAL has `total_assets=20.7M,
equity=20.4M, liabilities=0.25M, net_revenue=259,905, net_profit≈-5e-05, conf=1.0` —
grossly wrong magnitudes (a real VEA balance sheet is ~10^11 VND). Identity guard
passes (TA>0, TA≈EQ). VNM 2026-Q1 has `total_assets=0.0, equity=36.6M` → identity
guard correctly fires there. The guard catches absolute violations but NOT
scale-corruption (all values consistently 10^6× too small → TA>equity still holds).

**Queue-liveness root cause (systemic):** LIVE queue state: `deferred_infra` 328 rows
(**293 with NULL source_url — unrecoverable by ANY current arm**), `enrich_failed` 39,
`url_not_found` 26, `done` 220, `pending` 1. The enricher Arm-2 grace predicate
requires `attempts < 6`, but `markUrlNotFoundStmt` sets `attempts=attempts+1` when
`item.attempts >= MAX_ENRICH_ATTEMPTS (5)` → every `url_not_found` row lands at
`attempts=6` and is **permanently excluded** from the 7-day grace re-discovery
(VEA 2025-Q4/2026-Q1 measured at attempts 6–7). `deferred_infra` NULL-URL rows are
invisible to Arm-1 (`status='pending'` required), Arm-2 (status filter), and the
orphan arm (VPS-placeholder-URL filter) — a permanent dead-end for 293 rows, which
is the BID/FRT/KDH/EIB/SHB/GVR/GEX/VJC extraction-failure class.

---

## 1. Per-defect root-cause classification

| # | Defect (envelope/telegram) | Root cause (live-verified) | Layer |
|---|---|---|---|
| D1 | DXG `get_bctc_full` no-data, 46th+ cycle | Extraction (PEK) produced layout units; **agentic-refine never ran/finalized** for DXG → PUB-1 blocks. `fallback-DXG-*` rows lack `pdf_path` → reconcile can't re-fire PEK. Serve path returns flat "Chưa có dữ liệu" with no stage-granularity. | serving + refine orchestration |
| D2 | HPG `operating_profit=0`, 42nd+ cycle | Income-statement extraction corrupt/absent while balance sheet survived; PARTIAL row passes PUB-1/PUB-8/identity guard and serves `operating_profit=0` unflaggex. | serving validation |
| D3 | BID period-mismatch + runPipeline null (telegram 5214-5228) | Enricher populated a **governance-report URL** for a financial-report slot; pull-job URL prefix predicate excludes `owa.hnx.vn` → unpullable forever; period-content guard correctly refuses but there is **no quarantine/recovery path** → runPipeline null loops on manual re-push. | queue + discovery + ingest |
| D4 | total_assets=0 write-blocks | Guard correct; family tickers **never reach storeReport** (upstream D1/D3/D5 failures). No visible "write-blocked N times" reason surfaced at serve time — analyst sees only "no data". | infra (validation) |
| D5 | VNM/VEA assets<equity or margin>100% | Identity guard catches absolute violations (TA<=0, TA<equity) but NOT scale-corruption (all values uniformly 10^6× small → ratios pass). | serving validation |
| D6 | Queue drain / BID-FRT-KDH-EIB-SHB-GVR-GEX-VJC extraction failures | `url_not_found` rows terminal at `attempts=6` excluded from Arm-2 grace (`attempts<6`); `deferred_infra` NULL-URL rows (293) unreachable by all 3 arms. | queue infra |

---

## 2. Fix approach (per defect, file-scoped)

### U1 — Queue-liveness recovery (D6 — the systemic enabler, do FIRST)

**Files:** `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts`,
`apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts`

1. **Arm-2 bound fix (`bctcQueueEnricherJob.ts` COMBINED_SQL):** replace `AND attempts < 6`
   with a grace predicate that does not exclude the rows this job itself terminalized:
   `AND attempts <= MAX_ENRICH_ATTEMPTS + 1` (i.e. `< 7`) — a row at `attempts=6`
   (url_not_found) becomes re-eligible for the 7-day-grace re-discovery pass, exactly
   as the FIX-BCTC-ENRICHER-STUCK-BACKLOG comment intends ("after 7 days one more
   discovery pass"). Keep the `last_attempt < -7 days` gate — no unbounded churn.
2. **deferred_infra NULL-URL arm (`bctcQueueEnricherJob.ts`):** extend the orphan-re-sync
   OR a new Arm-3 to select `status='deferred_infra' AND source_url IS NULL` past a grace
   period (same `last_attempt < -7 days` bound) and reset to `status='pending'` for
   re-discovery. This reopens the 293-row parked class. Add `attempts` reset on recycle
   (mirrors the existing `FIX-BCTC-D3C-FOLLOW-UP-RESET-ATTEMPTS` pattern).
3. **Pull-job URL predicate (`bctcPdfPullJob.ts`):** widen the pull-eligible filter from
   `(VPS|HSX)%` to also accept `owa.hnx.vn` (or any URL whose host resolves, with the
   existing size/auth guards) — OR, safer per infra ownership, route non-(VPS|HSX)
   `pending` rows back to the enricher for re-discovery instead of leaving them
   unpullable forever. Prefer the enricher-reroute (single discovery owner).

**Test:** unit — Arm-2 selects an `attempts=6` url_not_found row past grace; deferred_infra
NULL-URL row recycled once past grace; pull-job predicate accepts HNX row (or enricher
reroute fires). Fixture: in-memory DB mirroring live shapes.

### U2 — Wrong-document-class discovery filter (D3 root half)

**Files:** `apps/mcp-server/src/domain/services/bctcDiscovery.ts` (or
`apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts` — wherever the URL list
is built), `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts`

Filter out non-financial-statement URL classes from discovery results before writing
`source_url`: pattern-match `BaoCaoQuanTri|bao-cao-quan-tri|Bao cao quan tri|BCTC.*(quan tri)|QuanTri`
(governance reports), keep financial statements. When the selected doc is a governance
report, treat as "0 URLs found" → attempt-counting path → eventually honest `url_not_found`
rather than a poisoned `source_url`.

**Test:** unit — discovery result containing a governance-report URL and a financial URL
keeps only the financial one; governance-only result counts as 0-URLs.

### U3 — Period-mismatch quarantine + recovery (D3 recovery half)

**Files:** `apps/mcp-server/src/application/usecases/parseBctcReport.ts` (write-side),
`apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts`,
`apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` (serve-side)

1. **Durable quarantine record:** when `BctcPeriodContentMismatchError` fires in
   `parseBctcReport.ts`, write a row to `bctc_zero_extract_blocks`-style quarantine
   (reuse the same table with `reason='period-mismatch: content=<y>-Q<q>'`, or a new
   `bctc_period_mismatches` table keyed `(action_code, sort_key)` with the content
   signal). Store the content-derived period so an analyst can see WHY the slot is
   empty (today: only a debounced Telegram line, no durable record).
2. **Recovery:** in `fetchParseAndStoreBctc.ts`, when the guard fired for
   `(action_code, sort_key)`, do not leave the queue row `pending` — mark it
   `url_not_found`-style for re-discovery (reuse the U1 enricher path) instead of the
   silent `return null` that leaves `runPipeline` null loop on manual re-push.
3. **Serve-side visibility:** `get_bctc_full` no-data branch should consult the
   quarantine/blocklist record and return a stage-specific reason (e.g.
   `"BID 2025-Q4: period-mismatch (content 2025-Q3) — awaiting re-discovery"`) instead of
   flat "Chưa có dữ liệu BCTC" when a record exists — keeps the exact string for the
   true-absent case (bctc-analyst contract) and adds a distinct actionable variant.

**Test:** unit — mismatch throws → quarantine row written with content signal; re-push
with same pair returns the reason string; serve path distinguishes mismatch vs absent.

### U4 — Income-statement corrupt-scalar guard (D2)

**Files:** `apps/mcp-server/src/domain/services/financial-reports/bctcIdentityGuard.ts`
(extend, keep pure), `apps/mcp-server/src/application/usecases/parseBctcReport.ts`
(write-side pre-block), `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`
+ `reports.ts` (serve-side flag)

Extend the shared serve guard with an **income-broken-with-assets** predicate:
`total_assets > 0 AND net_revenue == 0 AND operating_profit == 0 AND net_profit == 0`
→ corrupt (income statement missed, balance sheet survived) — the exact HPG 2026-Q1/2025-Q4
fingerprint. Serve path: hard-block like the identity guard ("[CORRUPT DATA — SKIP]",
reason "income statement absent while balance sheet present — partial OCR"). Write-side:
`storeReport()` pre-checks the same predicate and refuses to INSERT/overwrite (same
`bctc_zero_extract_blocks` recording as the total_assets guard) so the corrupt row
never becomes a servable PARTIAL.

**Note — sibling overlap:** `FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG`
(backlog, next_agent=developer) targets `reports.ts`/`bctcFullTools.ts`/
`backfillBctcScalarsTool.ts` for the same HPG symptom. This design's U4 is the
**generalized** serve/write guard (all tickers), which SUPERSEDES the sibling's
ticker-specific scope — developer should implement U4 and mark the sibling row
superseded/absorbed (do NOT land both independently; U4 + a one-time HPG scalar
backfill via `backfill_bctc_scalars` covers it).

**Test:** unit — HPG-shaped row (TA>0, income zeros) trips guard on serve + write;
healthy row (VNM 2025-Q4 DONE, NR>0) does not.

### U5 — Scale-corruption guard (D5)

**Files:** `apps/mcp-server/src/domain/services/financial-reports/bctcIdentityGuard.ts`
(extend, pure), `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`
(serve)

Extend the shared guard with a scale-plausibility bound: when `total_assets > 0` but
`total_assets < ABSOLUTE_FLOOR` (e.g. < 1e9 VND — a real listed-company floor; make it a
named const `BCTC_TOTAL_ASSETS_FLOOR_VND`) OR `total_assets/equity_total > SCALE_RATIO_CAP`
(e.g. > 10^4 — detects uniform 10^6×-downscale corruption where TA>equity still holds),
flag corrupt. Mirrors the existing "third occurrence" recurrence logic — generic, no
ticker list. Keep the guard pure/zero-I/O (domain layer contract).

**Test:** unit — VEA-shaped row (TA≈20M, EQ≈20M) trips scale guard; real-scale row passes;
existing identity cases unchanged (regression).

### U6 — Serve-path stage-granular diagnostics (D1 serve half)

**Files:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`

In the `!latestRow` / no-publishable-candidate branches, before returning the flat
"Chưa có dữ liệu BCTC" string, query: (a) does a `financial_reports` row exist with
`refine_status='PENDING'`? → "extracted, refine pending (N layout units, 0 refined)";
(b) is the pair dead-lettered in `bctc_zero_extract_blocks`? → "write-blocked N times";
(c) neither → true-absent (keep existing string byte-identical). This converts the
46th-cycle envelope from "no data" into an actionable stage pointer. **Keep the existing
string for the true-absent case** — the bctc-analyst envelope contract matches it.

**Test:** unit — DXG-shaped DB (layout units, 0 refined, PENDING) returns refine-pending
reason; absent ticker returns the legacy string (byte-identical).

### U7 — Refine-pending liveness backstop (D1 root half — coordinate, do NOT duplicate)

`FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP` (backlog, next_agent=ops) owns the durable
refine trigger; `FIX-BCTCREPARSEJOB-NOT-FIRING-40H-LOWCONF-BACKLOG-ACCUMULATING`
(backlog, dev-mcp-server) owns reparse liveness. This family's contribution is LIMITED
to: (a) the U6 diagnostic surfacing "refine pending"; (b) verifying (not changing) that
`get_bctc_pending_refine`'s eligibility (text_status=COMPLETE, refine_status PENDING)
covers DXG — it does (verified live). **No new refine trigger in this family** — flag to
PO/ops that DXG refine starvation should be tracked under the existing backstop row.

---

## 3. Sequencing

1. **U1 (queue liveness)** — unblocks the whole parked cohort; everything else benefits.
2. **U2 + U3 (discovery filter + mismatch quarantine/recovery)** — stops poisoning and
   gives stuck rows a recovery path (BID class).
3. **U4 + U5 (corrupt-scalar + scale guards)** — stops serving corrupt HPG/VNM/VEA rows.
4. **U6 (serve diagnostics)** — makes the remaining gaps visible to the analyst.
5. **U7** — coordination only (no code, or 1-line pointer in U6 reason).

Dependencies: U1 before U2/U3 recovery (recovery rides the enricher arms); U4 before any
HPG scalar backfill (backfill would re-write the corrupt row otherwise); U6 independent.

---

## 4. Sibling / overlap notes (mandatory per dispatch)

- **FIX-PREPUSH-SIZELINT-6-OFFENDERS** (P1, M, in progress by a developer, zone
  `apps/mcp-server/src` + `apps/pdf-extractor/src`): size-lint remediation of 6 files
  (bctcScalarAggregator.ts 1207L vs cap, ocr_backends.py, ocr_adapter.py, ocr_worker.py,
  pek_engine_adapter.py, text_table_extractor.py). **This design touches NONE of those
  6 files** (verified: no edit below references bctcScalarAggregator.ts or any
  pdf-extractor OCR file). `parseBctcReport.ts`/`bctcFullTools.ts` are touched here but
  are NOT on the sibling's offender list. Coordination: both may touch the same DB
  tables (bctc_zero_extract_blocks) — no file-level collision; commit atomically per
  file set.
- **FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG** (backlog, developer):
  absorbed by U4 — see §2 U4 note. Do NOT implement both.
- **FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP** (ops): U7 defers the refine-trigger half
  to it; no duplicate.
- **FIX-BCTC-ENRICHER-ZERO-URL-ALL-TICKERS-ACTIVE-WINDOW** (backlog, dev-mcp-server):
  U1's enricher changes touch the same file (`bctcQueueEnricherJob.ts`) — the developer
  must rebase/merge against that row if it lands concurrently (different code regions:
  zero-url-alert counter vs grace/arm SQL).

---

## 5. DDD layer + interface split

- Domain (pure, zero-I/O): extended `bctcIdentityGuard.ts` (U4 income-broken predicate,
  U5 scale floor) — all read paths share it (reports.ts / bctcFullTools.ts /
  compare_financials), consistent with the existing W1 pattern.
- Application (orchestration): `parseBctcReport.ts` write-side guards + quarantine write
  (U3/U4); `fetchParseAndStoreBctc.ts` recovery path (U3).
- Infrastructure (DB/scheduler): `bctcQueueEnricherJob.ts` + `bctcPdfPullJob.ts` (U1),
  discovery filter (U2).
- Interface (MCP tools): `bctcFullTools.ts` / `reports.ts` serve-side reasons + flags (U4/U5/U6).

## 6. Test strategy

- Unit: per U above, in-memory DB fixtures mirroring live row shapes (DXG layout-units-
  no-refined; HPG income-zeros; VEA scale-corrupt; BID mismatch). All guard logic is
  pure → direct assertions.
- Integration: enricher arms against a fixture DB with live-shaped url_not_found/
  deferred_infra rows (U1); push-bctc-pdf BID-style re-push returns quarantine reason (U3).
- Regression: existing bctc suites (bctcFullTools PUB-1..8 tests, parseBctcReport
  storeReport tests, enricher tests) must stay green — U4/U5 extend, never replace,
  existing guards.

## 7. Risk flags

- **Refine starvation is the true DXG root** but its fix (refine execution) lives in
  ops/fleet-cron territory (U7) — the family can only surface it via U6. Escalate if
  ops backstop is not scheduled.
- `owa.hnx.vn` reachability/geo-block from the mcp-server container is unverified this
  cycle (host curl from container succeeded for pdf-extractor:5001 only). U1-3 (enricher
  reroute + quarantine) are safe even if HNX is unreachable — the row honestly parks at
  url_not_found instead of silently pending.
- Serving-string changes must preserve the exact "Chưa có dữ liệu BCTC" for the
  true-absent case (bctc-analyst contract, `docs/agents/bctc-analyst/init.md`).
- bctcZeroExtractBlocklist.ts (119L) and bctcIdentityGuard.ts (104L) are near the 120L
  size-lint threshold — keep additions ≤120L or add a `size-justification:` header
  (prefer a new domain module if the guard grows past ~120L).

---

## RETURN
DONE: Technical design complete — 7 work units (U1–U7), per-defect root-cause
classification, sequencing, sibling-overlap analysis, test strategy.
ZONE: multi (mcp-server interface + application + scheduler + infrastructure + domain)
NEXT: developer implements U1→U6 in order; U7 coordinates with ops backstop row.
HANDOFF: this brief + row `architect_review_note`.
PIPELINE: continue
