# Developer Standards

<!-- size-justification: 140L — unified developer reference: code search tools, test patterns, DDD rules, TypeScript conventions, naming. All read together at sprint start to set context; splitting into tool-guide + test-patterns + naming-rules fragments the unified "how we code" standard. SCRIPT-PERSIST 2026-06-07: Script Persistence section incl. maintenance clause (+15L, user directive). SYSREMAKE-P2-DEVTEAM-BACKLOG-PICKUP-BOUNDED1 2026-07-04: CANONICAL pointer for the dev-team idle-capacity backlog pickup scripts (+11L). PUSH-AUTONOMY-1 2026-07-14: Autonomous Push Gate section (+16L, user directive — push on 100% green, no user action, post-push real-data verify task). FIX-CMH-OBSOLETE-FILE-CLEANUP 2026-07-20: CANONICAL pointer for scripts/audits/clean-obsolete-files.sh (+8L). BLOCK-PUSH-CRON-AUDIT-BATCH-NO-QA 2026-07-22 (qa): pinned the "targeted/merge-gate suite" reading against the standing FIX-MCP-SUITE-HEALTH-BASELINE full-suite red so it stops being re-litigated per push (+3L). UC-MDH-P3 2026-07-23: CANONICAL pointer for scripts/agents-flow/memory-prune-sweep.sh (+14L). UC-MDH-P4 2026-07-23: CANONICAL pointer for scripts/agents-flow/decision-journal-archive.sh (+15L). UC-GCP-P8 2026-07-23: CANONICAL pointer for scripts/agents-flow/stranded-state-sweep.sh (+13L). TE-T17 2026-07-23: CANONICAL pointer for scripts/agents-flow/notebook-linecap-sweep.sh (+13L). TE-T28 2026-07-23: CANONICAL pointer for scripts/gen-tool-list-stubs.py (+15L). TE-T31 2026-07-23: CANONICAL pointer for scripts/gen-tools-index.sh (+14L). TE-T33 2026-07-23: CANONICAL pointer for scripts/agents-flow/cold-archive-sweep.sh (+18L). FFLOW-STALE-0723-B-RECHECK-HARNESS 2026-07-23: CANONICAL pointer for scripts/check-foreign-flow-freshness.sh (+16L). FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK 2026-07-28: CANONICAL pointer for scripts/git-hooks/pre-commit (+15L). FIX-AUDITOR-HEARTBEAT-OUT-OF-CONTRACT-AGENT-WRITE-TIER1 2026-07-29: CANONICAL sole-writer + shape invariant for docs/data/auditor-tier{1,2,3}-last-healthy.json, cited from both writers (+21L). FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS-followup 2026-07-29: CANONICAL pointer for scripts/audits/verify-notebook-immutability-gate.sh (+9L). FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED 2026-07-29: CANONICAL pointers for scripts/emit-dashboard-row.sh + scripts/audit-output-contract.sh (+24L). FACTORY-GUARD-CI-SIZELINT-IMPL 2026-07-29: CANONICAL pointer for scripts/audits/size-lint-justification.sh (+16L). FACTORY-GUARD-CI-METRICMASK-IMPL 2026-07-29: CANONICAL pointer for scripts/audits/metric-mask-lint.sh (+18L). FACTORY-GUARD-CI-TSBOUNDARIES-IMPL 2026-07-29: CANONICAL pointer for the 3 new TS eslint CI jobs (mcp-server/news-fetch/frontend) + news-fetch-go-lint (+22L). FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL 2026-07-30: CANONICAL pointer for scripts/audits/composition-root-logic-gate.go + the composition-root-logic-gate CI job (+30L). FACTORY-GUARD-CI-DEADCODE-IMPL 2026-07-30: CANONICAL pointer for scripts/audits/dead-code-gate.sh + the dead-code-gate CI job, incl. the check-3 twin-scaffold deviation from the board-row note's literal phrasing (news-fetch false-positive) (+35L). FACTORY-GUARD-CI-NOHARDCODE-IMPL 2026-07-30: CANONICAL pointer for scripts/audits/no-hardcode-allowlist-scan.sh + the no-hardcode-allowlist-scan CI job, incl. the priceBackfillService.ts:224 verify-live deviation (documented test-fixture sentinel, annotated not fixed) (+38L). FACTORY-GUARD-CI-SHAREDPKG-IMPL 2026-07-30: CANONICAL pointer for scripts/audits/shared-package-import-check.sh + the shared-package-import-check CI job, incl. baseline/ratchet seeding of the 3 current phantom packages and the advisory-only symbol-collision check (+20L). FACTORY-GUARD-CI-RAWVERIFY-IMPL 2026-07-30: CANONICAL pointer for scripts/audits/rebuild-raw-verify-check.sh + the pre-push hook wiring + the rebuild-raw-verify-hook CI job, incl. the colocated-test-file verify-live exclusion deviation, plus a PUSH-AUTONOMY-1 §5 cross-reference (+56L). FIX-STRANDED-SWEEP-CLASSIFY-AGENT-MODEL-SWITCH 2026-07-30: updated the stranded-state-sweep.sh CANONICAL pointer for the UNKNOWN-bucket age gate + the 4 new OWNED-ELSEWHERE routine-output classes + the content-gated agent-model-switch OWNED-ELSEWHERE check (+6L). FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE 2026-07-30: CANONICAL pointer for the Design-Router Sweep (DRS) promote+claim script pair (+18L). FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD 2026-07-30: new CANONICAL entry AUD-CP-1 — fleet-wide caller-instruction precedence over spec-internal thresholds/predicates, designated-parameter vs spec-internal-threshold distinction, mandatory CONTRACT-CONTRADICTION RETURN-block line (+34L). FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER 2026-07-30: new CANONICAL entry — Supervised-Lane Sweep (SLS) claim's new `ready[]` FALLBACK path for unstamped supervised+plan_only rows, inserted after the existing DRS entry (+23L). NOTE (pre-existing, not from this task): this header's own base "140L" figure has not tracked the file's true cumulative growth for many entries now (actual line count far exceeds 140 + the sum of the deltas listed here) — a compounding self-maintenance drift, flagged for a separate cleanup, not fixed here. -->

## Script Persistence — scripts/, never /tmp

Any script useful for the work or reusable later MUST be saved to `scripts/` — NEVER left in `/tmp` (user directive 2026-06-07; precedent: `scripts/agents-flow/drain-signals.js`).

| Script kind | Location |
|---|---|
| Agent-flow helper (drain, match-slots, cadence…) | `scripts/agents-flow/` |
| Audit / one-shot verification worth replaying | `scripts/audits/` |
| Migration | `scripts/migrations/` |
| CI per-file isolation runner (deterministic, order-independent gate) | `scripts/ci-per-file-isolation.sh [P]` — owning brief: `docs/architecture-briefs/2026-06-09-testing-ci-architecture-rethink.md § P2-4` |
| Anything else reusable | `scripts/` |

After saving: **update the owning flow/skill doc with a canonical pointer** (`node scripts/...` usage line) so future agents discover it instead of rewriting it. Pattern: `docs/agents/dev-team/flow/drain-signals.md` §0a-1 "CANONICAL SCRIPT".

**CANONICAL: Obsolete-file cleanup (FIX-CMH-OBSOLETE-FILE-CLEANUP)**
```bash
scripts/audits/clean-obsolete-files.sh              # --dry-run default, no deletes
scripts/audits/clean-obsolete-files.sh --live        # quarantines to docs/data/.trash/<date>/, never rm's
```
Allow-list-driven, quarantine-first janitor cleanup (unexpanded-shell-var names, aged atomic-write `.tmp`
leftovers, superseded per-cycle snapshots). Owning flow: `docs/agents/claude-manager-helper/flow/main.md`
§ Pass 0b. Policy SSOT: `docs/policies/obsolete-file-cleanup.md`.

**CANONICAL: Agent-memory prune sweep (UC-MDH-P3, memory-docs-hygiene-P3)**
```bash
bash scripts/agents-flow/memory-prune-sweep.sh
```
File-ops-only (never touches `docs/data/orch/orch-state.json`), idempotent — archives
`docs/agent-memory/sessions/*.md` >14d to `sessions/archive/` (`*.md` only; log/json writers
untouched), deletes `docs/agent-memory/health/team-tool-recheck-*.md` >30d + writes one
idempotent PO-decision payload to `docs/signals/`, folds `session-logs/` into
`sessions/archive/`, relocates root-level `scheduled-task-execution-*.md` to
`docs/agent-memory/archive/`. Owning flow: `docs/agents/code-janitor/flow/main.md` § Memory
Prune Sweep — the FLOW step (not the script) appends the `.signal_queue.rows[]` row for the
PO payload via `.claude/skills/signal-dashboard/SKILL.md`. Retention rules:
`docs/agent-memory/sessions/archive/.retention.md`. Test: `scripts/agents-flow/memory-prune-sweep.test.sh`.

**CANONICAL: Notebook line-cap sweep (TE-T17)**
```bash
bash scripts/agents-flow/notebook-linecap-sweep.sh
```
Write-path-agnostic backstop for `scripts/agents-flow/notebook-auto-prune.sh` (the PostToolUse
hook only fires on the `Write|Edit` matcher — Bash heredoc/append writes bypass it entirely,
the root cause of ops.md hitting 1197L/~6x cap before this sweep). Sweeps every
`docs/agent-memory/notebooks/*.md`, delegates any file >200L to the same drop-oldest prune
logic as the hook (synthetic PostToolUse JSON — no duplicated pruning code). Idempotent.
Owning flow: `docs/agents/code-janitor/flow/main.md` § Notebook Line-Cap Sweep. Test:
`scripts/agents-flow/notebook-linecap-sweep.test.sh`.

**CANONICAL: Sprint decision-journal archival (UC-MDH-P4, memory-docs-hygiene-P4)**
```bash
# per-cycle (piped diff of just-closed sprint ids):
comm -23 <(echo "$PRE_EVICT_ACTIVE_IDS") <(echo "$POST_EVICT_ACTIVE_IDS") \
  | bash scripts/agents-flow/decision-journal-archive.sh
# one-time / occasional backfill:
bash scripts/agents-flow/decision-journal-archive.sh --all
```
Moves `docs/agent-memory/decisions/sprint-<id>.md` / `sprint-<id>-<agent>.md` journals whose
sprint has CLOSED into `docs/archive/decisions/`. STATUS-based selection (closed vs still-active
sprint id via LONGEST-match, never bare prefix glob — handles the live
`OHLCV-UNIT-CONTAM` / `OHLCV-UNIT-CONTAM-WHOLEROW-LT1000` collision shape), NOT mtime-based —
supersedes the decisions/ leg of backlog row TE-T33. File-ops-only (jq reads orch-state, never
writes it). Owning flow: `docs/agents/pm/flow/task-archive.md` § Step 5.5. Test:
`scripts/agents-flow/decision-journal-archive.test.sh`.

**CANONICAL: Stranded machine-state sweep (UC-GCP-P8, git-ci-publish-P8)**
```bash
bash scripts/agents-flow/stranded-state-sweep.sh --plan
```
Classifier-only — emits a JSON commit-plan to stdout, makes NO git/orch-state writes itself.
Classifies `git status --porcelain` into AUTO-COMMIT (notebooks/decisions -> `memory`, `sessions/*.md`
-> `sessions`, `scripts/*` -> `scripts`; mtime >`SSS_AGE_HOURS` (default 24h) gate, deletions exempt;
`agent-memory/modules/*.json` excluded — owned by queued SYSREMAKE-P2 RC-GITSTATE), OWNED-ELSEWHERE
(silent skip — `docs/signals/**`, orch-state.json, cowork-schedule.json, coverage-state.json,
`agent-memory/modules/**`, `auditor-*-last-healthy.json`, `auditor-dedup-ledger.json`, `DASHBOARD.md`,
`unified-agent-synthesis-*.json`, `fb-post-*.md` — routine agent-output classes whose producing
agents hold no Bash/git tool; plus `.claude/agent-models.json`/`.claude/agents/*.md` ONLY when
`_is_model_switch_only()` confirms the `git diff HEAD` touches EXCLUSIVELY the `current_mode`/`model`
value line, else falls through to UNKNOWN — FIX-STRANDED-SWEEP-CLASSIFY-AGENT-MODEL-SWITCH AC1), and
UNKNOWN (SAME `SSS_AGE_HOURS` young-skip gate as AUTO-COMMIT, closing the false-positive class where
a file an agent is actively editing this tick was reported stranded — AC3; aggregated, dedup-checked
signal to po). Capped at 20 paths acted on per run. Owning flow: `docs/agents/dev-team/flow/post-cycle.md`
§ Step 4.3 — the FLOW step (not the script) performs the `git add`/`git commit` (commit-mutex:main) and
the `.signal_queue.rows[]` write via `.claude/skills/signal-dashboard/SKILL.md`. Test:
`scripts/agents-flow/stranded-state-sweep.test.sh`.

