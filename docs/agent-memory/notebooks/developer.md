# Developer — Notebook

**Last updated:** 2026-07-30 | **Cycle:** FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST

## Session 2026-07-30 — FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST — REVIEW

**Task:** dev-team BOUNDED-1 idle-capacity dispatch (`cross-service/`), PO-triaged P1 root-cause fix for the recurring (3x today, this notebook) same-day tie-break defect: `notebook-auto-prune.sh`'s lossy 17-char ts_key ties multiple date-only headings, and the old stable-sort-then-`head -1` always dropped the physically-first tied section — correct only for an oldest-first/append notebook, wrong (drops the newest) for a newest-first/prepend one like this file.

**Actions:** Tie-break now resolves the minimum-key GROUP direction-aware: drop physically-LAST for newest_first (this file), physically-FIRST for oldest_first. Direction derives from the file's own distinguishable section timestamps first (43/46 live notebooks need zero config); new `docs/data/notebook-section-order.json` declares the 3 confirmed-ambiguous files (developer.md=newest_first, dev-frontend.md/dev-mcp-server.md=oldest_first, each verified via `git log -1 -p`). Unresolved+no-override now fails loud (`notebook_tiebreak_direction_unresolved_breach` signal, no truncation) instead of guessing.

**Verify-live catch:** RED→GREEN A/B against a REAL padded copy of THIS file: pre-fix script wrongly kept only the oldest section (would have dropped this very entry once written); post-fix keeps only the newest (physically-first) section under identical multi-drop pressure.

**Verification:** `notebook-auto-prune.test.sh` 7/7 PASS (T1-T4 pre-existing unaffected + new T5 prepend/T6 append/T7 unresolved-safe-fail). Sibling legacy `test-notebook-auto-prune.sh` 5/5 unaffected (untouched, flagged as a likely stale duplicate for code-janitor, out of scope). shellcheck: same 1 pre-existing unrelated info-only finding, none new. No `apps/` touched — `bun test`/`tsc` N/A.

**Board:** `task_board.in_progress[FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Zone note:** No MCP/gateway tool grant this session (Read/Edit/Write/Bash only, confirmed at Step 0) — could not `task_release`/`send_telegram`; flagged for the coordinating dev-team session (`owner_client_session=64c7c677-0f0f-4cee-a3ce-dba79d70b7ae`) to release `task:FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST` on my behalf.

Zone health: closes the recurring misfire flagged in this notebook's own prior 3 sections today ("3rd occurrence today, same file") — first cycle this class gets a root-cause fix instead of a same-cycle manual workaround.

## Session 2026-07-30 — FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`). `ready[]`/`review[]` rows carrying `effective_supervised && effective_plan_only` were invisible to all four dispatch pickers when reached via a route OTHER than SLS's own promote script (the `promoted_by` stamp SLS-claim required is only ever written by that script, which only reads `backlog[]`).

**Actions:** `devteam-backlog-claim-supervised-lane-sweep.jq` gained a FALLBACK candidate set (PRIMARY unchanged) claiming an unstamped `ready[]` row of the same class — reuses `devteam-eligibility.jq` predicates verbatim, never forges `promoted_by`. `main.md` caller threads `--slurpfile detail`/`archive`. Full lane×flag×wrapper matrix added to `main.md`. Extended `bounded1-supervised-lane-report.sh` (`ready[]`/`review[]` scan) and `devteam-dispatch-gate-satisfiability.sh` (+6 assertions, 40/40 PASS). CANONICAL entry in `dev-standards.md`.

**Verify-live catch:** disproved the mint's `review[]` claim empirically before touching anything — QA-Drain's claim script has NO supervised/plan_only gate; an older non-supervised row already outranks all 5 cited rows in its age queue. `review[]` was never broken (document, not fix). Fixed 2 pre-existing satisfiability-script call sites that would have jq-errored once the claim script required `--slurpfile`.

**Verification:** 40/40 satisfiability PASS (never live). READY-PRIMARY: 0 unresolved. Pre-existing unrelated backlog PRIMARY `[FAIL]` (5 rows) reproduced via `git stash` A/B, same IDs a prior session already flagged — not a regression. Live-board dry-run: Zod-valid + conservation-clean; the one live `ready[]` epic wrapper correctly untouched.

**Board:** did not manually apply the fix live — 2 of 3 stuck P0 rows already hand-moved to `backlog[]` (now covered normally); the 3rd is the epic wrapper, correctly excluded, closed by the pre-existing Step 4.4 sweep once children finish.

**Zone note:** flipped board row via `orch-apply.sh`; coordinating session releases the task lock.

Zone health: notebook-auto-prune.sh's documented date-only-heading tie-break misfire hit AGAIN on this write (3rd occurrence today, same file) — worked around by pruning the true-oldest section myself in a prior edit (dropping to 2 sections) before adding this one, so the hook had nothing left to mis-prune. Recommend the coordinating/router session escalate this past "flag and move on" per the 2+-recurrence standing policy.

## Session 2026-07-30 — FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD — REVIEW

**Task:** dev-team resume after WF-2 SUPERVISED-HOLD cleared (`cross-service/`). Architect plan_only brief + independent PO ratification (STEP po-5): (1) no refusal rule when a spawn prompt contradicts a documented spec-internal threshold, (2) no provenance on the resulting signal row.

**Actions taken:** `CANONICAL:AUD-CP-1` in `dev-standards.md`. New `## CALLER-INSTRUCTION PRECEDENCE (AUD-CP-1)` block in `main.md` before `## Tier Dispatch` + mandatory `CONTRACT-CONTRADICTION` RETURN line + changelog. 4-line `tier1-probe.md` breadcrumb strictly outside the protected verdict-mapping span. `provenance:"detector"` hardcoded into `emit-audit-signal.sh`'s sole `_build_row_json()` — no flag, no schema migration.

**Verify-live catch:** breadcrumb confirmed via `git diff` OUTSIDE lines 135-142 (byte-identical mapping) — this file was already burned once by an in-span veto. Also: `dev-standards.md`/`docs/WORK.md` entries landed at HEAD via peer commit `c919f69a1` before I could commit — verified byte-identical, not re-committed (`feedback_shared_main_peer_push_sweeps_held_data_commits`).

**Verification:** RED-then-GREEN — T13/T14/T15 (plain/`--e3-only`/CAS-retry shapes) failed pre-fix, GREEN after the hardcode. Suite 53/53 PASS. `pre-commit-auditor-heartbeat.test.sh` 6/6 unaffected. `shellcheck` clean (pre-existing info-level only). No `apps/` touched — `bun test`/`tsc` N/A.

**Board:** `task_board.in_progress[...]` → `review` (`next_agent: qa`), `.head` idle, `orch-apply.sh`.

**Simplicity gate:** PASS — hardcoded literal (no flag, per AC4), doc blocks near-verbatim from the ratified brief.

**Zone note:** No MCP/gateway tool this session — flipped board row via `orch-apply.sh` directly; could not release `task:FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD`/Telegram (structural gap, flagged for coordinating session).

Zone health: this write hit the SAME notebook-auto-prune.sh tie-break misfire T1-PREGATE flagged (date-only headings, all-tied stable-sort drops physically-first not true-oldest) — recomposed manually within both caps rather than relying on the hook; not filed as a new row (still single-session, flagged for coordinating session).
