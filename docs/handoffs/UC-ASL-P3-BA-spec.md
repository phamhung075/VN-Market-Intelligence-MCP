<!-- size-justification: SPRINT-S/M umbrella spec — 13 FRs covering a 16-check DB-predicate freeze,
     a DB-access-pattern supersession decision, and 4 sibling-ticket integration points (C-04/C-06/
     C-11/C-12). Structural load-bearing for architect+pm+dev chain; trimming would force the next
     reader to re-derive prior art already resolved here. -->

# BA Spec — UC-ASL-P3

**Sprint:** ULTRACODE-AUDIT-FIXALL
**Source:** `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#auditor-signal-loop-P3` (verdict: RESCOPE)
**Zone (as dispatched):** `cross-service/` — see ARCH-RATIFY-6, recommend narrowing
**Chain:** ba → architect → pm → dev → qa
**BA task_id:** UC-ASL-P3
**Created:** 2026-08-14
**Status:** SPEC COMPLETE — ZERO PO BLOCKERS

---

## Summary

`docs/agents/system-auditor/flow/main.md` embeds 16 DB-integrity predicates (C-01..C-16) plus a
BCTC healthy-idle gate (B-05), a URL-shape check (B-09), and a stale-pending check (B-13) as raw
SQL/bash the LLM auditor is trusted to execute correctly every cycle — and at least 3 of those 16
checks are confirmed-broken today (C-04 recurring false-WARN, C-06 off-market false-fire, C-11
always-false-fail) with a 4th (C-12) partially broken. Freeze all of it into one deterministic
script, `scripts/auditor-db-checks.sh`, extending `scripts/db-integrity-counts.sh`'s proven
discipline (host-bind read, `sqlite-wal-guard.sh`, fail-loud probe guard, single JSON stdout) —
removing both the correctness risk (narrated SQL can silently drift) and the trust dependency
(an LLM re-deriving a weekend-window/NULL-guard branch correctly every single cycle).

---

## Prior Art — read before designing anything new

This ticket has **4 sibling rows already carrying design work**, discovered by re-reading each one
live rather than trusting summaries. Do not re-derive what they already settled.

| Sibling | Status | What it already decided |
|---|---|---|
| `FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE` | REVIEW, plan_only, owner=po | **Full working script skeleton** at `docs/handoffs/FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE-spec.md` §3 — `scripts/auditor-db-checks.sh` does not exist yet; this is the FIRST predicate designed for it. Chose **host-bind + `sqlite-wal-guard.sh`**, explicitly diverging from `main.md`'s docker-exec convention. |
| `FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE` | BACKLOG, owner=architect | fix_spec: prefer age-of-last-write vs SLA over the fixed 3h count; confirmed false-fire on a Saturday (`status_note` 2026-08-08). No script/SQL drafted yet. |
| `FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE` | BACKLOG, owner=architect | fix_spec: `status='done'`→`'success'`, ISO8601 strcompare→epoch-seconds compare, off-season 0 should be INFO not HIGH ("apply the same pattern already prescribed for C-06"). No script/SQL drafted yet. |
| `FIX-AUDITOR-C12-READONLY-BLINDED-AND-TABLENAME` | BACKLOG, owner=architect | fix_spec: **"mirror `scripts/db-integrity-counts.sh` as shipped"** — independently arrives at the same host-bind decision as the C-04 spec. Table-name half (`market_messages_price_history`) already confirmed a phantom string, zero hits repo-wide, both at 08-08 and re-confirmed this cycle. |

**Three independent sources (C-04's own decision, C-12's own fix_spec, and this ticket's own title
"extend db-integrity-counts.sh discipline") converge on the same DB-access answer — see FR-2.**

---

## Scope Boundary

**IN scope** (embedded into `scripts/auditor-db-checks.sh`): C-01 through C-16, B-05, B-09, B-13 —
every check whose predicate is a SQL query against a live SQLite DB.

**OUT of scope** (stays where it is, separately owned — see FR-13): `FIX-AUDITOR-TASKBOARD-OVERFLOW-PREDICATE-WIP-ONLY`
(a `jq` count over `orch-state.json`, not a DB query) and `FIX-AUDITOR-DOCAUDIT-MEMORY-PATH-PREDICATE`
(a file-existence check, Tier-3 §Existing Doc/Memory Audit, zero SQL). Both are members of the same
"predicate-drift, architect-owned" family label used in the 2026-08-08 EPIC-AUDITOR-DETECTOR-CORRECTNESS-DRAIN
triage, but that triage's own text already confirms they "only resemble [C-11] in the title, not in
the technical content" — folding them in here would be scope creep this task should not absorb.