**CANONICAL: OHLCV unit contamination repair (CONTAM-6)**
```bash
# Dry-run (count + sample, no writes):
bun run scripts/migrations/repair-ohlcv-unit-contamination.ts --dry-run

# Live against named volume (docker exec):
docker cp scripts/migrations/repair-ohlcv-unit-contamination.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/repair-ohlcv-migration.ts
docker exec -it vn-market-intelligence-mcp-mcp-server-1 \
  bun run /app/repair-ohlcv-migration.ts --live
```
Detects WHERE (open < 100 OR low < 100) AND close >= 1000 AND open > 0 AND low > 0.
Excludes all-zero rows (2026-05-30T11:47Z bulk-zeros defect — out of scope).
Repair: open*1000, low*1000. data_env preserved (RF-5).

**CANONICAL: OHLCV low-zero / partial-zero repair (CONTAM-9)**
```bash
# Dry-run (count + sample, no writes):
bun run scripts/migrations/repair-ohlcv-unit-contamination-low-zero.ts --dry-run

# Live against named volume (docker exec):
docker cp scripts/migrations/repair-ohlcv-unit-contamination-low-zero.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/repair-ohlcv-low-zero.ts
docker exec -it vn-market-intelligence-mcp-mcp-server-1 \
  bun run /app/repair-ohlcv-low-zero.ts --live
```
Three-pass repair: A=mixed-unit open (open<100 AND open>0 AND low=0): open*1000 + low estimate;
B=partial-zero open (open=0, not all-zero): open=close; C=remaining low=0 (close>=1000): low=ROUND(close*0.99).
Excludes all-zero rows (separate defect). data_env preserved (RF-5).

**CANONICAL: OHLCV whole-row contamination repair (CONTAM-10-WHOLEROW-LT1000)**
```bash
# Dry-run (per-ticker count + anchor_close + sample, no writes):
bun run scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts --dry-run

# Live against named volume (docker exec — requires CONTAM-10-MIGRATION QA PASS):
docker cp scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/repair-ohlcv-wholerow.ts
docker exec -it vn-market-intelligence-mcp-mcp-server-1 \
  bun run /app/repair-ohlcv-wholerow.ts --live
```
Predicate: per-ticker anchor (most recent bar with close>=1000 AND volume>0 in last 180 days).
Candidate: bar where anchor_close/bar.close>=100 AND bar.close<1000 (whole-row thousands scale).
Fix: ALL FOUR OHLC fields ×1000. INDEX_TICKERS excluded (VNINDEX/VN30/HNXINDEX/HNX30/UPCOMINDEX).
Legitimately cheap stocks skipped (no anchor found → skip). data_env preserved (RF-5).
GATE: CONTAM-10-EXEC blocked on CONTAM-10-MIGRATION QA pass — do NOT run --live before QA.

**CANONICAL: FB data-integrity plausibility gate (FIX-FB-POST-DATA-INTEGRITY-GATE)**
```bash
# Check a post file before publish (run from repo root):
bash scripts/fb-data-integrity-gate.sh <post-file> [YYYY-MM-DD] [snapshot-json-file]
# Exit 0 = PASS; Exit 1 = BLOCK (violations printed); Exit 2 = usage error
# Fetches live data from http://localhost:3000/mcp/api/prices/batch automatically.
# Owning flow: docs/agents/fb-market-poster/flow/main.md STEP 4b
```

**CANONICAL: Auditor heartbeat sole-writer + shape invariant (SSOT-AUDITOR-HEARTBEAT-SOLE-WRITER, FIX-AUDITOR-HEARTBEAT-OUT-OF-CONTRACT-AGENT-WRITE-TIER1)**
`docs/data/auditor-tier{1,2,3}-last-healthy.json` — ONE authorized writer per file, enforced by
`scripts/git-hooks/pre-commit`'s `_check_auditor_heartbeat_shapes` (always-reject, both directions,
never gated by `GIT_SWEEP_GUARD_MODE`):
- **Tier-1** (`auditor-tier1-last-healthy.json`): sole writer is `scripts/agents-flow/auditor-tier1-probe.sh`'s
  `_write_heartbeat()`, reachable ONLY from `run_probe()`'s ALL_GREEN branch. Semantic: "system was
  confirmed healthy". Required shape: `{last_healthy_at, checks:{docker_ps, health_3000, health_3001,
  disk, mem_creep, launchd_agents}}`, ALL 6 values `"PASS"` — the only shape the authorized writer ever
  emits, so any other shape (bare, wrong key set, a non-PASS value) is an out-of-contract write and is
  rejected. `docs/agents/system-auditor/flow/main.md`'s own Tier-2/3 Heartbeat Write block is explicitly
  gated OUT of Tier-1 and MUST stay that way — do NOT port `suppress_heartbeat` here (Tier-1 has no
  separate "audit completed" writer the way Tier-2/3 does; suppressing this file's only writer starves
  it permanently — see `FIX-AUDITOR-TIER1-FRESHNESS-CHECK-RELOCATE-TO-SENTINEL` `.why_the_obvious_fixes_are_wrong`).
- **Tier-2/Tier-3** (`auditor-tier{2,3}-last-healthy.json`): sole writer is the system-auditor subagent's
  own end-of-cycle write (`main.md` § Tier-2/3 Heartbeat Write, gated on `AUDIT_TIER` being `2`/`3` —
  do not drop that gate). Semantic differs from Tier-1 BY DESIGN: "a real Tier-N audit cycle completed",
  not "was healthy" — it fires every Tier-2/3 cycle regardless of HEALTHY/DEGRADED/CRITICAL
  (`auditor-signal-loop-P1`, load-bearing for the SKIP-SPAWN freshness gate in `run_tiered_probe()`;
  re-gating this write on a green verdict would starve the heartbeat on any persistently-tracked
  DEGRADED cycle and recreate the exact spawn-storm that fix closed). Required shape: bare
  `{last_healthy_at}` ONLY — a `checks` key means the Tier-1 shape/semantic bled in, and is rejected.
  This bare-vs-`checks{}` shape difference is the resolved, enforced signal distinguishing "confirmed
  healthy" from "an audit merely completed" within one filename family that otherwise implies healthy.
- Cited from both writers: `scripts/agents-flow/auditor-tier1-probe.sh` header comment (Heartbeat
  section) and `docs/agents/system-auditor/flow/main.md` § Tier-2/3 Heartbeat Write.
- Test: `scripts/git-hooks/pre-commit-auditor-heartbeat.test.sh`.

**CANONICAL: Caller-instruction precedence over spec-internal thresholds (AUD-CP-1,
FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD)**
Every agent flow spec may take TWO structurally different kinds of value from a spawn prompt:
- **Designated parameter** — named as caller-settable in the flow's own `## Input` (or equivalent)
  section (e.g. system-auditor `AUDIT_TIER`, market-watcher `slot=`, orch-sentinel `MODE=`,
  digest-predict `owner_client_session`, dispatch-claim `N_MAX`). The caller is authoritative; this
  rule does not apply.
- **Spec-internal threshold/predicate** — any other numeric threshold or boolean predicate the flow
  states as an invariant decision rule for a check/branch, NOT listed as a designated input anywhere.
  The flow's own spec text is the sole source of truth.

**PRECEDENCE RULE:** when a spawn prompt / caller instruction asserts or requests an outcome for a
spec-internal threshold/predicate that CONTRADICTS what the agent's own documented rule computes this
cycle — **the spec wins.** The agent MUST NOT act on (emit on, branch on) the caller's value.

