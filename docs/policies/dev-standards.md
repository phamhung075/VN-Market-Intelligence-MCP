# Developer Standards

<!-- size-justification: 140L — unified developer reference: code search tools, test patterns, DDD rules, TypeScript conventions, naming. All read together at sprint start to set context; splitting into tool-guide + test-patterns + naming-rules fragments the unified "how we code" standard. SCRIPT-PERSIST 2026-06-07: Script Persistence section incl. maintenance clause (+15L, user directive). SYSREMAKE-P2-DEVTEAM-BACKLOG-PICKUP-BOUNDED1 2026-07-04: CANONICAL pointer for the dev-team idle-capacity backlog pickup scripts (+11L). PUSH-AUTONOMY-1 2026-07-14: Autonomous Push Gate section (+16L, user directive — push on 100% green, no user action, post-push real-data verify task). FIX-CMH-OBSOLETE-FILE-CLEANUP 2026-07-20: CANONICAL pointer for scripts/audits/clean-obsolete-files.sh (+8L). BLOCK-PUSH-CRON-AUDIT-BATCH-NO-QA 2026-07-22 (qa): pinned the "targeted/merge-gate suite" reading against the standing FIX-MCP-SUITE-HEALTH-BASELINE full-suite red so it stops being re-litigated per push (+3L). UC-MDH-P3 2026-07-23: CANONICAL pointer for scripts/agents-flow/memory-prune-sweep.sh (+14L). UC-MDH-P4 2026-07-23: CANONICAL pointer for scripts/agents-flow/decision-journal-archive.sh (+15L). UC-GCP-P8 2026-07-23: CANONICAL pointer for scripts/agents-flow/stranded-state-sweep.sh (+13L). TE-T17 2026-07-23: CANONICAL pointer for scripts/agents-flow/notebook-linecap-sweep.sh (+13L). -->

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
-> `sessions`, `scripts/*` -> `scripts`; mtime >24h gate, deletions exempt; `agent-memory/modules/*.json`
excluded — owned by queued SYSREMAKE-P2 RC-GITSTATE), OWNED-ELSEWHERE (silent skip — `docs/signals/**`,
orch-state.json, cowork-schedule.json, coverage-state.json, `agent-memory/modules/**`,
`auditor-*-last-healthy.json`), and UNKNOWN (aggregated, dedup-checked signal to po). Capped at 20 paths
acted on per run. Owning flow: `docs/agents/dev-team/flow/post-cycle.md` § Step 4.3 — the FLOW step
(not the script) performs the `git add`/`git commit` (commit-mutex:main) and the
`.signal_queue.rows[]` write via `.claude/skills/signal-dashboard/SKILL.md`. Test:
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
# Exit 2 = schema/lane-coherence/ref/sprint-goal-status fail. Exit 3 = file-not-found.
# Owning task: SSOT-W1-ZOD-VALIDATOR-CLI; directive: docs/architecture-briefs/SSOT-zod-validation-directive-2026-06-27.md § Step 3
# Acceptance fixture: bun scripts/test-orch-validate-ac.mjs (exercises AC-1..AC-4)
```
Imports schema from apps/mcp-server/src/infrastructure/orchStateSchema.ts (single source of truth — never duplicated).
Stage 0: raw-byte duplicate-key scan (pre-parse). Stage 1: OrchStateSchema.safeParse. Stage 1b: lane coherence
(HARD FAIL — flipped from warn-only by D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING once SHG migration drove live
coherence to 0; process.exit(2) on any violation). Stage 1c: ref integrity (hard fail on dangling detail_ref /
payload_ref). Stage 1d: sprint_goal terminal-status canonicalization (hard fail).

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
# Override stub field set (comma-separated; default includes detail_ref):
STUB_FIELDS="id,title,priority,size,type,zone,status,sprint,detail_ref" bash scripts/orch-backlog-stub.sh --dry-run
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
  -f scripts/devteam-backlog-promote-bounded1.jq \
  docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# 2. Claim (ready[] -> in_progress[] + .head, no-op if nothing bounded-1-stamped waiting):
jq --arg now "$NOW" -f scripts/devteam-backlog-claim-bounded1.jq \
  docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
```
Owning flow doc: `docs/agents/dev-team/flow/main.md` § Idle-capacity backlog pickup (BOUNDED-1), Step 0b head-idle fall-through, before Step 1 PO triage. BOUNDED-1 gate: WIP (`ready[].length + in_progress[].length`) must be `< 1` — this lane is capped at ONE task in flight (user-gated 2026-07-04, distinct from the WIP≤2 human/router-supervised budget). Both scripts are idempotent no-ops outside their gate condition; neither has a hardcoded task ID; both write ONLY through `orch-apply.sh`. **supervised gate (FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE, 2026-07-09):** `effective_supervised` rows are NEVER auto-promoted — true if EITHER inline `.supervised` on the board row OR `backlog-detail.json` `.items[<id>].supervised` (detail-authoritative, no `.detail_ref` precondition) is true; absent/null in both = promotable. Closes the 2026-07-09T15:48Z near-miss where the old board-row-only check silently treated every detail_ref'd supervised row as unsupervised. Test: `scripts/test-devteam-bounded1-supervised-flag.sh`. **depends_on gate (FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE, 2026-07-08):** promote only picks rows whose effective `depends_on` (inline, or looked up in `backlog-detail.json` for `detail_ref`'d rows) are ALL `DONE_VERIFIED` in some `task_board` lane; a dep resolving nowhere is conservative-skipped. Filter runs during candidate ranking, not just on the final pick — a blocked top-ranked row never starves an eligible lower-ranked one. Test: `scripts/test-devteam-bounded1-depends-on.sh`. **epic-wrapper gate (FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE, 2026-07-10):** rows carrying a non-empty `children[]` (decomposition containers, e.g. `mode=audit-epic`/multi-child SPIKEs — not directly-dispatchable atomic tasks) are NEVER auto-promoted, regardless of `supervised` — `effective_children` mirrors `effective_supervised`'s precedence exactly (EITHER inline `.children` on the board row OR `backlog-detail.json` `.items[<id>].children` is non-empty, no `.detail_ref` precondition). Closes the 2026-07-09T23:17Z near-miss (AUDIT-FETCH-COMPLETE auto-claimed, point-fixed by hand) plus the structurally identical exposed row FACTORY-GUARD-CI-REGRESSION-SPIKE (`supervised:null` everywhere — the supervised gate alone could not have caught it). Test: `scripts/test-devteam-bounded1-epic-wrapper.sh`.

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