---

## FR-1 — New script `scripts/auditor-db-checks.sh`

**DDD layer:** Interface (CLI contract) wrapping Application (per-check orchestration) wrapping
Infrastructure (DB read).
Extends `scripts/db-integrity-counts.sh`'s exact discipline: `set -euo pipefail`, `PROBE_STDERR`
capture with explicit exit-code check (never `|| true`-swallowed), a `num()`-style non-numeric
guard on every canonical count, single JSON stdout. Starts from the C-04 skeleton already authored
in `FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE-spec.md` §3 (`checks.<id>`-keyed JSON object,
`MARKET_DB_HOST_PATH` override) and extends it with the remaining 15 checks as sibling
`checks.<id>` keys — computed in the SAME single `sqlite3` invocation per DB (mirrors
`db-integrity-counts.sh`'s "one invocation, all counts" convention), not one process per check.

## FR-2 — DB access pattern: host-bind + `scripts/lib/sqlite-wal-guard.sh`, NOT docker exec

**DDD layer:** Infrastructure.
**This ADOPTS, not re-litigates, the FIX-AUDITOR-C04/C12 precedent (Prior Art table above).** It
also **supersedes** this ticket's own 2026-07-12 RESCOPE note, which explicitly said "use docker
exec... NOT db-integrity-counts.sh's `file:?immutable=1` open pattern... WAL-blind." That objection
is now stale: it predates the 2026-08-06 `sqlite-wal-guard.sh` fix (`FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT`),
which made the open pattern WAL-*conditional* (`immutable=1` only when `-wal` is 0 bytes, `mode=ro`
otherwise) — the exact blindness the RESCOPE note was warning about no longer applies to the
*current* `db-integrity-counts.sh` discipline, only to the pre-08-06 unconditional version it was
written against. Flagged **ARCH-RATIFY-1** (confirm, not re-derive) since it overrides dispatched
text, but not a PO blocker — this is the same technical judgment three independent design passes
already reached.

DB paths needed (verified this cycle — every relevant service shares the identical
`./data/live:/app/data` host bind mount, `docker-compose.yml`, so `/app/data/<x>.db` →
`$REPO_ROOT/data/live/<x>.db` is a safe, uniform substitution):
- `MARKET_DB_HOST_PATH` (existing convention, default `$REPO_ROOT/data/live/market.db`) — C-01/02/03/04/05/06/07/08/09/13/14/15/16 + B-05/B-09/B-13.
- **NEW** `PDF_EXTRACTOR_DB_HOST_PATH` (same naming convention, default `$REPO_ROOT/data/live/pdf_extractor.db`) — C-10/C-11.
- C-12 ("all non-empty DBs") needs a third pattern: enumerate every `id`/`path` where
  `engine=="sqlite"` from `system-map.json .project.infrastructure.databases[]`, apply the same
  `/app/data/` → `$REPO_ROOT/data/live/` substitution per entry, skip 0-byte/absent files (mirrors
  `main.md`'s own existing "skip DBs with 0-byte file" rule).

## FR-3 — Freeze C-01/02/03/05/07/08/09/13/14/15/16 verbatim

**DDD layer:** Infrastructure (frozen SQL) + Application (WINDOW/NULL-guard logic, FR-8).
No predicate change — none of these 11 checks is flagged defective anywhere in the record. Port
the exact SQL text currently in `main.md` (§ `DB Write Integrity Checks (C-01 through C-16)`,
:953-970) including C-08's already-corrected form (2h window, ISO8601-safe `datetime()` wrap,
landed 2026-08-06 — port the *current*, already-fixed SQL, not a pre-fix version).

## FR-4 — Fold in C-04's corrected predicate (ready-made — integrate, do not re-derive)

**DDD layer:** Infrastructure + Application (rate-with-volume-floor threshold).
`FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE`'s spec already contains the finished design:
`COALESCE(published_at, parsed_at)` recency anchor (mirrors the app's own `parseBctcReport.ts`
fallback), `validation_status NOT IN ('pending','pending_extraction')` population filter, and a
rate-with-volume-floor threshold (`>15%` AND `extracted_total_window >= 20`) replacing the old
absolute `<=5` count. Port this logic into the shared script's per-`market.db` invocation as one
more `checks.c04` key — pure integration, no new design.

## FR-5 — Fold in C-06's corrected predicate (new design needed)

**DDD layer:** Application (threshold/calendar policy) + Infrastructure (query).
Per its own fix_spec: replace the fixed 3h absolute-count rule (hour-of-day-blind AND
weekday-blind — confirmed false-fire on a Saturday) with age-of-last-write vs a generous SLA.
Open question (**ARCH-RATIFY-2**, non-binding BA note: reuse the existing `SLA Resolver`
machinery at `main.md:518-544` rather than inventing a second calendar mechanism, since that
resolver already handles VN-market-hours-adjacent logic for `bctc-discover` and the same shape
— in-window vs out-of-window — applies here).

## FR-6 — Fold in C-11's corrected predicate (new design needed)

**DDD layer:** Infrastructure (query correctness) + Application (severity policy).
Per its own fix_spec: (a) `status='done'` → `status='success'` (the only real terminal-OK value —
live values are `failed`/`processing`/`success`, confirmed via `DISTINCT status`). (b) ISO8601-vs-
`datetime()` strcompare bypass — an epoch-seconds compare or the same `datetime(col) <op>
datetime('now', ...)` wrap C-08 already uses (architect's idiom choice — **ARCH-RATIFY-3**, bundle
with the C-06/C-11 shared design question below). (c) an out-of-earnings-season zero should read
INFO, not HIGH — explicitly asks to reuse "the same pattern already prescribed for C-06," i.e. the
same SLA-Resolver-reuse decision as FR-5 (one open design question, two checks — resolve once).

## FR-7 — C-12 migration (WAL-blinding fixed for free by FR-2; table-name half is a non-issue)

**DDD layer:** Infrastructure.
`FIX-AUDITOR-C12-READONLY-BLINDED-AND-TABLENAME` root_cause part (a) — `{readonly:true}` bun:sqlite
inside `docker exec` going blind to the writer's `-shm`/`-wal` after a restart — is the exact class
`sqlite-wal-guard.sh` exists to fix, and is resolved automatically once C-12 moves onto the FR-2
access pattern; no separate predicate design needed here, only the migration FR-2 already requires.
Part (b) — `market_messages_price_history`, a table that never existed — has zero hits anywhere in
the repo's current static text (re-confirmed this cycle, repeats the 08-08 finding); it was a
one-off 2026-06 signal-payload string, not a literal query in the current C-12 spec (`PRAGMA
integrity_check`, table-agnostic). No code fix required for part (b); carry forward
**ARCH-RATIFY-4** ("re-verify against a live C-12 emission before formally closing that half")
unchanged — not new work this task must do.

## FR-8 — Weekend/holiday WINDOW + NULL-guard ported to bash

**DDD layer:** Application.
Per the RESCOPE note itself: compute the weekend WINDOW (`main.md:915-924`) and validate long-form
datetime modifiers (`main.md:926-931`, the "NULL-guard") as real bash logic inside the script —
"killing the narrated NULL-guard" the LLM currently re-executes as prose every cycle. This is the
core value of the whole freeze, not a footnote: today correctness depends on an agent re-deriving
a DOW branch and a `datetime('now','<modifier>') IS NULL` preflight correctly every single
invocation; after this FR it is compiled once and never re-derived.

## FR-9 — B-05 / B-09 / B-13 embedded verbatim

**DDD layer:** Infrastructure + Application (B-05's queue+host-liveness corroboration gate).
Port `main.md:546-574` (B-05 Healthy-Idle Gate — needs VPS-host-liveness as a CLI arg, since
Tier-1 already probes it earlier in the same audit cycle and the script must not re-probe),
`:598-609` (B-09), `:611-623` (B-13) verbatim — no predicate changes.

## FR-10 — Unified JSON output contract

**DDD layer:** Interface.
One JSON object per invocation, `checks.<check_id>` map, each entry at minimum
`{actual, expected, verdict: "PASS"|"FAIL"|"SKIP-invalid"}` plus whatever diagnostic fields the
corrected predicates need for signal payloads (C-04's `lowconf_rate_pct`, C-06's computed
age-hours, C-11's off-season flag). `SKIP-invalid` is FR-8's NULL-guard terminal state — the
existing prose's "mark check as INVALID-SQL... continue to next check" contract, now a real enum
value instead of a narrated one; one bad modifier must not blind the other checks in the same run.

## FR-11 — `main.md` replacement: Tier-2 + Tier-3 repointed at the script

**DDD layer:** Interface (agent flow-doc orchestration).
Tier-2's duplicate "DB Freshness Spot Checks (C-06, C-07)" block (`:576-596` — a SECOND, independent
copy of the same C-06/C-07 SQL that also lives in the Tier-3 C-table, `:960-961` — a real drift risk
this task incidentally closes) plus B-05/B-09/B-13 (`:546-623`), and Tier-3's `DB Write Integrity
Checks (C-01 through C-16)` table (`:899-976`), are each replaced by: run script → paste stdout under
a `RAW-CHECKS:` fenced block (same fence discipline as `RAW-PROBE`, `main.md:149`) → per FAIL/WARN
row, call the **already-shipped** `scripts/emit-audit-signal.sh` (UC-ASL-P2, APPROVED 2026-07-16).
**The original RESCOPE note's "ONLY IF/WHEN P2 lands" dependency is now moot** — P2 has landed and is
already wired into both the Tier-2 (`:626-663`) and Tier-3 (`:978-1010`) EMIT sites; this task only
changes what feeds those existing calls' `--summary`/`--detail-json` placeholders, not the emit
plumbing. Use Write-based full-block replacement + `git diff` verify, never the Edit tool (same
known multiline-strip harness bug UC-ASL-P2's FR-7 already flagged for this exact file).

## FR-12 — Repoint predicate-correction rows at the script as SSOT

**DDD layer:** n/a (task-board bookkeeping).
Per the RESCOPE note's explicit instruction: `FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE` and
`FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE` should close or repoint once their corrected predicates
land inside `scripts/auditor-db-checks.sh` — their own rows should not also independently edit
`main.md`'s now-frozen C-table text. Recommend the same disposition for
`FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE` (its own `related[]` already names UC-ASL-P3) and,
more provisionally, `FIX-AUDITOR-C12-READONLY-BLINDED-AND-TABLENAME` (FR-7). PO/architect's call
on exact disposition (close vs repoint vs leave open pending FR-11 landing).

## FR-13 — Explicit scope carve-out (see Scope Boundary above)

`FIX-AUDITOR-TASKBOARD-OVERFLOW-PREDICATE-WIP-ONLY` and `FIX-AUDITOR-DOCAUDIT-MEMORY-PATH-PREDICATE`
are NOT folded into this script. No board-row action needed for either — they stay independently
owned, `main.md` prose/jq fixes.

---

## Edge Cases

**EC-1 — Weekend window has no public-holiday awareness.** `main.md`'s current weekend guard only
branches on Sat/Sun, not the VN market holiday calendar. Freezing it into bash preserves the SAME
gap unchanged — adding holiday-calendar coverage is explicitly OUT of this task's scope, not a new
defect it must fix.

**EC-2 — One bad datetime modifier must not blind the whole run.** Per FR-8/FR-10, a NULL-guard
failure on any single check produces that check's `SKIP-invalid` verdict and the script continues
to the remaining checks in the same invocation — never an all-or-nothing abort.

**EC-3 — C-12 0-byte/absent host DB files must skip cleanly.** Mirrors `main.md`'s existing rule;
a genuinely-empty, not-yet-provisioned service DB is a legitimate skip, not a PROBE FAILURE.

**EC-4 — `PDF_EXTRACTOR_DB_HOST_PATH` has no existing consumer.** Unlike `MARKET_DB_HOST_PATH`
(already cross-checked by `scripts/db-integrity-mount-drift-check.sh` against the live container
mount), this is a brand-new env var with no mount-drift coverage yet. Flagged **ARCH-RATIFY-5**
(extend the drift-check script too, or defer) — non-blocking, safe to defer to a follow-up.

**EC-5 — Multi-DB-connection shape for C-12's loop.** `db-integrity-counts.sh`'s proven pattern is
ONE `sqlite3` process per DB with every check batched into a single SELECT list. This script needs
at least 2 DB connections (`market.db`, `pdf_extractor.db`) plus C-12's N-way loop over every
`system-map.json`-listed DB. Whether C-12 reuses the market.db/pdf_extractor.db connections already
open for other checks, or opens a fresh one per DB in its own loop, is an architect implementation
choice (**ARCH-RATIFY-7**) — not a business question.

**EC-6 — C-09 threshold stays calibrated to the current single active fetcher.** `main.md:963`'s
note explains the `>=3`-of-12 threshold reflects today's live TradingEconomics-only fetcher, not
the full 12-column design. Freeze verbatim — do not "improve" this threshold as part of the port;
raising it is a separate, `TRADING_ECONOMICS_API_KEY`-gated follow-up already tracked elsewhere.

**EC-7 — UTF-8/VN diacritics.** No new risk — matches UC-ASL-P2's EC-6 finding (pure ops/infra
script, no VN-specific text field touches this path).

---

## DDD Layer Map

| Requirement | File(s) | DDD Layer | Reason |
|---|---|---|---|
| FR-1, FR-10 | `scripts/auditor-db-checks.sh` (skeleton, JSON contract) | Interface | CLI boundary called by the flow doc |
| FR-2 | `scripts/lib/sqlite-wal-guard.sh` (reused), new `PDF_EXTRACTOR_DB_HOST_PATH` | Infrastructure | DB read-access mechanism |
| FR-3, FR-9 | `scripts/auditor-db-checks.sh` (frozen SQL) | Infrastructure | Straight port, no logic change |
| FR-4, FR-5, FR-6 | `scripts/auditor-db-checks.sh` (corrected predicates) | Infrastructure + Application | Query correctness + threshold/severity policy |
| FR-7 | `scripts/auditor-db-checks.sh` (C-12 loop) | Infrastructure | Multi-DB integrity scan |
| FR-8 | `scripts/auditor-db-checks.sh` (WINDOW/NULL-guard functions) | Application | Compiled decision logic, was narrated prose |
| FR-11 | `docs/agents/system-auditor/flow/main.md` | Interface | Agent flow-doc call sites |
| FR-12, FR-13 | `docs/data/orch/orch-state.json` task rows | n/a | Task-board bookkeeping, not code |

---

## Acceptance Criteria (for pm/dev/qa)

**AC-1** `scripts/auditor-db-checks.sh` exists, is executable, sources `scripts/lib/sqlite-wal-guard.sh`
(never docker-exec, never bare `sqlite3 -readonly`), and its single JSON stdout carries a
`checks.<id>` entry for every one of C-01..C-16 + B-05 + B-09 + B-13 (≥19 keys).

**AC-2** A replay of the fixture batch already designed in `FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE-spec.md`
§5 emits `checks.c04.verdict == "PASS"` where the OLD predicate would WARN; a synthetic
`>15%`-of-`>=20`-row cohort still trips WARN (negative control, inherited verbatim from that spec's
own acceptance text).

**AC-3** A fixture `market_messages` row set representing a genuine off-market Saturday quiet window
produces `checks.c06.verdict == "PASS"` where the CURRENT fixed-3h-count predicate would WARN/HIGH;
a genuine `>N`-hour outage during market hours still trips WARN (negative control).

**AC-4** A fixture `pdf_documents` row with `status='success'` inside the window produces
`checks.c11.verdict == "PASS"` (the CURRENT predicate always returns 0/FAIL against any real
`'success'` row, since no row ever carries `status='done'`); a genuinely stale/failed cohort still
trips WARN (negative control).

**AC-5** C-12's loop covers every sqlite DB listed in `system-map.json .project.infrastructure.databases[]`,
skips 0-byte/absent files without treating the skip as a PROBE FAILURE, and (RAW-verified) does not
go blind under a simulated mid-WAL writer-restart condition (reuse `sqlite-wal-guard.test.sh`'s
existing held-open-reader repro — do not reinvent).

**AC-6** `main.md`'s Tier-2 duplicate C-06/C-07 block, B-05/B-09/B-13, and Tier-3's C-01..C-16 table
are ALL replaced by a script call + `RAW-CHECKS:` paste + the existing (unmodified)
`scripts/emit-audit-signal.sh`/`scripts/emit-dashboard-row.sh` calls; `git diff` shows no stray
multiline-strip artifact (Write tool only, verified per FR-11).

**AC-7** `scripts/auditor-db-checks.test.sh` (new, mirrors `db-integrity-counts.test.sh` convention)
exercises every check against fixture DBs, including AC-2/AC-3/AC-4's negative controls plus at
least one PASS-path assertion per check frozen verbatim under FR-3/FR-9.

---

## Blockers

**ZERO PO blockers.** Every open item is a technical design/implementation choice, several of which
already have strong precedent in the record (see Prior Art). None require a business/priority
decision.

**ARCH-RATIFY-1:** Confirm DB access pattern = host-bind via `sqlite-wal-guard.sh` (FR-2) —
supersedes this ticket's own dispatched RESCOPE text, which predates the WAL-guard fix; three
independent design passes (C-04's spec, C-12's fix_spec, this ticket's own title) already converge
on this answer.

**ARCH-RATIFY-2:** C-06's age-vs-SLA threshold value and whether it reuses the existing SLA
Resolver machinery (`main.md:518-544`) — BA recommends reuse, non-binding.

**ARCH-RATIFY-3:** C-11's ISO8601-compare idiom (epoch-seconds vs the C-08 `datetime()`-wrap
pattern) and its off-season severity design — shares FR-5's open calendar question, resolve once
for both C-06 and C-11.

**ARCH-RATIFY-4:** C-12's table-name half (`market_messages_price_history`) — re-verify against a
live C-12 emission before formally closing that half of the row (carried forward unchanged from
the 2026-08-08 architect finding, not new work).

**ARCH-RATIFY-5:** Whether `scripts/db-integrity-mount-drift-check.sh` should be extended to also
cover the new `PDF_EXTRACTOR_DB_HOST_PATH` — safe to defer to a follow-up if architect prefers.

**ARCH-RATIFY-6 (zone):** Dispatched zone is `cross-service/`, but every touched file is under
`scripts/` or `docs/agents/system-auditor/` — no single-service `apps/<service>/` landing exists
here (same pattern UC-ASL-P2's ARCH-RATIFY-3 already established for this exact sibling task).
Recommend architect set a precise zone (`scripts/ + docs/agents/system-auditor/`) rather than the
broad `cross-service/` label.

**ARCH-RATIFY-7:** C-12's multi-DB connection reuse shape (EC-5) — implementation detail only.

---

## Files Modified (scope for architect/pm/dev)

- `scripts/auditor-db-checks.sh` (new)
- `scripts/auditor-db-checks.test.sh` (new)
- `docs/agents/system-auditor/flow/main.md`
- Task-board bookkeeping only (no file edit): `FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE`,
  `FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE`, `FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE`,
  `FIX-AUDITOR-C12-READONLY-BLINDED-AND-TABLENAME` — repoint/close per FR-12, PO/architect's call.
- Optional (ARCH-RATIFY-5): `scripts/db-integrity-mount-drift-check.sh`

No `apps/` code changes — see ARCH-RATIFY-6.

---

## Hard Constraints (propagate to architect → pm → dev → qa)

1. DB access = host-bind `sqlite3` via `scripts/lib/sqlite-wal-guard.sh` only — never `docker exec`,
   never bare `sqlite3 -readonly` (ARCH-RATIFY-1 + the guard's own header rule).
2. Fail-loud probe-failure guard on every query (matches `db-integrity-counts.sh`): a query failure
   or empty result is a PROBE FAILURE, never silently coerced to a false PASS/0.
3. No hardcoded thresholds or DB paths — SLA/`stale_threshold_hours` values from `system-map.json`;
   DB paths from the `MARKET_DB_HOST_PATH`/`PDF_EXTRACTOR_DB_HOST_PATH` env-var convention or
   `system-map.json infrastructure.databases[]` (C-12).
4. Reuse `scripts/emit-audit-signal.sh` + `scripts/emit-dashboard-row.sh` for EMIT — this script's
   job is PASS/FAIL/SKIP-invalid computation ONLY, never signal emission.
5. Write-based (not Edit-tool) replacement for `main.md`'s multiline blocks; verify with `git diff`.
6. Bash 3.2-safe (matches `db-integrity-counts.sh`/`auditor-notebook-commit.sh` precedent) — no
   `mapfile`, no associative arrays.
7. Injection-safety: any dynamic threshold/window value interpolated into static SQL text must come
   from a validated numeric/enum source, never free-form input.

---

## Handoff to Architect

ZONE: recommend narrowing from dispatched `cross-service/` to `scripts/ + docs/agents/system-auditor/` — see ARCH-RATIFY-6.
SPEC: this file.
NEXT: architect — resolve ARCH-RATIFY-1..7, confirm final script/C-12 loop shape, then pm/dev implementation.