**MANDATORY on contradiction:**
1. Do not take the caller-requested action (do not emit / do not branch to the caller's outcome).
2. Log the contradiction in this cycle's own notebook section.
3. Report a `CONTRACT-CONTRADICTION` line in the RETURN block:
   `CONTRACT-CONTRADICTION: check=<id> spec=<file:line>=<documented value/predicate> caller_value=<what the prompt asserted> caller_quote="<verbatim caller sentence>" resolution=SPEC_WINS`
   On a cycle with no contradiction, still print `CONTRACT-CONTRADICTION: NONE` — mandatory line,
   never silently omitted (mirrors this repo's own `[OUTPUT-CONTRACT]` "omitting it is a violation"
   convention; a line that only appears when something went wrong is a line nobody can audit for
   absence-of-evidence).

**SCOPE: fleet-wide**, not scoped to system-auditor or to A-21 — see rationale in the origin task's
brief (`docs/architecture-briefs/2026-07-30-fix-auditor-caller-prose-overrides-detector-threshold.md`
§4). Any flow spec that documents a spec-internal threshold/predicate is bound by this rule; a fix
that only touches one check (or one agent) misses the class.

**Origin:** a router spawn-prompt sentence overrode system-auditor's documented A-21 threshold
(`tier1-probe.md:135-137`), producing signal row `sys-20260729T060929-39de` at `crashRestarts=1`
against a documented `>=2` gate. PO retracted the row and hand-recorded provenance in prose fields on
the row itself — this CANONICAL entry + the system-auditor binding below is the preventive fix that
makes that manual archaeology unnecessary going forward.

**CANONICAL: Orch-state gated write wrapper (SSOT-INTEGRITY-PERIMETER SSOT-W1-ORCH-APPLY-WRAPPER)**
```bash
# ALL hot-file writes MUST route through this wrapper — NEVER write orch-state.json directly.
# Canonical call-site idiom (minimal churn over existing jq pattern):
#   jq '<filter>' docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh"
# Exit 0 = success (candidate atomically applied).
# Exit 1 = validation failed (dup-key / schema / dangling refs) OR conservation check failed
#   (candidate's task_total/signal_total dropped below FLOOR_RATIO of live) — live file untouched.
# Exit 2 = CAS mtime mismatch (concurrent writer) — caller should retry.
# Exit 3 = usage error (empty stdin / live file missing).
# Owning task: SSOT-W1-ORCH-APPLY-WRAPPER; validator wired: bun scripts/orch-validate.mjs (same SSOT);
#   conservation guard wired: bun scripts/orch-conservation-check.mjs (FIX-ORCHSTATE-CONSERVATION-
#   GUARD-CIRCUIT-BREAKER — see canonical entry below); updated_at stamp wired:
#   bun scripts/orch-stamp-updated-at.mjs (FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH — see canonical entry below)
# Routed writers: po-s*/router-*.jq apply idiom, scripts/orch-backlog-stub.sh,
#   scripts/orch-cold-evict.sh, dev-team WF-1 head-reset, signal-dashboard WRITE/READ/PRUNE,
#   pm/flow/main.md task-status writes, po/sprint-signoff.md, developer/fixer/qa WF-1 STOP-RELEASE,
#   fail-loud-protocol.md error boundary head-reset.
# Integration test (exit-code 0/1/2/3 + live-UNCHANGED guarantee): bash scripts/test/orch-apply-wrapper-tests.sh
# Writer audit (all ~290/tick sites categorized): docs/signals/orch-state-writer-audit.json
```

**CANONICAL: Orch-state diff-based updated_at stamping (FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH)**
```bash
# Standalone invocation (usually called internally by orch-apply.sh Stage 1.5 — rarely called directly):
bun scripts/orch-stamp-updated-at.mjs <liveFilePath> <candidateFilePath> <nowIso>
# Mutates <candidateFilePath> IN PLACE. Exit 0 = stamped (0+ rows). Exit 3 = usage/I-O error.
```
Root cause (fixed): `scripts/orch-apply.sh` had zero timestamp handling — task_board row
`updated_at` was stamped only by whichever of the 30+ ad-hoc jq callers happened to remember it,
leaving most rows permanently `null` (TaskSchema uses `.passthrough()`, so omitting it always
validated clean). Fix stamps at the write path, diff-based: for every row (id-keyed — `id` is a
required TaskSchema field, unique across all lanes), compares candidate content against the live
row with the same id, **excluding `updated_at` itself** (so the stamp can never feed back into its
own change predicate — idempotent, does not churn on re-apply of unchanged content). Changed or
brand-new (no live counterpart) rows get `updated_at = now`; unchanged rows — including their
existing `null` — are left byte-for-byte alone. **NO backfill** of the pre-existing null rows from
git history or file mtime (a synthesised timestamp is worse than a null one — falsifies staleness
sweeps and the audit trail); they age out naturally as rows are genuinely touched.
Diff unit is **lane-agnostic**: a row moved between lanes with byte-identical field content is not
itself treated as "changed" (real lane moves almost always change `status`, which orch-validate.mjs
Stage 1b's `checkLaneCoherence()` requires to match the lane anyway — that IS content, and IS
caught; the one exception is a status value legal in more than one lane, e.g. `BLOCKED` moved
between `backlog`/`review` with nothing else touched — a rare pure-bookkeeping relocation).
Runs in `scripts/orch-apply.sh` Stage 1.5, AFTER Stage 0/1 schema validation (so it never
interferes with the raw-text duplicate-key scan, which must see the untouched candidate bytes) and
BEFORE Stage 2 conservation check / CAS-mtime rename.
Test coverage: `bash scripts/test/orch-apply-wrapper-tests.sh` (STAMP-CHANGED / STAMP-SIBLING /
STAMP-NEWROW / STAMP-IDEMPOTENT cases).

**CANONICAL: Orch-state conservation circuit-breaker (FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER)**
```bash
# Standalone invocation (usually called internally by orch-apply.sh Stage 2 — rarely called directly):
bun scripts/orch-conservation-check.mjs <liveFilePath> <candidateFilePath>
# Exit 0 = OK (within floor, live total below MIN_BASELINE, or bypass honored).
# Exit 1 = conservation violated — candidate's task_total/signal_total dropped below
#   CONSERVATION_FLOOR_RATIO (default 0.5) of the live value, live total >= CONSERVATION_MIN_BASELINE
#   (default 10), and no bypass set.
# Exit 3 = usage error (missing args / file not found / unparseable).
```
Whole-board magnitude-ratio design (NOT naive per-lane never-decrease — a normal single-task lane
move nets to zero on `task_total`, so it never trips the floor). Closes the empirically
live-exploitable full-doc-collapse class (commit `de595a44`: 320 backlog rows -> 0, 100 signal
rows -> 1, exit 0, no warning — reproduced live against current code before this fix landed).
Shared by `scripts/orch-apply.sh` (Stage 2 gate, after schema validation, before the CAS-mtime
rename — load-bearing) and `scripts/agents-flow/orch-state-hook-prewrite.mjs` (PreToolUse parity —
defense-in-depth, secondary). Bypass: `ORCH_APPLY_ALLOW_SHRINK=<reason>` — narrow named bypass
(mirrors the `ORCH_APPLY_LIVE_FILE_OVERRIDE` test-only precedent), wired ONLY into
`scripts/orch-cold-evict.sh` and `docs/agents/pm/flow/task-archive.md` (the 2 already-shipped
legitimate bulk-eviction writers). NEVER set it anywhere else — in particular, never from
system-auditor / signal-dashboard WRITE.
Owning brief: `docs/architecture-briefs/2026-07-10-auditor-orchstate-conservation-guard.md`
(§4.1 metric formula, §4.2 rejected-design proof, §4.3 hook-parity rationale).
Test coverage: `bash scripts/test/orch-apply-wrapper-tests.sh` (COLLAPSE / APPEND-HAPPY /
SHRINK-ALLOWED cases) + `bun test scripts/agents-flow/orch-state-hook.test.mjs` (hook parity +
fail-open infra path).

**CANONICAL: Orch-state Claude hook gate (SSOT-INTEGRITY-PERIMETER SSOT-W1-HOOK-ENFORCE)**
```bash
# PreToolUse gate — auto-wired in .claude/settings.local.json, no manual invocation needed.
# To test: echo '{"tool_name":"Write","tool_input":{"file_path":"docs/data/orch/orch-state.json","content":"<json>"}}' \
#   | bun scripts/agents-flow/orch-state-hook-prewrite.mjs
# Exit 0 = allow. Exit 2 + {"decision":"block","reason":"..."} = blocked (schema violation).
# PostToolUse Bash backstop:
# bash scripts/agents-flow/orch-state-hook-bash-backstop.sh  (auto-fired; always exits 0)
# Owning task: SSOT-W1-HOOK-ENFORCE; validator wired: bun scripts/orch-validate.mjs (same SSOT)
```
Both hook scripts call `bun scripts/orch-validate.mjs` — same canonical Zod validator as the CLI.
PreToolUse validates BEFORE write lands (blocks on schema fail). PostToolUse backstop catches
Bash shell writes that bypass the Write/Edit tools (surfaces warning; non-blocking).

**CANONICAL: Orch-state Zod validator CLI (SSOT-INTEGRITY-PERIMETER SSOT-W1-ZOD-VALIDATOR-CLI)**
```bash
# Validate docs/data/orch/orch-state.json (default path):
bun scripts/orch-validate.mjs
# Validate a specific candidate file (e.g., before atomic rename):
bun scripts/orch-validate.mjs path/to/candidate.json
# Exit 0 = Stage 0 + Stage 1 PASS (0 coherence issues, 0 dangling refs). Exit 1 = dup-key.
# Exit 2 = schema/lane-coherence/ref/sprint-goal-status/decorative-blocks-co_edit-field fail. Exit 3 = file-not-found.
# Owning task: SSOT-W1-ZOD-VALIDATOR-CLI; directive: docs/architecture-briefs/SSOT-zod-validation-directive-2026-06-27.md § Step 3
# Acceptance fixture: bun scripts/test-orch-validate-ac.mjs (exercises AC-1..AC-4)
```
Imports schema from apps/mcp-server/src/infrastructure/orchStateSchema.ts (single source of truth — never duplicated).
Stage 0: raw-byte duplicate-key scan (pre-parse). Stage 1: OrchStateSchema.safeParse. Stage 1b: lane coherence
(HARD FAIL — flipped from warn-only by D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING once SHG migration drove live
coherence to 0; process.exit(2) on any violation). Stage 1c: ref integrity (hard fail on dangling detail_ref /
payload_ref). Stage 1d: sprint_goal terminal-status canonicalization (hard fail). Stage 1e
(FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE): `checkDecorativeSequencingFields()` — hard fail on a
reverse-only `blocks` edge (present, non-empty, but the named target does not carry the source id back in
its own `depends_on`/`depends`/`blocked_by` — the ONLY fields `scripts/lib/devteam-eligibility.jq`'s
`effective_depends_on()` reads — or malformed, e.g. a prose string) or any non-empty `co_edit` value (no
forward-field equivalent exists in the schema at all, so it can never be validated as bound). Closes the
class where a field reads as a sequencing/atomic-ship constraint in every board dump while binding nothing.

**CANONICAL: Orch-state write-gate validator (ORCH-STATE-SCHEMA-HARDENING SHG-1 / SSOT-W1-BASH-SHIM)**
```bash
# Validate a candidate orch-state file before atomic rename (exit 0 = valid, non-zero = FAIL):
bash scripts/orch-state-validate.sh <path-to-candidate.json>
# Wire-in pattern (every orch-state write path, before mv):
#   bash "$PROJECT_ROOT/scripts/orch-state-validate.sh" "$TMP" \
#     || { rm -f "$TMP"; echo "[orch-write] ABORTED: validation failed" >&2; exit 1; }
# Owning brief: docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md § 4
# Wire-in targets (SHG-3): pm/main, pm/task-archive, dev-team/post-cycle,
#   po/sprint-signoff, signal-dashboard, system-auditor, orch-cold-evict.sh
```
SHIM (SSOT-W1-BASH-SHIM, 2026-06-27): scripts/orch-state-validate.sh is now a thin shim that exec's
`bun scripts/orch-validate.mjs "$@"`. All G-1..G-5 hard gates are covered by Stage 0 + Stage 1
(superset: Zod checks 9 lanes vs former 3-lane G-5; READY added as 12th valid status).
G-6 (last_tick skew warn-only) dropped — no exit-code impact. Caller contract unchanged (0=pass, non-zero=fail).

**CANONICAL: Orch-state cold eviction (ORCH-STATE-HOT-COLD-SPLIT HSC-1; extended D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND)**
```bash
# Dry-run (preview eviction counts + projected hot-file size, no writes):
bash scripts/orch-cold-evict.sh --dry-run
# Live eviction (MUST hold commit-mutex:main before calling):
bash scripts/orch-cold-evict.sh
# Override retention policy (env vars):
KEEP_RECENT_DONE=10 DONE_MAX_AGE_DAYS=7 bash scripts/orch-cold-evict.sh --dry-run
# One-time migration safety valve — skip specific task IDs regardless of status
# (repeatable flag or comma-separated; also settable via EXCLUDE_TASK_IDS env):
bash scripts/orch-cold-evict.sh --exclude-ids FIX-BCTC-BANK-SUMMARY-MAPPING --exclude-ids OTHER-ID
bash scripts/orch-cold-evict.sh --exclude-ids=FIX-BCTC-BANK-SUMMARY-MAPPING,OTHER-ID
# Owning brief: docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md §3
#   D4 extension brief: docs/architecture-briefs/2026-07-10-backlog-hygiene-verify-prune-sweep.md §8
# Called from: HSC-2 (one-time migration); HSC-6 (pm/dev-team post-cycle hook); D1 (sweep execution)
```
Evicts done[], done_verified[], terminal active_sprints[], terminal signal_queue.rows[], and
signal_queue.archive[] to docs/data/orch/archive/YYYY-MM.json. **D4 extension (2026-07-10):** also
scans the flat task lanes `{backlog, review, qa, in_progress, ready}` (NOT done/done_verified —
already handled) for rows whose `.status` is terminal (`TERMINAL_TASK_STATUSES` env, default =
TERMINAL_SET, same definition as `TERMINAL_SPRINT_STATUSES`) — root cause: a status flipped to
terminal in-place without a lane move previously stranded forever in these lanes (this script never
read them). Cold sink: the `.backlog_detail[]` field in the monthly archive (present in the schema
since inception, previously always `[]`, now wired). `--exclude-ids` is a migration-time safety
valve only — not a permanent per-row allowlist.
**FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE (2026-07-29):** an excluded row keeps its terminal
status only until this script's own SHG-3 write-gate runs — `build_hot_temp()` relabels it in-place
to a lane-coherent status (`EXCLUDE_RELABEL_STATUS` env, default `BLOCKED` for backlog/review/
in_progress, `QA`/`READY` for qa/ready — mirrors `LANE_ALLOWED_STATUSES`, orchStateSchema.ts) before
validation, and stamps `verify_note` with the original status + timestamp for traceability. Without
this, a terminal status parked in a non-terminal lane hard-fails Stage-1b `checkLaneCoherence()`
(D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING, commit `ed01c5c1b`) and aborts the *entire* eviction run,
not just the excluded row. The checker itself is untouched — only the data it validates is corrected.
Atomic temp-then-rename; cold-first ordering; mtime-CAS retry; idempotent.
Internal orch-apply.sh call propagates `ORCH_APPLY_LIVE_FILE_OVERRIDE="${ORCH_STATE}"` (no-op in
production — REQUIRED whenever `ORCH_STATE` is overridden, e.g. testing against a throwaway
fixture; without it orch-apply.sh silently falls back to its own default, the REAL live file) and
sets `ORCH_APPLY_ALLOW_SHRINK` (this script is one of only 2 legitimate bulk-eviction bypass
call sites — see FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER above).
Test coverage: `bash scripts/test/orch-cold-evict-tests.sh` (evict-correctness / non-terminal-skip /
--exclude-ids / idempotent-rerun / conservation-guard-still-fires / --dry-run-no-mutation — mirrors
`orch-apply-wrapper-tests.sh`'s fixture + real-live-hash-unchanged safety pattern; never run against
the live `docs/data/orch/orch-state.json` file).

**CANONICAL: Backlog stub migration + cold detail writer (ORCH-STATE-HOT-COLD-SPLIT HSC-4)**
```bash
# Dry-run (preview stub counts + projected hot-file size, no writes):
bash scripts/orch-backlog-stub.sh --dry-run
# Live migration (MUST hold commit-mutex:main before calling):
bash scripts/orch-backlog-stub.sh
# Override stub field set (comma-separated; default per FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE
# below — depends_on/depends/blocked_by MUST stay in any override, see that note):
STUB_FIELDS="id,title,priority,size,type,zone,status,sprint,detail_ref,depends_on,depends,blocked_by" \
  bash scripts/orch-backlog-stub.sh --dry-run
# Owning brief: docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md §HSC-4
# Called from: HSC-4 one-time migration; pm/flow/main.md when adding new backlog items
```
Strips prose from all backlog[] items in hot orch-state; moves full items (id-keyed) to
docs/data/orch/archive/backlog-detail.json. Adds detail_ref pointer to every stub.
Atomic temp-then-rename; cold-first ordering; mtime-CAS retry; idempotent (existing cold wins).
Lazy-load full detail for one id: `jq '.items["<id>"]' docs/data/orch/archive/backlog-detail.json`
Internal orch-apply.sh call propagates `ORCH_APPLY_LIVE_FILE_OVERRIDE="${ORCH_STATE}"` (same
no-op-in-production safety propagation as orch-cold-evict.sh above). Does NOT set
`ORCH_APPLY_ALLOW_SHRINK` — this script only strips fields, `task_board.backlog` length is
unchanged, so it never trips the conservation guard.
**FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE (2026-07-30, AC-4):** default `STUB_FIELDS` now
includes `depends_on,depends,blocked_by` (was: `id,title,priority,size,type,zone,status,sprint,
detail_ref` only). Root cause closed: a re-run of this migration used to silently strip an inline
dep from a hot row while the cold `backlog-detail.json` entry's own stale `depends_on: null`
survived (this script's own "existing cold wins" merge, above) — a dependency set correctly could
be silently unset, re-opening a gate `scripts/lib/devteam-eligibility.jq`'s `effective_depends_on()`
had previously closed. NEVER override `STUB_FIELDS` without these 3 names. Regression proof (incl. a
reproduction of the pre-fix silent-gate-reopen via the old field list): `bash scripts/orch-backlog-stub.test.sh`.

**CANONICAL: Context-bloat backstop regression test (FIX-CTXBLOAT-ARCHIVE-CAP-OVERMATCH + TE-T24)**
```bash
# Regression: T1 archive/*.md >200L → EXEMPT | T2 top-level notebooks/*.md >200L → BREACH (line-cap)
#   | T3 mega-line 5L/>12000B → BREACH (byte-cap, passes line cap — the evasion case) | T4 normal
#   150L file within both caps → CLEAN (no false positive).
bash scripts/agents-flow/context-bloat-backstop.test.sh
# Exit 0 = all 4 pass. Exit 1 = failure.
# Owning brief: docs/architecture-briefs/2026-05-24-context-bloat-backstop-hook.md §2a
# Byte-cap predicate (MATCHED_CAP x 60 bytes, reason='byte-cap', SAME settle-window as the line
# predicate; a line-based size-justification never suppresses it): TE-T24, see
# docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-24
```

**CANONICAL: Fleet worktree push backstop (TASK-AUTO-PUSH-A)**
```bash
# No-op check (safe, never pushes unless ahead > threshold):
bash scripts/fleet-worktree-push.sh --dry-run
# Live push (fires when git rev-list --count origin/main..HEAD > PUSH_THRESHOLD=20):
bash scripts/fleet-worktree-push.sh
# Override threshold (tunable, no rebuild needed):
PUSH_THRESHOLD=30 bash scripts/fleet-worktree-push.sh
# Owning flow: docs/agents/po/flow/main.md § Step PUSH-BACKSTOP
# Fallback flow: docs/agents/dev-team/flow/post-cycle.md § Step PUSH-BACKSTOP
```

**CANONICAL: Cowork guaranteed-slot OS-level firer (F1-LAUNCHD-COWORK-BACKSTOP)**
```bash
# Dry-run (print what would fire for every guaranteed===true match, no claude invocation):
bash scripts/agents-flow/cowork-guaranteed-slot-firer.sh --dry-run
# Live run (invoked by launchd every 15 min — calls cowork-match-slots.js,
# filters to guaranteed===true, fires each match's trigger_prompt verbatim):
bash scripts/agents-flow/cowork-guaranteed-slot-firer.sh
# Override claude binary path (env, no rebuild):
CLAUDE_BIN=/path/to/claude bash scripts/agents-flow/cowork-guaranteed-slot-firer.sh
# Owning flow doc: docs/standards/cron-jobs.md § Cowork Guaranteed-Slot Firer
# Plist: launchd/com.vn-market.cowork-guaranteed-slot-firer.plist
# Slots: every docs/data/cowork-schedule.json row with guaranteed:true — currently
#   chef-morning/eod/evening, digest-sunday/daily, tnb-audit, fb-daily, fb-weekend.
#   A new guaranteed:true row is covered automatically — ZERO script edits.
# OPS install: launchctl load ~/Library/LaunchAgents/com.vn-market.cowork-guaranteed-slot-firer.plist
# Self-check: scripts/agents-flow/auditor-tier1-probe.sh asserts this label (and every
#   other repo-tracked launchd/*.plist Label) stays loaded (FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED)
```

**CANONICAL: Dev-team idle-capacity backlog pickup (SYSREMAKE-P2-DEVTEAM-BACKLOG-PICKUP-BOUNDED1)**
```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# 1. Promote (backlog[] -> ready[], top-priority unsupervised depends_on-eligible
#    BACKLOG/TODO row, no-op if WIP>=1):
jq --arg now "$NOW" \
  --slurpfile detail docs/data/orch/archive/backlog-detail.json \
  --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
  -f scripts/devteam-backlog-promote-bounded1.jq \
  docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# 2. Claim (ready[] -> in_progress[] + .head, no-op if nothing bounded-1-stamped waiting):
jq --arg now "$NOW" -f scripts/devteam-backlog-claim-bounded1.jq \
  docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
```
Owning flow doc: `docs/agents/dev-team/flow/main.md` § Idle-capacity backlog pickup (BOUNDED-1), Step 0b head-idle fall-through, before Step 1 PO triage. BOUNDED-1 gate: WIP (`ready[].length + in_progress[].length`) must be `< 1` — this lane is capped at ONE task in flight (user-gated 2026-07-04, distinct from the WIP≤2 human/router-supervised budget). Both scripts are idempotent no-ops outside their gate condition; neither has a hardcoded task ID; both write ONLY through `orch-apply.sh`. **supervised gate (FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE, 2026-07-09):** `effective_supervised` rows are NEVER auto-promoted — true if EITHER inline `.supervised` on the board row OR `backlog-detail.json` `.items[<id>].supervised` (detail-authoritative, no `.detail_ref` precondition) is true; absent/null in both = promotable. Closes the 2026-07-09T15:48Z near-miss where the old board-row-only check silently treated every detail_ref'd supervised row as unsupervised. Test: `scripts/test-devteam-bounded1-supervised-flag.sh`. **depends_on gate (FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE, 2026-07-08):** promote only picks rows whose effective `depends_on` (inline, or looked up in `backlog-detail.json` for `detail_ref`'d rows) are ALL `DONE_VERIFIED` in some `task_board` lane; a dep resolving nowhere is conservative-skipped. Filter runs during candidate ranking, not just on the final pick — a blocked top-ranked row never starves an eligible lower-ranked one. Test: `scripts/test-devteam-bounded1-depends-on.sh`. **epic-wrapper gate (FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE, 2026-07-10):** rows carrying a non-empty `children[]` (decomposition containers, e.g. `mode=audit-epic`/multi-child SPIKEs — not directly-dispatchable atomic tasks) are NEVER auto-promoted, regardless of `supervised` — `effective_children` mirrors `effective_supervised`'s precedence exactly (EITHER inline `.children` on the board row OR `backlog-detail.json` `.items[<id>].children` is non-empty, no `.detail_ref` precondition). Closes the 2026-07-09T23:17Z near-miss (AUDIT-FETCH-COMPLETE auto-claimed, point-fixed by hand) plus the structurally identical exposed row FACTORY-GUARD-CI-REGRESSION-SPIKE (`supervised:null` everywhere — the supervised gate alone could not have caught it). Test: `scripts/test-devteam-bounded1-epic-wrapper.sh`.

**CANONICAL: Design-Router Sweep — non-dev next_agent residual dispatch lane (FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE, 2026-07-30)**
```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# 1. Promote (backlog[] -> ready[], top-priority allowlisted non-dev-next_agent
#    row not already SLS's supervised+plan_only territory, no-op if WIP>=2):
jq --arg now "$NOW" \
  --argjson allowlist '["architect","ba","pm","po","agents-architect"]' \
  --slurpfile detail docs/data/orch/archive/backlog-detail.json \
  --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
  -f scripts/devteam-backlog-promote-design-router-sweep.jq \
  docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# 2. Claim (ready[] -> in_progress[] + conditional-guard .head write, no-op if
#    nothing design-router-sweep-stamped waiting):
jq --arg now "$NOW" -f scripts/devteam-backlog-claim-design-router-sweep.jq \
  docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
```
Owning flow doc: `docs/agents/dev-team/flow/main.md` § Design-Router Sweep (DRS), 4th writer of the pre-existing WIP≤2 in_progress budget (BOUNDED-1 → SLS → RLC → **DRS** → QA-Drain → Step 1), Step 0b head-idle fall-through, before Step 1 PO triage. PO ratification: `docs/agent-memory/decisions/ruling-20260730T0906Z-po-triage-po.md` STEP po-4. **Agent-identity allowlist** (`is_design_router_allowed`, `scripts/lib/devteam-eligibility.jq`) is DRS's compensating control in place of a supervised/plan_only flag gate — ratified NARROW: `{architect, ba, pm, po, agents-architect}`; `agent-father`/`ops`/`ops-mainserver-fetch`/`ops-vps-fetch`/`qa`/`system-auditor` explicitly excluded. **Eligibility** (`is_design_router_eligible`, same file): `is_non_dev_next_agent_unrouted` AND NOT (`effective_supervised` AND `effective_plan_only` both true — SLS's own territory, an AND not an OR, so a row carrying exactly one of the two flags remains DRS-eligible) AND allowlisted AND not an epic wrapper AND `depends_on` satisfied AND NOT detail-DEFERRED* AND no unbacked prose sequencing. **`.head` write is a MANDATORY conditional guard from day one** (never an unconditional replace — hard AC, PO ratification Q3) per the live `qadrain-head-slot-decouple` precedent (`docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md`). Test: `scripts/audits/devteam-dispatch-gate-satisfiability.sh` (DRS positive-fire + allowlist negative control + `.head` conditional-guard negative control) and `scripts/audits/bounded1-supervised-lane-report.sh`'s dedicated DRS section (DRS-ELIGIBLE vs DRS-STRANDED-OFF-ALLOWLIST split, non-gating).

