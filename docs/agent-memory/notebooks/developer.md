# Developer — Notebook

**Last updated:** 2026-07-23 | **Cycle:** FFLOW-STALE-0723-B-RECHECK-HARNESS (persistent calendar-aware foreign-flow freshness recheck harness — PART A's "assume complete fixed" gate)

## Session 2026-07-23 — FFLOW-STALE-0723-B-RECHECK-HARNESS — REVIEW

**Task:** Build a persistent, weekend/holiday-aware recheck harness so PART A (ops-vps-fetch recovering the Vinahost-suspended vn-foreign-flow.service) can be declared "complete fixed" on an independent instrument, not self-report. Cross-service artifact outside all dev-* zones — built directly per router instruction, no zone dispatch.

**Actions taken:** New `scripts/check-foreign-flow-freshness.sh`. PROBE: `get_market_foreign_flow(days:1)` via `scripts/agents-flow/mcp-call.sh`, latest_date extracted with a tolerant regex (the tool's `text` field embeds raw unescaped newlines — `jq .` chokes with "control characters must be escaped", live-verified). LCTS (Last Completed Trading Session): shells into the live `apps/mcp-server/src/domain/services/vnTradingCalendar.ts` module via `bun -e` (precedent: `ops-bctc-enrich-reverify-pulljob.sh`'s docker-exec-bun-e pattern) — zero hardcoded holidays, reuses the SAME calendar the OHLCV pipeline uses. Verdict: `latest_date >= LCTS` → PASS/exit 0; else STALE/exit 2; any ambiguity → ERROR/exit 3 (never false-green). Self-test mode (`--self-test`) re-execs the script with gated env-var overrides (`FFLOW_FRESH_SELF_TEST=1` + override vars — a lone stray override var alone is inert) proving 3 branches against the real calendar module. Bug caught+fixed mid-build: a single-quoted heredoc nested inside `"$(...)"` inside outer double quotes is NOT quote-inert — an odd apostrophe count in the body ("isn't") broke bash's outer double-quote scan; fixed by capturing the heredoc to a variable first.

**Verification:** `bash -n` clean. Live run today: `verdict=PASS latest_date=2026-07-23 lcts=2026-07-23` (PART A's parallel VPS recovery had already landed fresh data by the time this ran). Fixture proof (AC-B7 mandate): `FFLOW_FRESH_OVERRIDE_LATEST_DATE=2026-07-21` (the historical stuck value) → `verdict=STALE exit=2` as required. `--self-test` → 3/3 branches PASS (stale/fresh/Saturday-nuance, Sat 2026-07-25 correctly resolves LCTS to preceding Fri 2026-07-24). Ambiguity paths (malformed override date/now/grace-cutoff) all → `verdict=ERROR exit=3`, never 0. Unauthorized override (SELF_TEST unset) correctly ignored, falls through to live probe.

**Board:** `task_board.in_progress[FFLOW-STALE-0723-B-RECHECK-HARNESS]` — router owns this row's lifecycle per task boundary; not touched by this cycle.

**Scope discipline:** New script + 4 doc pointers (`dev-standards.md` § Script Persistence CANONICAL entry, `ops/flow/vps.md`, `system-auditor/flow/main.md` § Per-Source Fetch Freshness, `get_market_foreign_flow.md` See-also) + this journal/notebook. No `apps/mcp-server` source files modified (read-only reuse of `vnTradingCalendar.ts`) — zero tsc/test regression surface.

Zone health: foreign-flow freshness now has an independent, weekend/holiday-aware, non-self-report gate; graphify incremental update skipped — Agent/Skill tools not granted to this subagent session (structural, noted for router) | HEALTHY

## Session 2026-07-23 — TE-T31 (TOKEN-ECONOMY-AUDIT, wave 4) — REVIEW

**Task:** `docs/agents/tools/list/INDEX.md` (254L) was a stale hand-maintained THIRD tool-inventory SSOT — self-declared "157 tools / canonical tool inventory" while the real SSOT `tool-registry.json` held 184 (post-TE-T28), and its own header table disagreed with its own section headings (Financial 21 vs FINANCIAL 19 tools). tran-ngoc-bau's daily package pointed at it 3x.

**Actions taken:** New `scripts/gen-tools-index.sh` (bash+jq, `--check` mode) renders INDEX.md straight from `tool-registry.json` `.groups[]` — total + every per-category count computed live, zero hardcoded. Regenerated INDEX.md: header now says "GENERATED — do not hand-edit; registry is the SSOT", drops the false canonical-inventory claim, echoes only the registry's own `.lastUpdated` (no wall-clock stamp) so idempotency holds. Canonical pointer added to `dev-standards.md` § Script Persistence.

**Verification:** `comm` set-diff registry-tools vs INDEX-linked-tools = 0/0 both directions (184=184, 0 dupes); every linked tool has a matching `list/<tool>.md` stub (0 missing); per-section counts `diff`-verified against `jq -r '.groups[] | .name + " " + (.tools|length|tostring)'` = exact match; two consecutive script runs both printed NOOP (idempotency proven).

**Board:** `task_board.in_progress[TE-T31]` → `review`, `next_agent=qa`, `branch:null`, `.head` synced to idle, via `orch-apply.sh` (dispatcher-owned write, not committed by this cycle).

**Scope discipline:** Touched exactly the new script + INDEX.md (generated) + `dev-standards.md` pointer + journal/notebook. Did NOT touch `market-analyst.md` package (267L prose→table) — brief's merged corroborating item, separate batch finding, noted as follow-up in the journal only.

Zone health: tools/list/INDEX.md is now a pure generated view of tool-registry.json — re-running the script after any future registry change mints the current delta, 3-way SSOT drift class closed for this surface | HEALTHY

## Session 2026-07-23 — TE-T33 (TOKEN-ECONOMY-AUDIT, wave 4) — REVIEW

**Task:** `docs/handoffs` (12M/1026 files, 707+ >30d), `agent-memory/decisions` (4.5M), `agent-memory/sessions` (files since 05-14) grow unboundedly — no eviction analogue to `orch/archive/`; DJ-GATE-1 greps `sprint-*-*.md` across ALL decision files on every DONE flip.

**Actions taken:** New `scripts/agents-flow/cold-archive-sweep.sh` (monthly-guarded, `COLD_ARCHIVE_FORCE=1` test override): handoffs `.md` >30d + not referenced anywhere in the 5 OPEN task_board lanes (live jq scan) → `archive/YYYY-MM/`; sessions non-`.md` >30d → `archive/YYYY-MM/` (`.md` leg already owned by `memory-prune-sweep.sh` at 14d — verified before coding, scoped to the gap it leaves, not duplicated). po-decisions.md 200L rotation reuses `notebook-auto-prune.sh`'s drop-oldest-`##` algorithm via a new opt-in `NOTEBOOK_PRUNE_EXTRA_GOVERNED_PATH` env guard (default empty, zero behavior change on its hot PostToolUse path) — no new prune scheme. **Dropped the decisions/ leg entirely**: discovered live that `decision-journal-archive.sh` (UC-MDH-P4, shipped same day) already supersedes it — board row's own `audit_ref` note + that script's header both name TE-T33. Fixed dev-team/main.md's 2 unscoped DJ-GATE-1 grep comments (`sprint-*-*.md` → `sprint-${SPRINT_ID}-*.md`, matching qa/pm's already-correct canonical pattern — verified those two needed no change). Wired into code-janitor's 6h cron flow. CANONICAL pointer added.

**Verification:** Live dry pre-check: 839 handoffs >30d, 27 referenced-anywhere, 2 overlap (both correctly held back — `comm -12` verified before writing code). `cold-archive-sweep.test.sh` 14/14 PASS incl. idempotent re-run + `git diff --quiet` proof the real `po-decisions.md` was never touched. Re-ran `notebook-linecap-sweep`/`memory-prune-sweep`/`decision-journal-archive` test suites after the shared-hook edit — 7/7, 12/12, 26/26 PASS, zero regression.

**Board:** `task_board.in_progress[TE-T33]` → `review`, `next_agent=qa`, `branch:null`, `.head` synced to idle, via `orch-apply.sh` (dispatcher-owned write, not committed by this cycle).

**Scope discipline:** Touched exactly the new script + test + `notebook-auto-prune.sh` (opt-in guard extension only) + `code-janitor/flow/main.md` + `dev-team/flow/main.md` (2 comment lines) + `dev-standards.md` pointer + journal/notebook/WORK.md. Did not touch qa/pm (already correct) or decisions/ (superseded, confirmed not ambiguous).

Zone health: 3-dir unbounded-growth class capped for handoffs+sessions-gap+po-decisions; decisions/ leg correctly deferred to its real owner instead of double-implemented | HEALTHY
