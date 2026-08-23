# Fix Spec — FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE

**Task:** FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE · P2 · S · zone `docs/agents/system-auditor/flow/`
**Mode:** `supervised:true` + `plan_only:true` — this document is a PLAN only. Neither
`docs/agents/system-auditor/flow/main.md` nor `scripts/auditor-db-checks.sh` was created/edited by this
cycle. No file outside `docs/handoffs/` + board/notebook/journal was touched.
**Produced by:** architect, 2026-08-08
**Handoff to:** po (adjudicates, then routes to a fix-authorized agent — developer or a future architect
direct-edit cycle, PO's call)
**Origin:** `origin_signal_id: sys-20260725T003340-1ce9`, PO triage `po/triage-20260725T0645`
**BUILD-STANDARD:** not-applicable (in-zone flow-doc predicate fix + one new deterministic bash script,
mirrors `scripts/db-integrity-counts.sh` discipline — no new domain primitive)

---

## 0. Live re-verification of the row's own citations (do not trust the row text — re-derive)

| Cited | Row says | Live (2026-08-08) |
|---|---|---|
| C-04 query location | `main.md:572` | **STALE — actual line is `main.md:862`** (table row inside `### DB Write Integrity Checks (C-01 through C-16)`, heading at `:803`; file is ~1240+ lines). The file already carries a documented ISO8601-format-safety wrap (`FIX-AUDITOR-C08-...`, 2026-08-06) so the live query text is `SELECT count(*) FROM financial_reports WHERE datetime(parsed_at) > datetime('now','-7 days') AND extraction_confidence < 0.2` — the `datetime()` wrap around `parsed_at` was added by that unrelated fix; the recency/population defects this task targets are untouched by it. |
| `financial_reports.parsed_at` ISO8601 audit | table at `:843`, "100% (257/257), AFFECTED, wrapped" | **Confirmed live**, unchanged — cross-checked directly against the DB below (independent measurement, not re-trusted from the doc). |
| Row's own "11 flagged rows, 2026-07-19/20 batch" evidence (root_cause) | 11 rows, 6 genuinely low-confidence, 5 pending/pending_extraction | **PARTIALLY STALE — self-cleared, exactly as the row's own `.note` predicted.** That 2026-07-19/20 batch is now outside the live `-7 days` window (today's window floor is 2026-08-01). Live-reverified below (§1) that the batch itself still checks out as described when queried directly by its own `parsed_at` stamps (94 total rows, 89 non-pending/extracted, 6 genuinely `<0.2` confidence — matches the row's claim closely; the row's own prose describing "5 pending" vs "6 genuinely low" has an internal wording ambiguity, not re-derived from the row text, re-derived from the DB directly instead, see §1). |
| **Currently-live replacement incident (NOT in the row, found live 2026-08-08)** | — | **A brand-new, currently-live 12-row flagged batch exists RIGHT NOW** — different tickers, different mechanism emphasis (100% pure D2/population defect, D1/recency not implicated for this specific batch). See §1.1 — this is the live proof used for most of this spec's acceptance verification since the row's own cited incident has expired out of the window. |
| `scripts/auditor-db-checks.sh` (deliverable target) | "fold the predicate into scripts/auditor-db-checks.sh as the SSOT per UC-ASL-P3" | **Confirmed does not exist yet.** `UC-ASL-P3` (`docs/data/orch/orch-state.json`, status `BACKLOG`) titles itself *"Freeze Tier-2/3 auditor predicates into scripts/auditor-db-checks.sh (extend db-integrity-counts.sh discipline)"* — i.e. this C-04 fix is the FIRST predicate ported into that not-yet-created script; UC-ASL-P3 itself (porting every other Tier-2/3 predicate) stays BACKLOG, untouched by this task. `scripts/db-integrity-counts.sh` (the cited discipline precedent) exists and was read in full — its conventions are followed exactly in §3 below. |
| `financial_reports` schema (`validation_status`, `extraction_confidence`) | root_cause names `pending`/`pending_extraction` statuses, `conf=0.0` | **Confirmed live** via `PRAGMA table_info` + `GROUP BY validation_status` — see §1. |

All numbers in this spec are live `sqlite3` reads against `data/live/market.db` (host-bind read, `scripts/lib/sqlite-wal-guard.sh` WAL-safe URI — the exact same read mechanism `scripts/db-integrity-counts.sh` uses), captured 2026-08-08, read-only, zero writes.

---

## 1. Live data findings — both defects re-confirmed, one already firing TODAY under a different cohort

### 1.1 THE CURRENT LIVE C-04 OUTPUT (2026-08-08) — 100% population defect (D2), zero recency defect (D1) for this cohort

```sql
SELECT count(*) FROM financial_reports
WHERE datetime(parsed_at) > datetime('now','-7 days') AND extraction_confidence < 0.2;
-- => 12  (today's live count under the UNFIXED predicate)
```

All 12 flagged rows, verbatim:

| action_code | period | parsed_at | extraction_confidence | validation_status |
|---|---|---|---|---|
| SAB/SHB/SSI/VCB/VCI/VHM/VIC/VIX/VJC/VND/VNM/VRE | 2026-Q2 | 2026-08-01T06:32–08:37Z | 0.0 | `pending_extraction` |

**All 12 are shell rows** — `ensureFinancialReportShellRow.ts` INSERTs them (`validation_status='pending_extraction'`, `extraction_confidence` bound explicitly to `0` — not the schema's silent `DEFAULT 1.0`, see its own inline comment) the moment a new SSC filing PDF is *discovered*, before any extraction has run. `published_at` is NOT in that INSERT's column list at all (confirmed reading the statement) — it stays NULL until the real extraction (`parseBctcReport.ts`) later fires and upserts it. **Zero of the 12 are genuine low-confidence extractions** — under a population filter that excludes `pending`/`pending_extraction`, this batch's contribution to C-04 drops to **0**:

```sql
SELECT count(*) FROM financial_reports
WHERE datetime(parsed_at) > datetime('now','-7 days')
  AND validation_status NOT IN ('pending','pending_extraction')
  AND extraction_confidence < 0.2;
-- => 0
```

This is a direct, live, TODAY reproduction of the row's own D2 diagnosis — a completely different cohort (2026-Q2 filings for 12 different tickers) than the one the row originally cited, independently confirming the defect class recurs exactly as predicted ("guarantees re-fire on every future bulk reparse" / — here, every future bulk *filing-discovery* batch).

### 1.2 The row's originally-cited 2026-07-19/20 batch — re-derived directly, self-cleared from the window as predicted

```sql
SELECT count(*), 
       sum(CASE WHEN validation_status NOT IN ('pending','pending_extraction') THEN 1 ELSE 0 END),
       sum(CASE WHEN validation_status NOT IN ('pending','pending_extraction') AND extraction_confidence < 0.2 THEN 1 ELSE 0 END)
FROM financial_reports WHERE parsed_at LIKE '2026-07-19%' OR parsed_at LIKE '2026-07-20%';
-- => batch_total=94, extracted=89, lowconf(new-population-only)=6   (rate = 6/89 = 6.74%)
```

Confirms the row's own claim shape (a large, mostly-healthy batch; 89/94 = 94.7% were genuine extraction attempts, not shells) and gives a concrete rate baseline: **6.74%**, well under any reasonable "genuine regression" bar. This batch is no longer in today's `-7 days` window (`now()` floor is 2026-08-01), matching the row's `.note` "self-clears 2026-07-27" prediction — it is used below purely as a **replay fixture**, not as a live-firing signal.

**Important finding not in the original row: population-filtering ALONE is insufficient to satisfy the acceptance criterion.** An absolute-count threshold of `<= 5` (the CURRENT threshold, unchanged) would still fire on this replayed batch even after the population fix (6 > 5) — only the combination of population-filter **+** the switch from absolute-count to **rate-with-volume-floor** (deliverable point (a)) makes the acceptance criterion's "ZERO C-04 signal on replay" achievable. This directly justifies why deliverable (a) and (b) are both required, not independently sufficient.

### 1.3 D1 (recency/mutation-timestamp) defect — confirmed live and structurally, via a currently-active drift class distinct from 1.1

Schema-level proof (`apps/mcp-server/src/application/usecases/parseBctcReport.ts:433-449`, `ON CONFLICT(action_code, sort_key) DO UPDATE SET ... parsed_at = excluded.parsed_at`, while the SAME clause's inline comment states `published_at` is **deliberately excluded** from the `DO UPDATE SET` list: *"SQLite keeps the existing row's filing date untouched on every re-parse (FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP)"*). This is the exact mechanism the row's D1 diagnosis describes: `parsed_at` is stamped on **every** write (insert or reparse); `published_at` is stamped **once**, at first insert, and frozen forever after.

Live proof this is not theoretical — **18 rows exist RIGHT NOW** whose `parsed_at` is inside the current 7-day window (recently re-touched: 2026-08-01/03/04/06 reparse batches) while their `published_at` sits outside it (frozen at the original 2026-07-19/20/04-27 ingestion dates):

```sql
SELECT count(*) FROM financial_reports
WHERE datetime(parsed_at) > datetime('now','-7 days')
  AND (published_at IS NULL OR datetime(published_at) <= datetime('now','-7 days'));
-- => 18 non-pending rows (+ the 11 pending_extraction rows from §1.1, published_at also NULL)
```

None of these 18 currently carry `extraction_confidence < 0.2` (checked — 0 hits), so today they do not themselves cause a false WARN. But the mechanism is live and mechanically identical to the incident that minted this row: **if any future bulk reparse of old, genuinely-low-confidence filings runs** (plausible — the whole point of a reparse job is to re-attempt extraction on rows that previously scored poorly), `parsed_at`-anchored recency will misclassify it as "a fresh wave of low-confidence extractions" exactly as it did on 2026-07-19/20. Fixing D1 is therefore a **preventive** fix for a currently-dormant-but-mechanically-proven failure mode, not a currently-firing one — §2.2 below documents the chosen remedy and why.

### 1.4 Threshold sanity-check against the whole-table baseline

```sql
SELECT count(*) extracted_total, sum(CASE WHEN extraction_confidence<0.2 THEN 1 ELSE 0 END) extracted_lowconf
FROM financial_reports WHERE validation_status NOT IN ('pending','pending_extraction');
-- => extracted_total=221, extracted_lowconf=9  →  4.07% ALL-TIME baseline rate
```

A **15%** rate bar sits ~3.7× above the measured all-time baseline (4.07%) and ~2.2× above the specific historical incident's own rate (6.74%, §1.2) — comfortably clears both without being so loose it would miss a genuine regression (see §2.1's negative-control derivation, which needs only a modest deviation above 15% to trip, not an extreme one).

### 1.5 Boundary case checked and deliberately NOT special-cased: genuine zero-confidence failures

```sql
SELECT action_code, period_year, period_quarter, validation_status, extraction_confidence
FROM financial_reports WHERE validation_status NOT IN ('pending','pending_extraction') AND extraction_confidence = 0.0;
-- => POW 2026-Q1, validation_status='failed', extraction_confidence=0.0   (1 row)
```

This matters directly against the deliverable's OWN suggested wording — see §2.3.

---

## 2. Design decisions

### 2.1 (a) RATE + volume floor — replaces the absolute count threshold

**Decision:** `lowconf_rate = lowconf_count_window / extracted_total_window`; **WARN iff `extracted_total_window >= 20 AND lowconf_rate > 0.15`.** Below the 20-row floor, PASS unconditionally regardless of rate (a 1-row 100%-low-confidence window is not evidence of anything — CLAUDE.md "plausibility check" convention, `feedback_nonzero_values_need_plausibility_check`).

Rejected alternative — keep the absolute count, just lower it: rejected because §1.2 already proves a HEALTHY 89-row batch contains 6 genuinely low-confidence rows (6.74%, well under any reasonable regression bar) yet 6 > any absolute count small enough to still catch a real spike in a *small* batch. An absolute count cannot simultaneously (i) stay sensitive on small batches and (ii) stay silent on large healthy batches — exactly the "guarantees re-fire on every future bulk reparse" framing in the row's own root_cause. A rate is scale-invariant by construction; the floor exists solely to avoid rate volatility on thin populations (a single bad row = "100%" of a 1-row window otherwise).

### 2.2 (c) Recency column — `COALESCE(published_at, parsed_at)`, not a bare column swap

**Decision:** anchor the recency window on `datetime(COALESCE(published_at, parsed_at)) > datetime('now','-7 days')`, applied to BOTH the numerator and the denominator (the window defines *which filings arrived recently*, not *which rows were touched recently* — both counts must use the same population).

Why not a bare `published_at`-only swap (no fallback): 2 currently-live non-pending rows (`DPM 2025-Q4`, `NVL 2026-Q2`, both `low_confidence` status — found live, §"published_at NULL" query) have `published_at IS NULL` — these are rows whose original insert happened before an SSC-scraped publish date was available, and (per the ON CONFLICT contract) `published_at` can never be backfilled by a later reparse. A bare `published_at`-only predicate would silently and *permanently* exclude these rows (and any future row inserted the same way) from C-04's population forever — a coverage regression, trading the "false positive on reparse" bug for a quieter "false negative, extraction genuinely regressing but nobody ever gets told" bug (this repo weighs false negatives worse than recurring low-severity false positives — `feedback_passive_health_masks_dead_data`, `feedback_composite_score_masks_dead_detector_pruned_table`). The `COALESCE` fallback is not an invented convenience — it is the **exact same fallback contract the application code itself already uses** at the point `published_at` is first computed (`parseBctcReport.ts:830-834`: `// real filing date (e.g. SSC doc.publishedAt). parsedAt is used ONLY as a [fallback] ... const publishedAt = callerPublishedAt ?? parsedAt;`). Mirroring the app's own designed fallback semantics in the auditor's read-side predicate is the more defensible choice than inventing a different one.

Why not "stop the reparse path from re-stamping `parsed_at`" (the row's other offered option): `parsed_at`'s current mutation semantics ("last time this row was written, successful or not") is independently useful for freshness/operability queries elsewhere (e.g. troubleshooting "when did the pipeline last touch this row") — changing its write semantics is a broader, riskier application-code change with unknown blast radius across every other `parsed_at` consumer (11 files reference it, per the `grep` in this task's investigation — `dataFreshnessTools.ts`, `slaStatusTools.ts`, `freshnessSlaMonitorJob.ts`, `bctcReparseJob.ts`, etc., NOT all audited here since this task is scoped to the auditor's own read-side predicate, not the write-side schema). Fixing this in the **auditor's own query** (read-side, this task's actual zone) rather than the write-side pipeline (`apps/mcp-server`, a different zone, a different, unbounded-scope task) is the minimal, in-zone, low-blast-radius fix — and `published_at`'s existing immutability was *already engineered on purpose* for precisely this "survive a reparse" property (its own commit message: `FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP`), so no new column or write-path change is needed at all — the correct immutable signal already exists, unused by C-04 today.

Live validation this closes the D1 gap: re-running the §1.3 18-row "drift class" query with the corrected recency column instead confirms **0** of those 18 rows land in the new window (they are `parsed_at`-recent but `published_at`-stale, so `COALESCE` correctly reads the old `published_at` and excludes them) — mechanically proving the fix, independent of whether any of those particular 18 rows currently carry low confidence.

### 2.3 (b) Population filter — status-based exclusion, NOT the deliverable's literal "`> 0`" suggestion

**Decision:** `validation_status NOT IN ('pending','pending_extraction')` — status-based, no confidence-value cutoff.

**Deliberate deviation from the deliverable's own literal wording** ("exclude ... and/or require `extraction_confidence IS NOT NULL AND > 0`"): §1.5 found a live counter-example — `POW 2026-Q1`, `validation_status='failed'`, `extraction_confidence=0.0` — a **genuine** extraction attempt that failed catastrophically (status is `failed`, not `pending`/`pending_extraction`; this is real signal, not a never-attempted shell). A `> 0` cutoff would silently exclude this exact row (and any future one shaped like it) from the low-confidence population it should legitimately count toward — reintroducing a **different** false-negative variant of the same "population mislabelling" bug this task exists to fix, just inverted. `extraction_confidence` is never actually NULL in this schema in practice (shell rows bind it explicitly to `0`, the column default is `1.0`, confirmed via `PRAGMA table_info`) so the `IS NOT NULL` half of the deliverable's suggestion is a no-op safety net, not a functioning filter — kept anyway as defensive SQL (costs nothing, protects against a future schema/writer change that starts leaving it genuinely NULL). The status-based exclusion is the correct, semantically-grounded predicate: `pending`/`pending_extraction` mean "extraction never ran"; every other status (`failed`, `low_confidence`, `passed`, `passed_with_warnings`) means "extraction ran and produced *some* confidence-scored result" — which is exactly the population C-04 is supposed to be measuring quality within.

### 2.4 (d) SSOT location — new script `scripts/auditor-db-checks.sh`, extending `db-integrity-counts.sh`'s exact discipline

**Decision:** one new script, following `scripts/db-integrity-counts.sh` line-for-line convention (already read in full, §0): direct host-bind read via `scripts/lib/sqlite-wal-guard.sh` (NOT `docker exec ... bun:sqlite`, the pattern `main.md`'s own C-01..C-16 table currently documents for every check) — this is a deliberate, explicit divergence from `main.md`'s general docker-exec convention, justified because (i) UC-ASL-P3's own title explicitly says *"extend `db-integrity-counts.sh` discipline"*, naming that exact precedent, not the docker-exec pattern; (ii) `db-integrity-counts.sh`'s own header comment documents why the docker-named-volume path was **retired** repo-wide (`FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT`, 2026-08-06: the live DB is a host bind-mount, `docker run`-based sidecar reads against it silently auto-created a stale empty named volume for 21 days undetected); (iii) a plain host-bind script is trivially unit-testable against a throwaway fixture DB (`MARKET_DB_HOST_PATH` override — exactly `db-integrity-counts.test.sh`'s own pattern, §4 below), whereas an in-container `docker exec` invocation is not testable without a live docker daemon. `main.md`'s C-01..C-16 table stays on its own docker-exec convention for every OTHER check (out of scope here) — only C-04's row is repointed at this new script.

The new script computes exactly ONE check today (`c04`) but is structured (single JSON output block, room for sibling `checks.<id>` keys) so a future UC-ASL-P3 pass can add more predicates into the SAME file without a redesign — mirroring how `db-integrity-counts.sh` itself already packs 4 unrelated metrics into one JSON payload from one query. UC-ASL-P3 (porting the OTHER Tier-2/3 checks) stays BACKLOG — not touched by this task.

---

## 3. Verbatim new-file content — `scripts/auditor-db-checks.sh` (NOT created this cycle — plan_only)

```bash
#!/usr/bin/env bash
# scripts/auditor-db-checks.sh — SSOT for Tier-2/3 system-auditor DB predicates that need
# more than a bare COUNT(*) threshold (rate-with-volume-floor, multi-column population
# filters). Extends scripts/db-integrity-counts.sh's exact discipline (deterministic,
# read-only, host-bind sqlite3, JSON stdout — see that script's own header for the fuller
# rationale of the read mechanism this one reuses verbatim).
#
# UC-ASL-P3 (auditor-signal-loop-P3, BACKLOG): the umbrella task to eventually port every
# Tier-2/3 predicate out of raw inline SQL in docs/agents/system-auditor/flow/main.md and
# into this file. This C-04 check is the FIRST predicate ported — added by
# FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE (2026-08-08). Future checks land as additional
# `checks.<id>` keys in the same JSON payload, computed by the same single sqlite3
# invocation below (extend the SELECT list + the IFS read, do not add a second process).
#
# C-04 predicate history (FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE spec,
# docs/handoffs/FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE-spec.md §1-2, full derivation):
#   D1 (recency): financial_reports.parsed_at is re-stamped on EVERY write (insert OR
#     reparse) — ON CONFLICT ... DO UPDATE SET parsed_at = excluded.parsed_at
#     (parseBctcReport.ts). A bulk historical reparse therefore re-enters old, already-known
#     rows into any parsed_at-anchored recency window. published_at is the immutable
#     counterpart — deliberately excluded from that same DO UPDATE SET clause
#     (FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP) so it survives every reparse
#     untouched. Anchor on COALESCE(published_at, parsed_at) — published_at when known,
#     parsed_at only as the same fallback the app's own write path already uses
#     (parseBctcReport.ts: `const publishedAt = callerPublishedAt ?? parsedAt`) for the
#     minority of rows inserted before an SSC-scraped publish date was available.
#   D2 (population): validation_status IN ('pending','pending_extraction') rows are
#     never-extracted shell rows (ensureFinancialReportShellRow.ts inserts them with
#     extraction_confidence bound to 0, not the schema's silent DEFAULT 1.0) — "not yet
#     extracted" is a different condition than "extracted at low confidence" and must not
#     share a population with genuinely low-confidence extractions.
#   Threshold: RATE with a minimum-volume floor, not an absolute count — an absolute count
#     cannot stay sensitive on a small batch while staying silent on a large healthy one
#     (a real 89-row batch was measured at 6.74% low-confidence, i.e. 6 rows > any count
#     threshold small enough to matter on a 5-row batch).
#
# DB ACCESS: same host-bind + WAL-guard mechanism as db-integrity-counts.sh (read this
# script's header for the fuller rationale — do NOT reintroduce docker-exec here).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB="${MARKET_DB_HOST_PATH:-$REPO_ROOT/data/live/market.db}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# C-04 tunables — env-overridable for testing only, NOT a caller-settable designated
# parameter in the system-auditor flow sense (dev-standards.md AUD-CP-1): these are the
# spec-internal threshold values this file IS the authority for.
C04_RATE_THRESHOLD_PCT="${C04_RATE_THRESHOLD_PCT:-15}"
C04_VOLUME_FLOOR="${C04_VOLUME_FLOOR:-20}"
C04_WINDOW="${C04_WINDOW:--7 days}"

# shellcheck source=./lib/sqlite-wal-guard.sh
source "$REPO_ROOT/scripts/lib/sqlite-wal-guard.sh"
READ_URI="$(wal_guard_read_uri "$DB")"
READ_MODE="$(wal_guard_read_mode "$DB")"

PROBE_STDERR="$(mktemp)"
set +e
ROW="$(sqlite3 "$READ_URI" "
SELECT
  (SELECT count(*) FROM financial_reports
     WHERE validation_status NOT IN ('pending','pending_extraction')
       AND datetime(COALESCE(published_at, parsed_at)) > datetime('now','${C04_WINDOW}')),
  (SELECT count(*) FROM financial_reports
     WHERE validation_status NOT IN ('pending','pending_extraction')
       AND extraction_confidence IS NOT NULL AND extraction_confidence < 0.2
       AND datetime(COALESCE(published_at, parsed_at)) > datetime('now','${C04_WINDOW}'));
" 2>"${PROBE_STDERR}")"
PROBE_EXIT=$?
set -e

if [ $PROBE_EXIT -ne 0 ]; then
  STDERR_MSG="$(cat "${PROBE_STDERR}" 2>/dev/null || true)"
  rm -f "${PROBE_STDERR}"
  echo "[AUDITOR-DB-CHECKS] PROBE FAILURE (exit ${PROBE_EXIT}, DB=${DB}, read_mode=${READ_MODE}): ${STDERR_MSG}" >&2
  exit 1
fi
rm -f "${PROBE_STDERR}"
if [ -z "${ROW// }" ]; then
  echo "[AUDITOR-DB-CHECKS] PROBE FAILURE: sqlite returned empty result — DB path wrong (${DB}, read_mode=${READ_MODE})" >&2
  exit 1
fi

IFS='|' read -r EXTRACTED_TOTAL LOWCONF_COUNT <<EOF
${ROW}
EOF

case "$EXTRACTED_TOTAL" in
  ''|*[!0-9]*)
    echo "[AUDITOR-DB-CHECKS] PROBE FAILURE: extracted_total_window non-numeric ('${EXTRACTED_TOTAL}') — aborting (ROW='${ROW}')" >&2
    exit 1
    ;;
esac
case "$LOWCONF_COUNT" in
  ''|*[!0-9]*)
    echo "[AUDITOR-DB-CHECKS] PROBE FAILURE: lowconf_count_window non-numeric ('${LOWCONF_COUNT}') — aborting (ROW='${ROW}')" >&2
    exit 1
    ;;
esac

# Rate as a percentage, 2dp; 0.00 (not null/div-by-zero) when population is 0 — floor
# below already makes the verdict PASS regardless when EXTRACTED_TOTAL < floor.
if [ "$EXTRACTED_TOTAL" -gt 0 ]; then
  RATE_PCT="$(awk -v n="$LOWCONF_COUNT" -v d="$EXTRACTED_TOTAL" 'BEGIN{printf "%.2f", (n*100.0)/d}')"
else
  RATE_PCT="0.00"
fi

VERDICT="PASS"
if [ "$EXTRACTED_TOTAL" -ge "$C04_VOLUME_FLOOR" ]; then
  TRIP="$(awk -v r="$RATE_PCT" -v t="$C04_RATE_THRESHOLD_PCT" 'BEGIN{print (r>t)?"1":"0"}')"
  if [ "$TRIP" = "1" ]; then
    VERDICT="WARN"
  fi
fi

cat <<JSON
{
  "scan_ts": "${TS}",
  "source": "scripts/auditor-db-checks.sh (deterministic — verbatim sqlite output; SSOT per UC-ASL-P3)",
  "read_mode": "${READ_MODE}",
  "checks": {
    "c04": {
      "window": "${C04_WINDOW}",
      "recency_column": "COALESCE(published_at, parsed_at)",
      "population_filter": "validation_status NOT IN ('pending','pending_extraction')",
      "extracted_total_window": ${EXTRACTED_TOTAL},
      "lowconf_count_window": ${LOWCONF_COUNT},
      "lowconf_rate_pct": ${RATE_PCT},
      "volume_floor": ${C04_VOLUME_FLOOR},
      "rate_threshold_pct": ${C04_RATE_THRESHOLD_PCT},
      "verdict": "${VERDICT}"
    }
  }
}
JSON
```

Live dry-run of this exact query (2026-08-08, already executed against `data/live/market.db` as part of this
investigation, §1.1/§1.3): `extracted_total_window=0, lowconf_count_window=0, verdict=PASS` — floor not met
(0 genuinely-extracted filings arrived, by `published_at`, in the trailing 7 days; the 12 shell rows are
correctly excluded by the population filter, and the 18 stale-reparse rows are correctly excluded by the
recency fix). This is the correct, healthy verdict for today's actual state.

---

## 4. Verbatim diff — `docs/agents/system-auditor/flow/main.md` (NOT edited this cycle — plan_only)

**Before** (`:862`, inside the `### DB Write Integrity Checks (C-01 through C-16)` table):
```markdown
| C-04 | market.db | `SELECT count(*) FROM financial_reports WHERE datetime(parsed_at) > datetime('now','-7 days') AND extraction_confidence < 0.2` | ≤ 5 |
```

**After:**
```markdown
| C-04 | market.db | `bash scripts/auditor-db-checks.sh` — read `.checks.c04.verdict` directly (do NOT re-derive from raw SQL — this check moved off inline SQL, FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE, 2026-08-08: rate-with-volume-floor over `COALESCE(published_at, parsed_at)`-anchored recency, `pending`/`pending_extraction` excluded from population — see script header for full rationale) | `.checks.c04.verdict == "PASS"` (WARN iff `extracted_total_window >= 20 AND lowconf_rate_pct > 15`) |
```

**Emit-block actual/expected mapping** (no change needed to the generic EMIT SEQUENCE block itself, `:882-902`
— only the C-04-specific values an agent fills into its placeholders change): on a C-04 WARN, `actual_value` =
`.checks.c04.lowconf_rate_pct` (e.g. `"23.5%"`), `expected_value` = `"<=15% (floor: >=20 extracted rows in
window)"`, `detail` should cite `extracted_total_window`/`lowconf_count_window` from the same JSON so the
signal payload is self-explanatory without re-running the script.

No other C-01..C-16 row changes — every other check stays on the existing inline-SQL / docker-exec
convention (out of scope, §2.4).

---

## 5. Negative-control design (acceptance criterion, 2nd clause)

Acceptance text: *"a negative-control synthetic cohort (>15% of a >=20-row genuinely-extracted batch under
0.2 confidence) STILL trips it."*

**No live natural negative control exists today** (unlike the DOCAUDIT sibling spec's precedent) — today's
live extracted-population-in-window is 0 (§3), and the all-time baseline is a healthy 4.07% (§1.4). A
synthetic fixture is required; this is the CORRECT and expected shape for this check (a rate detector's
negative control is inherently a constructed "what if a regression happened" scenario, not something to
wish into existing production data).

**Formal fixture procedure** (mirrors `scripts/db-integrity-counts.test.sh`'s own `MARKET_DB_HOST_PATH`
fixture-override pattern — exact same seam, already proven, no new test infra needed):

1. Build a throwaway sqlite fixture DB (`mktemp -d`, matching `db-integrity-counts.test.sh:58`), create a
   minimal `financial_reports` table (columns: `id, action_code, sort_key, validation_status,
   extraction_confidence, parsed_at, published_at` — the subset this script's query touches).
2. Insert 20 rows, `validation_status='passed'`, `published_at` = `datetime('now')`, `parsed_at` = same:
   4 rows at `extraction_confidence=0.05` (low-confidence, 20% of 20 — deliberately above the 15% bar with
   headroom, not edge-balanced against float rounding), 16 rows at `extraction_confidence=0.9` (healthy).
3. Run `MARKET_DB_HOST_PATH=<fixture path> bash scripts/auditor-db-checks.sh` — expect
   `extracted_total_window=20, lowconf_count_window=4, lowconf_rate_pct=20.00, verdict="WARN"`.
4. **Companion no-blanket-suppression checks in the same fixture:**
   - Add 100 more rows, `validation_status='pending_extraction'`, `extraction_confidence=0` — re-run, assert
     `extracted_total_window` UNCHANGED at 20 (population filter holds even under a large pending-row flood,
     proving D2's fix does not get diluted/renormalized by shell-row volume).
   - Lower the 4 low-confidence rows to 2 (10% of 20, under the 15% bar) — re-run, assert `verdict="PASS"`
     (proves the fix does not blanket-suppress-to-always-WARN; a rate-based check must be able to say
     "healthy" too).
   - Reduce total extracted rows to 10 (below the 20 floor) with all 10 at `extraction_confidence=0.01`
     (100% low-confidence) — re-run, assert `verdict="PASS"` (floor holds: thin populations never trip
     regardless of rate — the exact plausibility-check convention this repo already applies elsewhere).

**What would defang the check (must NOT ship):** any implementation that computes `lowconf_rate_pct` but
never applies `C04_VOLUME_FLOOR` (would re-fire on any single new bad extraction, reopening the exact
"sensitive on small batches" problem §2.1 already showed an absolute count also has); or that filters
population by `extraction_confidence > 0` instead of `validation_status` (would silently drop genuine
zero-confidence failures like the live `POW 2026-Q1` row, §1.5/§2.3).

---

## 6. Acceptance-criteria verification plan

| Acceptance clause | How this fix satisfies it | Evidence |
|---|---|---|
| Replaying the live 2026-07-19/20 reparse batch emits ZERO C-04 signal | New predicate against that batch's own rows: 89 extracted, 6 low-confidence, rate=6.74% < 15% → PASS | §1.2 (live-derived, exact query given) |
| Negative control: >15% of a >=20-row genuinely-extracted batch under 0.2 confidence STILL trips it | Synthetic fixture, §5 step 3: 20/20 extracted, 4 low-confidence (20%) → WARN | §5 (fixture procedure — no live cohort available to reuse, by design) |
| No pending*/pending_extraction row appears in the counted population | Population filter is `validation_status NOT IN ('pending','pending_extraction')`, applied identically to both numerator and denominator; live-proven against the current 12-row pending_extraction batch (§1.1: contributes 0 to both counts) | §1.1, §5 step 4 (flood-of-pending-rows companion check) |

Post-landing verification (for whoever implements + QA): run `bash scripts/auditor-db-checks.sh` against
live `data/live/market.db` immediately after landing and confirm the JSON matches this spec's §3 dry-run
(`extracted_total_window=0, verdict=PASS` — will drift as new filings land, that's expected/healthy; the
structural shape, not the exact numbers, is what to re-check).

---

## 7. Implementation notes for whoever ships this

- New file: `scripts/auditor-db-checks.sh` (§3, verbatim). New test file (not drafted here — plan_only, but
  strongly recommended before landing per this repo's CI/verify conventions):
  `scripts/auditor-db-checks.test.sh`, following `scripts/db-integrity-counts.test.sh`'s exact fixture
  pattern (§5 gives the fixture rows to use as the T1-style assertions).
- One edit to `docs/agents/system-auditor/flow/main.md`: the C-04 table row only (§4). No other row/section
  in that file changes.
- `scripts/emit-audit-signal.sh` itself is untouched — only the C-04-specific `actual_value`/`expected_value`
  strings an agent fills in change (§4, no code change, prose-only).
- Do NOT fold UC-ASL-P3's other predicates (C-11 status-value bug flagged in passing at `main.md:849` — a
  separate, already-flagged, NOT-this-task defect — or any other C-xx) into this same change; UC-ASL-P3
  stays BACKLOG.
- Do NOT touch `apps/mcp-server/src/application/usecases/parseBctcReport.ts` or
  `ensureFinancialReportShellRow.ts` — both were read for evidence only (§1.3, §2.2); this fix is entirely
  read-side (the auditor's own query), zero application-code changes needed or proposed.
- `db-integrity-counts.sh`'s OWN `low_confidence_reports_count` metric (`extraction_confidence<0.2`, no
  population/recency filter at all) is a DIFFERENT, unrelated metric family already flagged as a known
  divergence in that script's own header comment (`FIX-AUDITOR-EMPTYTABLE-CHECK-NO-WRITER-DISCRIMINATOR`
  note, "an unrelated, still-open predicate issue tracked by FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE, NOT
  touched here") — confirmed still live and still carrying the identical D2 population defect (it would
  currently count the 12 `pending_extraction` shell rows too, since it has no status filter at all). **Not
  fixed by this task** (different script, different consumer — the `cron-db-data-integrity` sweep, not
  system-auditor) — flagging for PO to consider a follow-up row if that metric's own false-positive risk
  ever fires in practice; out of this task's zone (`docs/agents/system-auditor/flow/`).

---

## [Developer] Implementation Record (2026-08-23 — plan implemented as-designed, no deviations)

- **Files created:**
  - `scripts/auditor-db-checks.sh` — §3's verbatim design (recency `COALESCE(published_at, parsed_at)`,
    population `validation_status NOT IN ('pending','pending_extraction')`, rate-with-volume-floor
    threshold `extracted_total_window>=20 AND lowconf_rate_pct>15`). One deviation from the verbatim §3
    listing, found live while smoke-testing (not narrated, actually reproduced): both `awk printf "%.2f"`
    calls needed `LC_NUMERIC=C` — this host's `LC_NUMERIC=fr_FR.UTF-8` default makes `awk` emit a comma
    decimal separator (`"0,00"`), which is invalid JSON and would have silently broken every downstream
    JSON consumer of this script's stdout. Fixed in the same file, documented inline.
  - `scripts/auditor-db-checks.test.sh` — 10 scenarios / 29 assertions: §5's negative-control fixture (T1,
    20 rows/4 low-conf → WARN), the two companion checks (T2 pending-flood non-dilution, T3 10%-rate →
    PASS), the volume-floor check (T4, 10 rows 100% low-conf → PASS), a direct replay of §1.2's real
    2026-07-19/20 89-row/6.74% historical incident (T5 → PASS, proving the exact batch that minted this
    task is healthy under the new predicate), a D1 recency check (T6, stale `published_at` + fresh
    `parsed_at` → excluded), the D2/§1.5 `failed`+`0.0` boundary (T7 → counts, not excluded), 2 PROBE
    FAILURE fail-loud checks (T8/T9, parity with `db-integrity-counts.test.sh`), and a LIVE replay against
    the real `data/live/market.db` (T10, graceful SKIP if absent).
- **Files modified:** `docs/agents/system-auditor/flow/main.md` — C-04 table row (§4's diff, verbatim
  intent: points at `bash scripts/auditor-db-checks.sh` / `.checks.c04.verdict`, no more inline SQL) +
  the ISO8601-format-safety table's `financial_reports.parsed_at` row (marked moot for this file's inline
  convention, since C-04 moved out of it) + a new C-04 emit-block mapping paragraph before the EMIT
  SEQUENCE section (§4's "Emit-block actual/expected mapping" verbatim). `docs/policies/dev-standards.md`
  — new CANONICAL block under § Script Persistence. `docs/WORK.md` — one-liner summary appended.
  **Also in the same task, NOT part of this spec (separate router-dispatched defects in the same file,
  same "timestamp/window doesn't mean what it assumes" family):** C-01/C-02/C-14 `date >= date('now',...)`
  → `date = date('now',...)` (the open-ended bound spanned every date from the anchor day through today
  instead of the single intended trading day) + a related weekend-guard Sat/Sun day-offset fix (`-3 day`
  never resolves to Friday for either day; split into `-1 day` Sat / `-2 day` Sun) + a new invariant note
  documenting that `daily_ohlcv` same-day coverage (~130) is by design, not a regression, and warning
  against a same-day-vs-trailing-median alarm on `updated_at`.
- **Tests written:** `scripts/auditor-db-checks.test.sh` — 29/29 GREEN.
- **Live verification (not narrated — actually executed against `data/live/market.db` via
  `docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e ...` / direct host-bind `sqlite3`):**
  `bash scripts/auditor-db-checks.sh` → `extracted_total_window=1, lowconf_count_window=0, verdict=PASS`
  (2026-08-23 — below §3's dry-run's own `0`, drift is expected/healthy per §6's post-landing note); C-04
  all-time baseline (no window) `validation_status NOT IN ('pending','pending_extraction') AND
  extraction_confidence<0.2` = 10/221 = 4.5%, still comfortably under 15%. C-01/C-02 isolated-operator
  proof (weekday-shape replay, anchor=2026-08-19): `>=` (spans 2 days) = 1015 codes/1796 rows vs `=`
  (single day) = 904/904.
- **tsc status:** N/A — no `apps/` TS/Go touched (shell scripts + docs only).
- **Full suite:** N/A (shell-only change; `scripts/auditor-db-checks.test.sh` is the relevant regression
  suite, 29/29 GREEN, run standalone above).
- **Docs updated:** `docs/agents/system-auditor/flow/main.md`, `docs/policies/dev-standards.md`,
  `docs/WORK.md` (see Files modified above).
- **Graphify:** skipped (no Skill-tool binding — structural gap, see `docs/agents/developer/flow/main.md`
  known-drift note, 2026-08-15).
- **Board:** `FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE` lane-moved `in_progress[]` → `review[]`,
  `next_agent: qa`, `.head` reset idle via `scripts/orch-apply.sh`.