**CANONICAL: Supervised-Lane Sweep (SLS) claim — `ready[]` FALLBACK for unstamped rows (FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER, 2026-07-30)**
```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# 1. Promote (backlog[] -> ready[], top-priority doubly-gated
#    effective_supervised && effective_plan_only row, no-op if WIP2>=2):
jq --arg now "$NOW" \
  --slurpfile detail docs/data/orch/archive/backlog-detail.json \
  --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
  -f scripts/devteam-backlog-promote-supervised-lane-sweep.jq \
  docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# 2. Claim — PRIMARY (SLS-stamped ready[] row) OR, if none, FALLBACK (an
#    unstamped ready[] row matching the same doubly-gated predicate that
#    arrived via a route OTHER than step 1 above — PO hand-placement,
#    PM/architect decomposition, an earlier manual promote). `--slurpfile
#    detail`/`--slurpfile archive` are now REQUIRED (previously were not —
#    a stale copy-paste of this snippet from before 2026-07-30 will jq-error
#    "$detail is not defined"):
jq --arg now "$NOW" \
  --slurpfile detail docs/data/orch/archive/backlog-detail.json \
  --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
  -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq \
  docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
```
Owning flow doc: `docs/agents/dev-team/flow/main.md` § Supervised-Lane Sweep (SLS), 2nd writer of the pre-existing WIP≤2 in_progress budget (BOUNDED-1 → **SLS** → RLC → DRS → QA-Drain → Step 1), Step 0b head-idle fall-through, before Step 1 PO triage — see that section's own "Lane × Gate Coverage Matrix" for the full `(lane × supervised × plan_only × epic-wrapper)` resolution table. **ROOT CAUSE closed:** a `ready[]` row carrying BOTH `effective_supervised==true` AND `effective_plan_only==true` but lacking the `promoted_by="dev-team (supervised-lane sweep)"` stamp only step 1 above writes was rejected by ALL FOUR dispatch pickers (BOUNDED-1 never reads `ready[]`; the claim script's own PRIMARY selector required the exact stamp; RLC excludes any supervised/plan_only row unconditionally; DRS excludes the doubly-gated class and only reads `backlog[]`) — unreachable by construction, confirmed live 2026-07-30 against 3 P0 `ready[]` rows. **FALLBACK eligibility** (reuses `scripts/lib/devteam-eligibility.jq`, no forked logic): `effective_supervised` AND `effective_plan_only` both true, NOT `is_epic_wrapper` (a decomposition-container row is closed out separately — see `docs/agents/dev-team/flow/post-cycle.md` § Step 4.4 Epic-Wrapper Autoclose Sweep, never re-promoted/re-claimed by any of the four dispatch pickers), `deps_satisfied`, NOT detail-DEFERRED*. Resolves `dispatch_lane` via the same `resolved_dispatch_lane` helper SLS-promote uses. **Does NOT forge `promoted_by`** (explicit constraint — forging provenance was rejected as a fix) — the row's existing `promoted_by` (null, or whatever placed it) is carried through unchanged; `claimed_by` gets a distinct string (`"dev-team (supervised-lane sweep — unstamped ready fallback)"`) so PRIMARY vs FALLBACK claims stay auditable in an audit trail. PRIMARY always takes priority over FALLBACK within one invocation (at most one claim per tick, same discipline as every other picker in this chain). Test: `scripts/audits/devteam-dispatch-gate-satisfiability.sh` (§ SLS-claim FALLBACK — positive fire + `dispatch_lane` resolution + `promoted_by`-not-forged + epic-wrapper/unmet-`depends_on` negative controls + PRIMARY-vs-FALLBACK ordering, 40/40 PASS) and `scripts/audits/bounded1-supervised-lane-report.sh`'s new READY-PRIMARY (gates exit code)/READY-WRAPPER/READY-XOR sections plus REVIEW-SUP-PO (confirms `review[]` supervised+plan_only rows were never actually gated out of the pre-existing Review-Lane QA-Drain lane — that claim script has no supervised/plan_only check at all, by design).

**CANONICAL: Tool list-doc stub generator (TE-T28)**
```bash
python3 scripts/gen-tool-list-stubs.py              # live run — writes the current missing delta
python3 scripts/gen-tool-list-stubs.py --dry-run     # preview only, writes nothing
# Offline/test override (skips the live gateway call):
TOOL_SCHEMA_JSON_OVERRIDE=<path-to-list_server_tools-json> python3 scripts/gen-tool-list-stubs.py --dry-run
```
Diffs `docs/data/tool-registry.json` (SSOT tool inventory) against the basenames already
under `docs/agents/tools/list/` and mints a lean stub (get_price_history.md shape) for
exactly the missing delta — idempotent, never overwrites an existing stub, never hardcodes
a count. Live parameter schema is pulled via the gateway meta-tool `list_server_tools`
(server=`vn-market`) through the shared bash bridge `scripts/agents-flow/mcp-call.sh`'s
`mcp_call_gateway_meta()` — no duplicated transport. No-fabrication: if the live schema is
unreachable, or a specific tool is absent from the live listing, the stub is still emitted
from registry metadata only and clearly flagged `LIVE SCHEMA UNAVAILABLE` with zero guessed
parameter rows. Owning brief:
`docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-28`. Companion fix
(same task): `.claude/skills/anti-hallucination/SKILL.md` — "no list/ doc" is a DOC GAP
against `docs/data/tool-registry.json`, not proof the tool doesn't exist.

**CANONICAL: Tool inventory INDEX generator (TE-T31)**
```bash
bash scripts/gen-tools-index.sh              # regenerate docs/agents/tools/list/INDEX.md
bash scripts/gen-tools-index.sh --check      # exit 1 if regeneration would change the file, writes nothing
```
Renders `docs/agents/tools/list/INDEX.md` straight from `docs/data/tool-registry.json`
`.groups[]` — total (`.totalCount`) and every per-category count (`.groups[].count`) are
computed LIVE, nothing hardcoded. Kills the recurring "tool-count 3-way drift" class
(INDEX.md self-declared a stale "157 tools / canonical tool inventory" vs the registry's
184, with its own header table disagreeing with its own section headings). Idempotent —
no embedded wall-clock timestamp, only the registry's own `.lastUpdated` field is echoed,
so a no-op run against an unchanged registry is byte-identical (proven: two consecutive
runs both print `NOOP`). Owning brief:
`docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-31`.

**CANONICAL: Cold archive sweep — handoffs/sessions/po-decisions rotation (TE-T33)**
```bash
bash scripts/agents-flow/cold-archive-sweep.sh                # normal run — no-op except on the 1st of the month
COLD_ARCHIVE_FORCE=1 bash scripts/agents-flow/cold-archive-sweep.sh   # force-run any day (ad-hoc / test)
```
Monthly-guarded, idempotent. Three legs: (1) `docs/handoffs/*.md` >30d AND not referenced
by any OPEN `task_board` lane (backlog/ready/in_progress/review/qa — computed live via jq,
never hardcoded) → `docs/handoffs/archive/YYYY-MM/`; (2) `docs/agent-memory/sessions/*`
non-`.md` files >30d → `docs/agent-memory/sessions/archive/YYYY-MM/` (the `.md` leg is
already owned by `memory-prune-sweep.sh` at a tighter 14d flat-archive threshold — no
overlap); (3) `docs/agent-memory/decisions/po-decisions.md` rotated at 200L via the SAME
drop-oldest-`## ` algorithm as `notebook-auto-prune.sh`, delegated through that script's
new opt-in `NOTEBOOK_PRUNE_EXTRA_GOVERNED_PATH` governed-path hook (default unset = zero
behavior change on the hot PostToolUse path) — no duplicated prune scheme. Decision-journal
archival (`decisions/sprint-*.md`) is explicitly OUT of scope — SUPERSEDED by
`scripts/agents-flow/decision-journal-archive.sh` (UC-MDH-P4, status-based not mtime-based;
board row TE-T33 carries this coordination note). Owning flow:
`docs/agents/code-janitor/flow/main.md` § Cold Archive Sweep. Test:
`scripts/agents-flow/cold-archive-sweep.test.sh`. Owning brief:
`docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-33`.

**CANONICAL: Foreign-flow freshness recheck harness (FFLOW-STALE-0723-B-RECHECK-HARNESS)**
```bash
scripts/check-foreign-flow-freshness.sh              # live gate — exit 0 PASS / 2 STALE / 3 ERROR
scripts/check-foreign-flow-freshness.sh --self-test    # proves fresh/stale/weekend-nuance branches
scripts/check-foreign-flow-freshness.sh --help
```
Neutral, weekend/holiday-aware verification instrument for market foreign-flow ("khoi ngoai")
data — the "assume complete fixed" gate for any foreign-flow VPS/pipeline recovery incident
(origin: FFLOW-STALE-0723, Vinahost VPS suspended-for-non-payment outage). Probes
`get_market_foreign_flow` via `scripts/agents-flow/mcp-call.sh`; computes the Last Completed
Trading Session (LCTS) by shelling into the SAME canonical calendar module the OHLCV pipeline
uses (`apps/mcp-server/src/domain/services/vnTradingCalendar.ts` via `bun -e`) — NO hardcoded
holiday list in the script. Emits one stdout line
`FOREIGN_FLOW_FRESHNESS verdict=<PASS|STALE|ERROR> latest_date=... lcts=... now_ict=...` for
cron/CI capture; any ambiguity (probe/parse/calendar failure) is ERROR/exit 3, never a false
PASS. Owning monitoring doc pointers: `docs/agents/ops/flow/vps.md`,
`docs/agents/system-auditor/flow/main.md` § Per-Source Fetch Freshness.

**CANONICAL: Commit-path peer-index sweep guard (FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK)**
```bash
./scripts/git-hooks/install.sh                       # symlinks pre-commit + post-commit into .git/hooks/ (re-run after a fresh clone / .git rebuild)
bash scripts/git-hooks/pre-commit.test.sh             # permanent regression suite, disposable scratch repos only
```
Universal, transport-agnostic `pre-commit` hook — Layer 0 of the sweep-guard fix. Detects a
BARE (pathspec-less) `git commit` about to absorb ALL currently-staged content, including a
concurrent peer's `git add`'d WIP, via the `$GIT_INDEX_FILE` basename discriminator
(`index`/`index.lock` = BARE; `next-index-<pid>.lock` = pathspec-SCOPED, structurally immune).
WARN-by-default fleet-wide (stderr banner + `.git/sweep-guard.log` + best-effort
`docs/signals/*.json` bug-escalation, bash+jq only); opt-in hard-block per call site via
`GIT_SWEEP_GUARD_MODE=reject` only once that site's own commit line has migrated to pathspec
form (reference migration: `.claude/skills/commit-mutex/SKILL.md` Step 3c). Binds the
INV-GATEWAY-1-exempt population (dev-\*/qa/ba/pm/architect) too — a git hook sits beneath the
MCP-bound commit-mutex skill, so it cannot be opted out of the way a skill can. Owning brief:
`docs/architecture-briefs/2026-07-21-commit-path-peer-index-sweep-guard.md` §4.1/§4.3.
Discriminator premise verified live via `scripts/audits/verify-commit-sweep-discriminator.sh`
(re-run on any new git version before trusting this hook).

**CANONICAL: Notebook retained-section immutability gate replay (FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS)**
```bash
bash scripts/audits/verify-notebook-immutability-gate.sh [--commits N] [--file <path>]
```
Read-only corpus replay for `scripts/git-hooks/pre-commit` `_check_notebook_immutability` /
`_is_dated_heading` / `_notebook_section_hashes` — sources those 3 functions VERBATIM (never a
reimplementation) and replays them against the REAL commit history of every
`docs/agent-memory/notebooks/*.md`. The gate is **warn-by-default**
(`GIT_NOTEBOOK_IMMUTABILITY_MODE=reject` opts a caller into hard-block) until this script reads 0
rejects across the corpus — re-run it before ever re-arming reject-mode fleet-wide or changing the
hashing/classification logic.

**CANONICAL: DASHBOARD.md append actuator (FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED)**
```bash
scripts/emit-dashboard-row.sh --check-id <A-xx|B-xx|C-xx> --title "<...>" --severity <CRITICAL|WARN|INFO> \
  --location "<...>" --details "<...>" --impact "<...>" --root-cause "<...>" --zone-owner <specialist> \
  --signal-id <id from the paired emit-audit-signal.sh marker>          # named args, see header comment
```
Gives `docs/data/DASHBOARD.md` the same anti-false-green treatment `scripts/emit-audit-signal.sh`'s E-3
step already gives signal_queue rows: tmp+mv atomic append, commit-mutex-guarded (self-contained —
does not nest into `scripts/auditor-notebook-commit.sh`), then a MANDATORY POST-WRITE read-back
(`grep -qF "signal <id>"`) that fails loud to the BUG channel if the anchor is not found on re-read.
Replaces unscripted prose ("append a DASHBOARD.md row") that had no script, no path SSOT, and no
failure path — the `docs/handoffs/DASHBOARD.md` path is a stale phantom (UC-ASL-P6 purges it) and the
`.claude/skills/signal-dashboard/` skill governs `.signal_queue.rows[]`, a different artifact — neither
is this script's target. Owning flow: `docs/agents/system-auditor/flow/main.md` §Anomaly Reporting →
DASHBOARD Append. Test: `scripts/emit-dashboard-row.test.sh`.

**CANONICAL: Audit OUTPUT-CONTRACT parser (FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED)**
```bash
scripts/audit-output-contract.sh --markers-file <path> [--cycle-start-ts <ISO8601>] \
  [--anomalies-count <N>] [--next-token <token>] [--orch-state-file <path>]
```
Mechanically parses the `[emit-signal]`/`[emit-dashboard]`/`[post-agent-signal]` marker lines a
system-auditor cycle accumulated into a scratch file and PRINTS the
`[OUTPUT-CONTRACT] signals_posted=N | telegram_sent=N | signal_queue_rows_written=N | dashboard_rows=N |
dedup_skipped=N` line — the agent pastes this verbatim, it never hand-composes the counts again.
Closes a confirmed recurring defect that failed in BOTH directions on 2026-07-29 (over-report:
narrated N, wrote 0; under-report: narrated 0, wrote 1 — root cause: a `SKIP-dedup` marker, which
still carries `id=`, misread as "nothing emitted"). Adds an independent `.signal_queue.rows[]`
cross-check (closes a previously vacuous same-agent-narrates-both-operands check) and symmetric
violation checks for `dashboard_rows==0` and RETURN-headline/`NEXT`-token consistency, each firing its
own BUG-channel Telegram. Owning flow: `docs/agents/system-auditor/flow/main.md` §Anomaly Reporting →
OUTPUT-CONTRACT. Test: `scripts/audit-output-contract.test.sh`.

**CANONICAL: Source-code size-lint-justification CI guardrail (FACTORY-GUARD-CI-SIZELINT-IMPL)**
```bash
bash scripts/audits/size-lint-justification.sh --check    # CI mode: exit 0 pass / 1 fail, no writes
bash scripts/audits/size-lint-justification.sh --update   # regenerate docs/data/size-lint-baseline.json
```
CI-time (not hook-time) code-plane sibling to `scripts/agents-flow/context-bloat-backstop.sh` — that
hook's own SSOT note is explicit: "Code and data JSON are explicitly NOT governed" (docs-plane only).
Full-tree scan of `apps/**/*.ts|*.py|*.go` + `packages/**/*.ts` (excl. `__tests__/`/`tests/`/`*.test.ts`/
`*_test.go`/`test_*.py`/`*.d.ts`/`node_modules/`/`dist/`/`.venv/`/`PDF-Extract-Kit/`/`vendor/`) at
push/PR time, so non-Claude-tool writes can't bypass it the way the PostToolUse hook can. Baseline/ratchet,
NOT blanket hard-fail: `docs/data/size-lint-baseline.json` grandfathers pre-existing over-cap files
(666 as of 2026-07-29, generated via `--update`); a grandfathered file failing only if it grows past
±10%/min-5L tolerance (mirrors the backstop hook's own tolerance idiom), a brand-new >120L file without
a `size-justification:` header always fails. Wired as the `size-lint` job in `.github/workflows/ci.yml`
(ubuntu-latest, checkout-only, no toolchain — cheapest job in the pipeline). Design brief:
`docs/architecture-briefs/2026-07-24-factory-guard-ci-size-lint-justification.md`. Test: `scripts/audits/size-lint-justification.test.sh`.

**CANONICAL: Metric-mask CI guardrail (FACTORY-GUARD-CI-METRICMASK-IMPL)**
```bash
bash scripts/audits/metric-mask-lint.sh --check    # CI mode: exit 0 pass / 1 fail, no writes
```
Zero-tolerance (NOT baseline/ratchet, unlike the size-lint sibling above — live debt was only
4 lines in 2 files, fixed in the same task that shipped the gate, so it opens at zero offenders).
Scans `apps/**/*.ts|*.py|*.go` + `packages/**/*.ts` (same exclusions as size-lint) for a silent
`?? <non-zero-literal>` / `|| <non-zero-literal>` / Python `or <non-zero-literal>` / destructuring-
or-param-default `<non-zero-literal>` fallback on an identifier matching `/confidence|score|impact|
magnitude|probability/i` — the "confidence_score=50" fabrication bug class (a plausible-looking
measured value silently substituted for an honestly-propagated absence). `0`/`0.0`/`null` fallbacks
are always allowed (the honest-absence idiom already established repo-wide, e.g. `row.confidence ??
0`) — never flagged. Comment-only keyword mentions are never scanned as code. Escape hatch: an
inline `metric-mask-allow: <reason>` comment on the same line or the line immediately preceding a
match suppresses it (mirrors `size-justification:`'s convention) — used for genuine caller-facing
config defaults (`watchlist.ts:198`, `brokerCredibilityTools.ts:51`) that are not fabricated metrics.
Wired as the `metric-mask-lint` job in `.github/workflows/ci.yml` (ubuntu-latest, checkout-only, no
toolchain). Design brief: `docs/architecture-briefs/2026-07-24-factory-guard-ci-metric-mask-lint.md`.
Test: `scripts/audits/metric-mask-lint.test.sh`.

**CANONICAL: TS/JS architecture-fence CI guardrail (FACTORY-GUARD-CI-TSBOUNDARIES-IMPL)**
```bash
cd apps/mcp-server && ./node_modules/.bin/eslint src/ --max-warnings=0   # or: apps/news-fetch → bun run lint:ci
cd apps/frontend    && bun run lint:fence                               # frontend's dedicated fence-only script
```
Rule content (`eslint-plugin-boundaries` Fence-A/B/[C] in each service's `eslint.config.mjs`) already
existed on all 3 TS services (mcp-server, news-fetch, frontend) — the gap this task closed was that
ESLint never ran in CI at all (zero `eslint` step anywhere in `.github/workflows/`), so the fences were
unenforced dead config. Wired as 3 new jobs — `mcp-server-eslint`, `news-fetch-eslint`, `frontend-eslint`
— in `.github/workflows/ci.yml`. Zero-tolerance, same size-driven call as metric-mask-lint above: live
debt was 4 lines / 3 files (mcp-server `getMoneyRadarComposite.ts` 2x + `recoverMissingOhlcvSession.ts`
1x reaching into interface/scheduler layers; news-fetch `routes/fetchArticle.ts` importing infrastructure/
directly) plus one previously-invisible violation surfaced by fixing a drifted `boundaries/elements`
element-map gap (news-fetch's real route-handler directory `src/routes/**` was unclassified — mapped to
the "interface" type). All fixed via pure relocation (queryMarketWideForeignFlow + credit-flow computation
moved to their correct DDD layer; recoverMissingOhlcvSession.ts moved from application/usecases/ into its
sole caller's scheduler/market-data/ directory; news-fetch's PlaywrightBrowserFactory now wired via DI
setter from src/index.ts, the composition root) — zero logic rewrites, RAW-verified (tests + manual lint
diff against baseline) before/after. `eslint .` (whole-app-root glob) is NOT used for mcp-server — it
recurses into `node_modules` and trips on a vendored package's own unrelated `eslint.config.js`; each
job scopes to the service's own source tree (`src/` or the package's existing lint script) instead.
`apps/news-fetch` also carries a separate parallel Go implementation (`go.mod`/`.golangci.yml`, GFD-9
depguard) that had zero CI job of any kind — closed by a 7th `news-fetch-go-lint` job mirroring the 6
existing per-service go-lint jobs. Design brief:
`docs/architecture-briefs/2026-07-24-factory-guard-ci-depguard-tier-boundaries.md`.

**CANONICAL: Go composition-root-logic CI guardrail (FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL)**
```bash
go run scripts/audits/composition-root-logic-gate.go --check apps/<service>/cmd/server [apps/<service2>/cmd/server ...]
```
Zero-tolerance `go/ast`+`go/parser` (Go stdlib only, no new go.mod dep) guardrail closing the gap
`depguard` (existing Fence-A/B/C in every service's `.golangci.yml`) cannot express — depguard is
import-based only, it cannot see that a composition-root adapter/shim type's RECEIVER METHOD embeds a
business decision (a fallback selection, an `IsEstimate`/`ParseOK`-style confidence flag) that belongs
in `pkg/application`, not `cmd/server/`. Scope: `ast.FuncDecl` nodes with a receiver, inside
`cmd/server/**/*.go` (excl. `*_test.go`) — `func main()` and every free (non-receiver) helper function
(`envStr`/`envInt`/`getenv`/`splitCSV`/`parseWatchlist`/`readWatchlistFromDB`) are structurally out of
scope (no receiver), not a special-cased allowlist. Threshold: flag when `if`-count >= 2 OR any
`for`/`range` appears anywhere in the method body (incl. nested func literals) — grep-verified
2026-07-24 to cleanly separate the 2 real offenders from every other checked receiver-method shim
across all 7 Go services (zero false positives; independently re-verified live 2026-07-30, same
result). Escape hatch: `// composition-root-logic-allow: <reason>` on the line(s) immediately
preceding the method (`go/ast`'s `FuncDecl.Doc` — a blank line breaks the association, same
"immediately preceding" contract as `size-justification:`/`metric-mask-allow:`). Live debt at design
time was 2 functions in 1 service (`apps/macro-indicators/cmd/server/adapters.go`:
`policyRatesAdapter.FetchPolicyRates` HTML-vs-DB-fallback + `IsEstimate`, `omoAdapter.FetchOMO`
`ParseOK`-fail-closed decision + a tenor-row DTO-mapping loop) — fixed in the same task that shipped
the gate by moving the DECISION logic into two new `pkg/application` resolvers
(`PolicyRatesResolver`, `omoResolver` — both still implement the pre-existing `PolicyRatesProvider`/
`OMOProvider` ports consumed by `LiquidityStateUseCase`, so `/liquidity-state`'s behaviour is
unchanged) while the composition-root adapters were split into pure-delegation pairs
(`policyRatesHTMLAdapter`+`policyRatesDBAdapter`, `omoRawAdapter`). The OMO tenor-row struct-mapping
loop (mechanical field copy between two distinct named struct types — Go disallows implicit slice
conversion between them even with identical field shapes) stays in `cmd/server/adapters.go` as a free
(non-receiver) function, `convertOMOTenorRows` — out of the gate's scope by construction, same
free-helper carve-out as `envStr`/`splitCSV`. RAW-verified against the LIVE running container: hit
`POST /liquidity-state` before and after rebuild (both calls landed on the exact 2 fallback/fail-closed
branches the gate flagged, live in production at verify time) — response bodies + `slog` warn-log
lines byte-identical modulo wall-clock `fetched_at` fields. Wired as a single `composition-root-logic-gate`
job in `.github/workflows/ci.yml` (not 7 per-service jobs like `go-lint` — the tool is syntax-only,
never type-checks/resolves imports, so one Go toolchain scans all 7 services' `cmd/server/` dirs in one
job). Design brief: `docs/architecture-briefs/2026-07-24-factory-guard-ci-depguard-tier-boundaries.md`
§3/§4. Test: `scripts/audits/composition-root-logic-gate_test.go` (`go test
scripts/audits/composition-root-logic-gate.go scripts/audits/composition-root-logic-gate_test.go`) —
NOT `.test.go` as the board-row note literally named it: Go's toolchain only discovers `_test.go`
(underscore) as test files, `.test.go` is invisible to `go test` and would silently ship a dead smoke
test.

**CANONICAL: Dead-code CI guardrail (FACTORY-GUARD-CI-DEADCODE-IMPL)**
```bash
bash scripts/audits/dead-code-gate.sh --check    # CI mode: exit 0 pass / 1 fail, no writes
```
Zero-tolerance (same fix-now pattern as metric-mask-lint.sh, NOT baseline/ratchet like
size-lint-justification.sh) `git ls-files`/grep guardrail against 4 recurring dead-artifact shapes,
all scanned on TRACKED files only (`git ls-files --cached` — a merely-gitignored-but-uncommitted
file is never flagged, only a staged/committed offender is): (1) tracked `*.bak`/`*.backup`/`*.patch`
files, (2) any tracked path with a `_deprecated/` segment (git history is the rollback reference,
same `FACTORY-INTERFACE-delete-bak-files` precedent — a graveyard folder adds zero safety over
`git log`/`git show` while diluting every grep), (3) a Go/TS "twin scaffold" — see deviation note
below, (4) `//go:build ignore` on any tracked `*.go` file. Live debt at design time (~1.4k LOC across
mcp-server ×2 `_deprecated/` trees + a dedicated wrapper test file + a surgical smoke-suite edit,
pdf-extractor's `_deprecated/mock_echo`, stock-price's `_deprecated/services_v1.go`+test, plus 2
stray root `docker-compose.yml.backup`/`.patch` files) fixed in the same task that shipped the gate
— `apps/technical-analysis/src/`'s independent ~697L share of the original ~2,070 LOC audit-brief
estimate had already been deleted by a separate, unrelated task (`099afddd3`,
`FACTORY-TECHANALYSIS-delete-orphaned-ts-service`) before this task was even dispatched; this task's
only remaining `technical-analysis` action was trimming `bun-types`/`typescript` out of
`package.json`'s `devDependencies` (the `module`/`start`/`test`/`check` script fields that commit
already removed) — `esbuild`/`playwright-core` kept, RAW-verified still load-bearing for
`dashboard/build.sh` (35/35 sandbox scenarios + headless render gate green post-trim, plus
`go build`/`go vet`/`go test ./...`/`golangci-lint run` all green).

**Check-3 deviation from the board-row note's literal phrasing** ("any `apps/<svc>/` with a Go
`cmd/server/` at its root MUST NOT also carry a top-level `package.json` and `src/`" — claimed
"0/7 Go services" after cleanup): that literal rule fails immediately and *permanently* against the
LIVE `apps/news-fetch` service, which legitimately carries all 3 structural elements today — a WIP
parallel Go port (own `news-fetch-go-lint` CI job + `composition-root-logic-gate` coverage per the
`FACTORY-GUARD-CI-TSBOUNDARIES-IMPL` entry above, same design-brief day) sitting alongside the live
TS/Bun service its `Dockerfile` actually builds and runs (`COPY --from=bun-builder /app/src ./src`,
`CMD ["bun","run","src/index.ts"]`). The confirmed dead instance this check is purpose-built for
(`apps/technical-analysis`, independently deleted per above) had the discriminating trait the
board-row note's directory-shape-only phrasing dropped: its `Dockerfile` `COPY`d only `cmd/ pkg/
api/` — zero `src/` reference of any kind. The shipped check generalizes that exact confirmed signal
instead of bare directory shape: flag `apps/<svc>/` only when it has a tracked `cmd/server/` AND a
tracked top-level `package.json` AND a tracked top-level `src/` **AND** its `Dockerfile` contains no
`src` reference at all (no `Dockerfile` present also fails — conservative default). RAW-verified:
`bash scripts/audits/dead-code-gate.sh --check` correctly reports 0 offenders on `apps/news-fetch`
(check 3 silently exempts it) while still catching the confirmed-dead shape via 2 dedicated
synthetic-fixture DoD cases (one Dockerfile-src-blind twin that fails, one Dockerfile-src-referencing
twin mirroring `news-fetch`'s own shape that passes). Wired as the `dead-code-gate` job in
`.github/workflows/ci.yml` (ubuntu-latest, checkout-only, no toolchain — cheapest job in the
pipeline). Design brief: `docs/architecture-briefs/2026-07-24-factory-guard-ci-dead-code-gate.md`.
Test: `scripts/audits/dead-code-gate.test.sh`.

**CANONICAL: No-hardcode-allowlist CI guardrail (FACTORY-GUARD-CI-NOHARDCODE-IMPL)**
```bash
bash scripts/audits/no-hardcode-allowlist-scan.sh --check    # CI mode: exit 0 pass / 1 fail, no writes
```
Zero-tolerance (same fix-now pattern as metric-mask-lint.sh/dead-code-gate.sh, NOT baseline/ratchet
like size-lint-justification.sh), 2 mechanically-reliable `git ls-files`/grep checks against a
ticker/date literal smuggled INTO a control-flow condition — NOT a named, generically-consumed
reference-data table (the brief's own verify-live pass found hundreds of legitimately-overlapping
domain rule-table arrays across `predictionCascadeMapper.ts`/`policyImpactMapper.ts`/etc — those are
explicitly excluded, not the bug class): (1) temporal special-case ban — `.includes('YYYY')` (TS) or
`strings.Contains(x, "YYYY")` (Go) co-occurring within a +/-2 line window with a literal-year equality
(`===?`/`==`); (2) ticker/code literal-branch ban — `(ticker|symbol|code|action_code)` (bare or
`<obj>.<ident>` property access) compared via `===`/`==` against a quoted 2-5-char ALL-CAPS literal,
denylisting the stable `HOSE|HNX|UPCOM|BLOOMBERG` exchange-enum comparisons (per §2(a) of the design
brief — those are typed domain-enum mappings, not volatile reference data). A generic cross-file
ticker-array-duplication detector (would have caught `JANITOR-034`) is explicitly DEFERRED — the repo
has dozens of legitimately overlapping domain rule tables (e.g. `predictionCascadeMapper.ts`'s cascade
categories intentionally re-use VCB/BID/CTG across unrelated buckets), so a mechanical
"N-shared-elements" check would false-positive heavily. Live debt at design time: 2 cosmetic
diagnostic-reason-string branches (`backfillBctcScalarsTool.ts` CTG-only, `pharmaEventMapper.ts`
IMP-only) fixed outright in the same task that shipped the gate (RAW-verified behavior-preserving —
only the reason/reasoning text differs, no classification/confidence/severity/direction field
changed); 2 known-debt findings (`JANITOR-034` ticker-array overlap in `cascadeExecutor.ts`+
`priceSourceRouter.ts`, `JANITOR-035` temporal special-case in `newsChainFallback.ts`) annotated via
the `hardcode-scan-allow: <ticket-id> — <reason>` escape hatch (mirrors `size-justification:`/
`metric-mask-allow:` — same-line-or-immediately-preceding-line contract) rather than generalized —
both already require a human design decision their own `docs/data/code-janitor-known-findings.json`
entries call for, out of this gate-shipping task's scope to make unilaterally.

**Deviation (verify-live, not in the board-row note's file list):**
`apps/mcp-server/src/domain/services/priceBackfillService.ts:224` (`ticker === "BAD"`) also matches
check-2's literal shape but is NOT one of the 2 fix/2 annotate targets above — it is a documented
test-fixture sentinel (`ohlcvWriteService.ts:49` already labels it "Historical seed/mock only...
sentinel present"), never called outside `__tests__/`, explicitly excluded from this scan's offender
count by the design brief's own §2(c) ("a test-mock-leaked-into-domain-layer issue, not a
reference-data/allowlist issue — out of this scan's scope"). Left unfixed by design (no live
behavior to change), but annotated with the same `hardcode-scan-allow:` escape hatch (citing the
brief §2(c) directly) so the gate's own zero-tolerance mechanical check does not open red on day one
against a site the design already ruled out of scope.

Wired as the `no-hardcode-allowlist-scan` job in `.github/workflows/ci.yml` (ubuntu-latest,
checkout-only, no toolchain — cheapest job in the pipeline). Design brief:
`docs/architecture-briefs/2026-07-24-factory-guard-ci-no-hardcode-allowlist-scan.md`.
Test: `scripts/audits/no-hardcode-allowlist-scan.test.sh`.

**CANONICAL: Shared-package-import CI guardrail (FACTORY-GUARD-CI-SHAREDPKG-IMPL)**
```bash
bash scripts/audits/shared-package-import-check.sh --check    # CI mode: exit 0 pass / 1 fail, no writes
bash scripts/audits/shared-package-import-check.sh --update   # regenerate docs/data/shared-package-import-baseline.json
```
Baseline/ratchet (like size-lint-justification.sh, NOT zero-tolerance — different justifying axis:
the debt isn't too voluminous to fix now, the fix is a domain keep-or-cut decision explicitly owned by
a separate, larger, still-BACKLOG task, `FACTORY-SHARED-wire-or-prune-shared-packages`; forcing that
decision inside this CI-tooling child task would preempt/duplicate that task's own field-superset-
reconciliation care). Check 1 (blocking): for every `packages/*/package.json` declaring a
`@vn-market/`-scoped `name`, grep `apps/**`+`packages/**` (own package dir excluded) for a real import
specifier (`from '@vn-market/<pkg>'` / `require('@vn-market/<pkg>')`) or `package.json` dependency
entry. >=1 real importer always PASSes regardless of baseline membership (a package gaining a consumer
makes its baseline entry stale — not auto-pruned, mirrors size-lint's manual `--update` idiom); 0
importers + baseline-listed PASSes (prints `BASELINE: <pkg> — tracked by FACTORY-SHARED-wire-or-prune-
shared-packages`); 0 importers + NOT baseline-listed FAILs — blocks a brand-new phantom package (the
`packages/primitives/technical-analysis` shape, already pruned once) from landing again without a human
decision. Deliberately scoped to `apps/**`+`packages/**` only, NOT `docs/**` — this repo's own
architecture briefs discuss these package names by name in prose, and including docs/ in the scan would
let that discussion text itself be misread as a "real importer", permanently masking the debt. Live
debt at design time: 3/3 `packages/shared-*` packages 100% orphaned (`shared-types`/`shared-config`/
`shared-db`) — seeded into `docs/data/shared-package-import-baseline.json` via `--update` in the same
task that shipped the gate. Check 2 (ADVISORY ONLY, never fails `--check`): scans top-level
`export interface|type|const|function <Name>` in `packages/shared-*/index.ts`, prints an `ADVISORY:`
line for every symbol name independently re-exported anywhere under `apps/**/*.ts` (excl. tests/vendor)
— today's live hits go beyond the brief's own cited examples (`Alert`/`Signal`/`McpConfig`): also
`loadMcpConfig`/`ExtractPDFRequest`/`ExtractPDFResponse`/`ComputeTARequest`/`ComputeTAResponse`/
`SearchRequest`/`SearchResult`/`ServiceHealth` — the brief's "e.g." wording was explicitly non-
exhaustive, so the wider live hit-set is a MORE thorough match to the general design, not a deviation.
Full AST structural diffing to make check 2 blocking is explicitly deferred (no TS AST tool is wired
into any bash-only audit script in this repo; a regex field-diff would false-positive on reorder/JSDoc/
optional-marker churn — same reasoning as the dead-code-gate/no-hardcode siblings' own deferrals).
Perf note: every batch (importer search, symbol-collision app-scan) is done via ONE `grep -l ... --
"${files[@]}"` call over the whole candidate file array rather than a subprocess-per-file loop — a
naive per-file-per-package/symbol loop is slow enough at this repo's file count (multi-minute) to make
`--check` unusable in CI; batching keeps it to ~7s. EXPLICITLY OUT OF SCOPE (reserved for
`FACTORY-SHARED-wire-or-prune-shared-packages`, still `BACKLOG`): this gate never edits
`packages/shared-*/` contents, never wires a new consumer, never deletes a package, never reconciles a
field — it only observes and reports. Wired as the `shared-package-import-check` job in
`.github/workflows/ci.yml` (ubuntu-latest, checkout-only, no toolchain — cheapest job in the pipeline).
Design brief: `docs/architecture-briefs/2026-07-24-factory-guard-ci-shared-package-import-check.md`.
Test: `scripts/audits/shared-package-import-check.test.sh`.

**CANONICAL: Rebuild-raw-verify attestation CI guardrail (FACTORY-GUARD-CI-RAWVERIFY-IMPL)**
```bash
bash scripts/audits/rebuild-raw-verify-check.sh <base-sha> <head-sha>    # exit 0 pass / 1 fail / 2 usage error
```
7th and LAST `ci-regression-prevention` guardrail (epic FACTORY-MAINTAINABILITY-2026-06). Zero-tolerance,
forward-only attestation check on a PUSH/PR DIFF RANGE — not a source-file-pattern sweep like the 6
siblings above, so there is no existing-file baseline to grandfather (the compliance gap is history,
nothing to retroactively fix; gate opens at zero going forward). Closes the gap: `PUSH-AUTONOMY-1` §5
below mandates a post-push RAW-live REALDATA verification whenever a commit touches serving code, but at
design time exactly 2 `VERIFY-*-REALDATA` board rows had EVER existed across 54 commits touching
`apps/**/src/**`/`pkg/**` serving code since §5 was pinned — concrete miss `e3386bdfa` ("remove DEFAULT-50
confidence mask, wire real severity/finding confidence", exactly this bug class) shipped zero attestation
and no companion row. Trigger (composes the two already-designed sibling primitives, brief §3, rather than
inventing a third pattern): a file matches if BOTH (a) it is under a DB-write/route-serving DDD layer
(`apps/*/src/infrastructure/**`, `apps/*/src/interface/**`, `apps/*/pkg/interface/http/**`,
`apps/*/pkg/infrastructure/**` — the same tiers `FACTORY-GUARD-CI-depguard-tier-boundaries` fences) AND
(b) an ADDED line (`git diff` `+` line) in that file matches the `metric-mask-lint.sh` sibling's own field
regex (`(confidence|score|impact|magnitude|probability)[A-Za-z0-9_]*`, case-insensitive) — reused verbatim,
not reinvented. On trigger, requires ONE of: (i) `git log <base>..<head> --format=%B` contains
`raw-verify|raw verified|realdata` (case-insensitive), global, excuses every trigger point; (ii) the range
touches `docs/agent-memory/decisions/**` or `reports/TASK_REPORT_*.md` with an ADDED line matching the
same token, global, excuses every trigger point; (iii) an inline `raw-verify-allow: <reason>` annotation on
the triggering line or the line immediately preceding it (mirrors `metric-mask-allow:`/`size-justification:`
idiom), PER-TRIGGER-POINT, excuses only that occurrence. None found → FAIL, printing every un-excused
file:line + a fix hint pointing at §5 below.

**Deviation (verify-live, narrower than the board-row note's literal "a file under `<layer>`" phrasing):**
test files colocated INSIDE these trigger layers (`apps/mcp-server/src/infrastructure/**/__tests__/*.test.ts`,
`apps/*/pkg/infrastructure/*_test.go`, `apps/*/pkg/interface/http/*_test.go` — confirmed live via `find`,
2026-07-30) are excluded from the trigger corpus; a test assertion like `expect(result.confidence).toBe(0.8)`
is not a serving-code change and would otherwise fire on nearly every infra/interface test edit, defeating
the brief's own "evidence-scoped, not maximal" design intent — same test/vendor exclusion idiom
`metric-mask-lint.sh` already applies to its own field-regex scan, reused here for the identical reason.

Fail-open posture (distinct from the 6 zero-tolerance/baseline siblings above, which all hard-error on a
malformed invocation): an invalid/absent base or head SHA (zero-SHA new-branch case, or a `git diff`/
`git log` failure — shallow clone missing the base commit, or a `pull_request` event where
`github.event.before` is empty) PASSes with a WARN rather than blocking a push on an inability to compute
the diff — same posture as the pre-push hook's own tsc-check fail-open branches. Wired TWO layers (brief
§3 — primary is the hook, not CI; this repo has no PR/branch-protection to gate on, confirmed live 2026-07-24:
`gh pr list` shows exactly 1 PR ever, closed unmerged, `gh api .../branches/main/protection` → 404):
(a) PRIMARY/blocking — `scripts/git-hooks/pre-push` calls this script inside its existing
`CODE_TOUCHING_REGEX`-gated per-ref block (reuses the already-computed diff, same doc-only-push fast-skip
path, only invoked when that ref's diff was computed successfully AND matched `CODE_TOUCHING_REGEX`);
(b) SECONDARY/backstop — the `rebuild-raw-verify-hook` job in `.github/workflows/ci.yml`, running the same
script against `${{ github.event.before }}..${{ github.sha }}` with `fetch-depth: 0` (needs full history to
resolve `github.event.before` — every other job in this pipeline uses the default shallow checkout), catching
any push where the local hook was bypassed. EXPLICITLY OUT OF SCOPE (deferred, per board-row note): no
change to `PUSH-AUTONOMY-1` §5's PO-mint-task requirement; no board-state-aware check of whether a
`VERIFY-*-REALDATA` task was actually minted (that task is minted "after CI green," temporally outside the
triggering commit range — a heavier, different mechanism than this immediately-checkable textual-attestation
bar). Design brief: `docs/architecture-briefs/2026-07-24-factory-guard-ci-rebuild-raw-verify-hook.md`.
Test: `scripts/audits/rebuild-raw-verify-check.test.sh`.

`/tmp` is allowed ONLY for throwaway run-scoped DATA (payload json, stderr capture, session-id cache) — never for executable logic.

**Maintenance (user directive 2026-06-07):** agents MAY update/upgrade an existing `scripts/` script to work better or optimize (fix bugs, harden, speed up, extend) — improving the shared script beats writing a parallel one-off. Rules: (1) if the script implements a flow spec, edit the spec first, then the script — they MUST stay in sync; (2) smoke-test after the change (clean no-op run at minimum); (3) keep the usage contract (CLI args/env/stdout) backward-compatible or update every caller + flow pointer in the same commit; (4) commit under commit-mutex.

## Code Search — Preferred Tools

| Task | Tool |
|------|------|
| Find how a function/class/API works | `mcp__semble__search` |
| Locate callers, usages, implementations | `mcp__semble__search` |
| Discover related code patterns | `mcp__semble__find_related` |
| Exhaustive literal / regex match | `Grep` |
| Read a specific known file | `Read` |
| Find files by name pattern | `Glob` |

Agents call `mcp__semble__search` and `mcp__semble__find_related` directly — no CLI command, no sub-agent spawn. Full decision table (when Semble vs Grep/Glob/Read) → `.claude/skills/semble-search/SKILL.md`.

---

## DDD Layer Rules

| Building | Layer | Folder |
|----------|-------|--------|
| Business rule / pure calculation | **domain** | `apps/mcp-server/src/domain/services/` |
| Data model / entity | **domain** | `apps/mcp-server/src/domain/models/` |
| Repository interface (port) | **domain** | `apps/mcp-server/src/domain/repositories/` |
| SQLite or LanceDB access | **infrastructure** | `apps/mcp-server/src/infrastructure/db/` or `rag/` |
| HTTP scraper / fetcher | **infrastructure** | `apps/mcp-server/src/infrastructure/fetchers/` |
| Orchestrating multiple services | **application** | `apps/mcp-server/src/application/usecases/` |
| MCP tool handler | **interface** | `apps/mcp-server/src/interface/mcp/tools/` |
| Cron job | **interface** | `apps/mcp-server/src/interface/scheduler/` |

**Golden rule**: `domain/` has ZERO imports from `infrastructure/`.

## Coding Standards

```typescript
// Runtime config: always Bun.env, never process.env
const port = Bun.env.PORT ?? "3000";

// Import paths: always .js extension (ESM compatibility)
import { embed } from "../infrastructure/rag/embeddings.js";

// No any — use unknown + type narrowing

// MCP tools: ALWAYS return this exact format
return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };

// All financial numbers: million VND (document in JSDoc)

// Fetchers: ALWAYS use browser User-Agent (Vietnamese sites block bots with 503)
// Fetchers: multi-tier fallback pattern (see hose.ts as reference)
// Fetchers: VnDirect stock_prices works for ALL exchanges (HOSE, HNX, UPCOM)

// Sector context: use sectorPeers.ts for 16 sectors including 'automotive'

// Telegram alerts: plain text, Vietnamese format, no Markdown
```

## Test File Template

```typescript
// apps/mcp-server/src/__tests__/NNN-task-name.test.ts
// Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload (Bun.env)
import { describe, it, expect } from "bun:test";

describe("Task NNN — Title", () => {
  it("does the expected thing", () => {
    // ...
    expect(result).toBe(expected);
  });

  it("handles edge case", () => {
    // empty input, Vietnamese negatives, missing fields
  });
});
```

## Parallel Agent Dispatch

| Scenario | Dispatch | `isolation` param |
|----------|----------|-------------------|
| Tasks with disjoint file scopes | parallel | `isolation: "worktree"` REQUIRED |
| Tasks touching shared SSOT files | sequential | omit `isolation` |
| Sequential (default / anti-c37) | sequential | omit `isolation` |

**Shared SSOT files that hard-trigger sequential dispatch:** `docs/data/orch/orch-state.json`, `docs/data/project-stats.json`, any agent `.md` file.

Sequential dispatch remains the DEFAULT until c44 verification passes (see Phase 3 roadmap).

Source: `docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md`

---

## Branch Hygiene (after QA merge)

After merge to main, verify:
1. `git branch --show-current` = `main`
2. `git status --short` = empty
3. Delete task branch: `git branch -d task/NNN-*` + `git push origin --delete task/NNN-*`
4. Remove worktrees: `git worktree remove --force .claude/worktrees/<name>`
4a. If changed files include `vps-scripts/**` or `deploy-vinahost.sh`, run
    `./scripts/maybe-deploy-vps.sh` before deleting the task branch.
5. Drop stashes from merged branch

Full reference → `.claude/WORKFLOW.md#branch-hygiene-checklist`

## Commit Format

Full spec → `docs/policies/commit-convention.md` (type vocabulary, scope, task-id, trailers, worked example, no-sprint rule).

Shell mechanism — always use the heredoc pattern:

```bash
git commit -m "$(cat <<'EOF'
<type>(<sprint>/<area>): <task-id> <one-line title>

<optional body>

Sprint: <sprint>
Task: <task-id>
AC: <terse criterion 1> / <terse criterion 2>
EOF
)"
```

## Push Policy — Autonomous Push Gate

**CANONICAL: PUSH-AUTONOMY-1 (user directive 2026-07-14).** Supersedes any "push only when user asks" / user-gated-push stance — that rule was never written; do NOT resurrect it. Never freeze the pipeline or `head` on "awaiting user push".

1. **Push is autonomous.** `git push origin main` requires NO user authorization when the gate below is green.
2. **Gate — 100% tests green, RAW:**
   - supervised cascade complete for the head task (dev commit + QA APPROVE + PO sign-off, each RAW-verified), and
   - targeted/merge-gate suite: 0 fail — assertions may not be skipped or deleted to reach green, and
   - pre-push hook (`pnpm --filter vn-market check`) green — never bypass with `--no-verify` / `PRE_PUSH_SKIP_TSC=1`.

**CANONICAL reading (pinned 2026-07-22, qa — `BLOCK-PUSH-CRON-AUDIT-BATCH-NO-QA`):** "targeted/merge-gate suite: 0 fail" means the suite scoped to the touched surface (+ a base-vs-head A/B on the highest-risk cluster when in doubt), NOT the repo-wide `bun test` run. `apps/mcp-server` carries a standing, tracked, order-dependent full-suite red (`FIX-MCP-SUITE-HEALTH-BASELINE`, drifted 40→42) that makes a literal full-suite "0 fail" reading permanently unsatisfiable — do not re-litigate that baseline inside a push decision; verify zero NET NEW failures (base vs head A/B) instead.
3. **Executor + serialization:** the session holding the chain mutex (dev-team tick) pushes; router may push on direct user instruction. ONE push at a time (fleet-push serialization).
4. **Post-push CI gate:** RAW-verify CI GREEN on the NEW head SHA (`gh run list --branch main`) — gate id `ci_green_on_subsequent_push`.
5. **Post-push REAL-DATA verification task (mandatory):** after CI green, po mints a board task `VERIFY-<task-id>-REALDATA` whose verification gate is a RAW-live probe of the SERVING layer with real data (the live tool/endpoint returns correct values) — test-suite green alone does NOT close the loop. If the change touches serving code, the task's precondition is the single-service rebuild+deploy (`docker compose build <svc> && docker compose up -d --no-deps <svc>`), executed by ops per OVERRIDE 2026-07-03 — no user gate.
   **Mechanized (partial) via `FACTORY-GUARD-CI-RAWVERIFY-IMPL`, see the CANONICAL entry above:** the PO-mint-task requirement itself is unchanged and still NOT mechanically enforced — what IS enforced is the lighter, immediately-checkable bar that a commit adding a `confidence`/`score`/`impact`/`magnitude`/`probability`-named field to a DB-write/route-serving DDD layer carries SOME textual RAW-verify/REALDATA attestation (commit message, decision-journal/task-report entry, or inline `raw-verify-allow:` annotation) before it can land — `scripts/git-hooks/pre-push` blocks locally, `.github/workflows/ci.yml`'s `rebuild-raw-verify-hook` job backstops in CI.
