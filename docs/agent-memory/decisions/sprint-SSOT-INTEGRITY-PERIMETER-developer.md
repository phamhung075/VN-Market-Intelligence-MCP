# Decision Journal — Sprint SSOT-INTEGRITY-PERIMETER · developer

**Sprint goal:** Close SSOT integrity perimeter — Zod schema + dual-point enforcement + auto-fix errors
**Agent:** developer
**Started:** 2026-06-27T00:00:00Z

---

### STEP developer-S1 · developer · 2026-06-27

**task-id:** SSOT-W1-HOOK-ENFORCE

**what-done:**
- Wired PreToolUse Write|Edit validator hook + PostToolUse Bash backstop into `.claude/settings.local.json`
- Created `scripts/agents-flow/orch-state-hook-prewrite.mjs` (bun): intercepts Write|Edit on orch-state.json, validates proposed content against canonical Zod validator before write lands; outputs `{"decision":"block","reason":"..."}` + exits 2 on schema failure
- Created `scripts/agents-flow/orch-state-hook-bash-backstop.sh` (bash): fires after any Bash call mentioning orch paths; re-validates live orch-state.json; outputs structured warning on failure (non-blocking: exits 0, Claude sees feedback)
- Added CANONICAL pointer to `docs/policies/dev-standards.md` § Script Persistence
- Proven-blocks test confirmed (7 cases, see below)
- Commit: (see git SHA below)

**validator-wired:** `bun scripts/orch-validate.mjs` (SSOT-W1-ZOD-VALIDATOR-CLI canonical)
- Same binary for both hooks — no second schema, no duplication
- `orch-state-hook-prewrite.mjs` uses `spawnSync('bun', [VALIDATOR_PATH, PROPOSAL_TMP])` with temp file of proposed content
- `orch-state-hook-bash-backstop.sh` uses `bun "$VALIDATOR" "$ORCHSTATE"` against live file post-Bash

**what-considered:**
1. Use `bash scripts/orch-state-validate.sh` for the hook instead of bun Zod validator
   - Rejected: `orch-state-validate.sh` only runs G-1..G-6 jq checks; the Zod validator (SSOT-W1-ZOD-VALIDATOR-CLI) is the canonical single-source-of-truth schema check per directive. Both canonical scripts exist but the task requires calling the Zod validator.
2. Write hook as a bash script (not bun .mjs)
   - Rejected for PreToolUse: Edit tool requires applying string replacement to current file content then validating the result. Python3 heredoc in bash is fragile for large JSON. Bun gives clean ESM imports + proper JSON handling with no escaping issues.
3. Run Bash backstop on every Bash call regardless of command content
   - Rejected: `bun` startup adds ~100-200ms latency; running on every Bash call accumulates to noticeable drag. Filter by command content (grep for `orch-state|docs/data/orch|orch_state`) catches all direct mutation patterns at near-zero cost for non-matching calls.
4. Make PostToolUse Bash backstop blocking (exit non-zero on failure)
   - Rejected: PostToolUse cannot undo a completed action; non-zero exit would just surface as error noise without rollback. Correct behavior: always exit 0, surface clear warning to stdout (Claude sees it as feedback and takes corrective action).
5. Write to `.claude/tmp/` for temp files in prewrite hook
   - Chosen: keeps temp files inside the project boundary (not /tmp system-wide), matching the scratchpad discipline. mkdirSync with `{ recursive: true }` ensures the dir exists.

**proven-blocks evidence:**

| Test | Tool | Content | Expected | Result |
|------|------|---------|----------|--------|
| T1 | Write | Live valid orch-state.json | exit 0, allow | exit 0, no output ✓ |
| T2 | Write | Missing `.head` entirely | exit 2, block | exit 2, `{"decision":"block",...}` ✓ |
| T3 | Edit | No-op (old=new) on valid file | exit 0, allow | exit 0, no output ✓ |
| T4 | Edit | Replace valid status with `INVALID_STATUS_THAT_DOESNT_EXIST` | exit 2, block | exit 2, `{"decision":"block",...}` ✓ |
| T5 | Bash backstop | `ls -la /tmp` (no orch mention) | exit 0, silent | exit 0, no output ✓ |
| T6 | Bash backstop | `jq .head docs/data/orch/orch-state.json` (orch mention, file valid) | exit 0, silent | exit 0, no output ✓ |
| T7 | Bash backstop | orch command + file temporarily corrupted (invalid JSON) | exit 0, warning | exit 0, WARNING output ✓ |

T2 block reason excerpt:
```
{"decision":"block","reason":"[orch-state-hook] BLOCKED: schema validation failed (exit 2):
ORCH-STATE VALIDATION FAILED (3 issues) — fix and retry:
[1] head: expected object, received undefined.
[2] signal_queue._updated_at: expected string, received undefined.
[3] signal_queue._updated_by: expected string, received undefined."}
```

T4 block reason excerpt:
```
{"decision":"block","reason":"[orch-state-hook] BLOCKED: schema validation failed (exit 2):
ORCH-STATE VALIDATION FAILED (1 issue) — fix and retry:
[1] task_board.active_sprints[0].tasks[0].status: \"INVALID_STATUS_THAT_DOESNT_EXIST\" is not a valid status."}
```

**why-decision:** Direct Zod validator reuse (not reimplementation) satisfies the SSOT constraint from memory `project_orchstate_zod_dual_point_validation` — one schema, two enforcement points. bun .mjs for the prewrite hook gives clean async JSON handling; bash for the backstop keeps it simple (jq filter + bun validator call). The fence false-green check (T2, T4, T7) confirms the hooks reject genuinely invalid content and are not silent no-ops.

**why-change:** No divergence from task spec. Implementation matched directive §Point-1 (pre-write block) + §Point-2 (post-bash backstop) exactly. No TS changes needed in apps/mcp-server/src (SSOT-W1-SERVER-ENFORCE already wired by dev-mcp-server).

**commit-sha:** `14d88c23`

Files in commit:
- `scripts/agents-flow/orch-state-hook-prewrite.mjs` (new — PreToolUse bun hook)
- `scripts/agents-flow/orch-state-hook-bash-backstop.sh` (new — PostToolUse bash backstop)
- `docs/policies/dev-standards.md` (modified — CANONICAL pointer added)
- `docs/agent-memory/decisions/sprint-SSOT-INTEGRITY-PERIMETER-developer.md` (this DJ entry)

Note: `.claude/settings.local.json` carries the hook wiring but is gitignored (machine-local);
it persists on disk and is active for the current session.

---

### STEP developer-S2 · developer · 2026-06-27

**task-id:** SSOT-W1-ORCH-APPLY-WRAPPER

**what-done:**
- Created `scripts/orch-apply.sh`: single gated write path for `docs/data/orch/orch-state.json`
  - Reads candidate JSON from stdin; writes to sibling temp file (same filesystem — POSIX atomic rename)
  - CAS-mtime guard: capture mtime at startup, re-check before rename; mismatch → exit 2 (caller retries)
  - Validation: `bun scripts/orch-validate.mjs <temp>` — exit 0 = proceed; non-zero = ABORT, live file untouched
  - Atomic rename: `mv "${TMP}" "${LIVE_FILE}"` — exit 0 = success
  - Exit codes: 0=success, 1=validation failed, 2=CAS mismatch, 3=usage error
- Routed ALL hot-file writers through `scripts/orch-apply.sh` (13 call sites across 10 files)
- Added canonical pointer to `docs/policies/dev-standards.md` § Script Persistence
- Grep-0 proof: 0 raw `mv ...orch-state.json` or `> docs/data/orch/orch-state.json` writers remain outside the wrapper

**what-considered:**

1. Capture mtime after reading stdin vs at startup
   - Chosen: capture at startup (before stdin read). The caller's jq already read the live file before the pipe
     started; capturing early closes the race window between caller read and our CAS check.

2. File-argument idiom vs stdin pipe idiom
   - Chosen: stdin pipe (`jq '...' orch-state.json | bash scripts/orch-apply.sh`)
   - Rejected file-arg: forces callers to manage their own temp file externally; duplicates work the wrapper should own.

3. mtime helper — dual stat flavour
   - macOS: `stat -f "%m"`, Linux: `stat -c "%Y"`. Single `get_mtime()` function tries BSD first, falls back to GNU.
   - Rationale: macOS host dev + Linux VPS agents; avoids coreutils install dependency.

4. Grep-0 proof pattern: `> .*orch-state\.json` vs `> docs/data/orch/orch-state\.json`
   - Changed to full-path pattern. The wildcard pattern produced false positives from TypeScript arrow functions
     (`=> p.includes("orch-state.json")`) and Telegram message strings containing `> — see orch-state.json`.
   - Full path `> docs/data/orch/orch-state\.json` is precise and unambiguous.

5. Markdown blockquote lines (fixer.md, qa.md): `>   docs/data/orch/orch-state.json \`
   - Problem: jq continuation line on its own blockquote line matched `> .*orch-state\.json` grep pattern.
   - Fix: merged last jq argument onto same line as pipe symbol (no `\` continuation for that line), so
     `docs/data/orch/orch-state.json` never appears alone on a `> ` prefixed line in those files.

**routed-writers:**
- `scripts/orch-backlog-stub.sh` — `mv "${HOT_TEMP}" "${ORCH_STATE}"` → `cat | bash orch-apply.sh` + CAS retry on exit 2
- `scripts/orch-cold-evict.sh` — same pattern
- `docs/agents/dev-team/flow/main.md` Step 0b WF-1 head-reset
- `docs/agents/developer/flow/main.md` WF-1 STOP-RELEASE
- `docs/agents/fixer/flow/main.md` WF-1 STOP-RELEASE
- `docs/agents/qa/flow/main.md` WF-1 STOP-RELEASE
- `docs/agents/pm/flow/main.md` Step 3c atomic write
- `docs/agents/pm/flow/task-archive.md` Steps 4-5
- `docs/agents/po/flow/sprint-signoff.md` approve path
- `docs/protocols/fail-loud-protocol.md` error boundary
- `.claude/skills/signal-dashboard/dashboard-protocol.md` WRITE path
- `.claude/skills/signal-dashboard/dashboard-protocol.md` READ path (mark NEW→READ)
- `.claude/skills/signal-dashboard/dashboard-protocol.md` PRUNE Option B

**grep-0-proof:**
```
grep -rn "mv.*orch-state\.json\|> docs/data/orch/orch-state\.json" . \
  --include="*.sh" --include="*.md" --include="*.mjs" --include="*.ts" --include="*.js" \
  | grep -v exclusions...
Output: (empty — 0 raw writers)
```

**live-file-validators (all pass):**
- `jq -e '.head'` → status=ready, active_task_id=SSOT-W1-ORCH-APPLY-WRAPPER
- `bun scripts/orch-validate.mjs` → exit 0 (72 coherence warnings, SHG migration, non-blocking)
- `bash scripts/orch-state-validate.sh` → G-1..G-6 all PASS

**why-decision:** Stdin pipe idiom requires minimal call-site change (replace trailing `mv` with `| bash scripts/orch-apply.sh`). CAS at startup closes the race window between caller read and wrapper rename. REUSE orch-validate.mjs as hard-constrained — no duplicated schema logic.

**why-change:** No divergence from task spec. All 13 call sites routed. Grep-0 proof confirmed. DJ-GATE-1 satisfied.

---

### STEP developer-S3 · developer · 2026-06-27

**task-id:** SSOT-W1-BASH-SHIM

**what-done:**
- Demoted `scripts/orch-state-validate.sh` to a 7-line thin shim that exec's `bun scripts/orch-validate.mjs "$@"`
- Updated stale SHIM comment in `scripts/orch-validate.mjs` (line 33-34) to reflect the demote
- Updated `docs/policies/dev-standards.md` CANONICAL block for SHG-1 to document the shim + superset proof
- Negative-path smoke tests on temp copies: G-1 equiv (invalid JSON → exit 2), G-2 equiv (missing .head → exit 2), G-4 equiv (null sprint id → exit 2), G-5 equiv (INVALID_STATUS → exit 2) — all non-zero as required
- Both validators exit 0 on live `docs/data/orch/orch-state.json`
- `pnpm check` (bun tsc --noEmit) passes — no TypeScript regressions
- `git status --porcelain docs/data/orch/orch-state.json` = empty (live file untouched throughout)

**superset-proof (G-1..G-5 → orch-validate.mjs):**

| Gate | Former bash check | orch-validate.mjs coverage | Result |
|------|------------------|--------------------------|--------|
| G-1 JSON validity | `jq empty` → exit 1 | Stage 1 `JSON.parse` throws on malformed → exit 2 | COVERED |
| G-2 Structural sentinel (.head/.task_board/.signal_queue) | `jq -e '.head != null and ...'` → exit 2 | OrchStateSchema: all 3 are required fields; null/absent → exit 2 | COVERED |
| G-3 Lane types are arrays | jq type checks on 4 lanes → exit 3 | `Lane = z.array(TaskSchema)`; `z.array(SprintSchema)` for active_sprints; `z.array(SignalRowSchema)` for rows — type mismatch → exit 2 | COVERED |
| G-4 No null sprint IDs | `select(.id == null)` count → exit 4 | `SprintSchema.id: z.string().min(1)` rejects null/absent → exit 2 | COVERED |
| G-5 Status enum | 11-value enum, 3 lanes only → exit 5 | 12-value StatusEnum (READY added — PO ADD-1), ALL 9 task-bearing lanes — STRICTER | COVERED (superset) |
| G-6 Skew warn-only | `head.last_tick/last_tick` diff > 2h → WARN, no exit change | Not carried forward | NOT COVERED but WARN-only → no exit-code impact |

**Note on READY (G-5 enum delta):** former bash G-5 used an 11-value enum without READY. PO ratified READY as 12th valid status (ADD-1, 2026-06-27) in the Zod schema SSOT. Former bash rejection of READY was a stale-enum bug, not a guard to preserve. Demote closes that bug: READY is now accepted where valid, rejected-by-lane in Stage 1b coherence (warn during migration).

**callers-verified:**
1. `scripts/orch-cold-evict.sh:410` — `bash "${REPO_ROOT}/scripts/orch-state-validate.sh" "${HOT_TEMP}"` — passes absolute temp path; shim's exec propagates exit code correctly; verified passes with updated shim.
2. `docs/agents/pm/flow/task-archive.md:110` — procedural bash instruction using absolute `$PROJECT_ROOT` path — caller contract unchanged (checks `|| exit 1`).
3. `docs/agents/dev-team/flow/post-cycle.md:57` — procedural bash instruction using absolute `$PROJECT_ROOT` path — caller contract unchanged.
4. `docs/agents/po/flow/main.md:249` — procedural reference; mentions shim path inline — not a code caller, documentation only.
5. All remaining grep hits are documentation/handoff references — no code callers missed.

**files-changed:**
- `scripts/orch-state-validate.sh` (replaced with 7-line shim)
- `scripts/orch-validate.mjs` (stale SHIM comment updated)
- `docs/policies/dev-standards.md` (CANONICAL SHG-1 block updated with shim note)
- `docs/agent-memory/decisions/sprint-SSOT-INTEGRITY-PERIMETER-developer.md` (this DJ entry)

---

### STEP developer-S4 · developer · 2026-06-27

**task-id:** SSOT-W1-HEAD-METADATA-COLLAPSE

**what-done:**
Retargeted the 3 regressor scripts that still wrote to the deprecated `.task_board.head` field:

1. `scripts/po-fda9-groom-ready.jq` — REMOVED the `.task_board.head = { note: "..." }` write.
   The note was informational-only (no routing fields). The groom metadata is fully captured
   by the task update in `.task_board.backlog`. No `.head` write needed.

2. `scripts/po-vn-macro-tooling-sprint-open.jq` — REMOVED the `.task_board.head = "VN-MACRO-TOOLING sprint opened..."` write.
   This wrote a bare string (not a valid object). The sprint-open is a PLANNING-phase action
   with no head routing dispatch; the sprint container (active_sprints + sprint_goal) is the SSOT.

3. `scripts/po-s107-ohlcv-vnm-garbage-annotate-bump.jq` — RETARGETED `.task_board.head = {...}` to `.head = {...}`.
   This was a real dispatch routing write (status/active_task_id/next_agent) — the correct fix is
   to route it to the canonical top-level `.head` (the field dev-team flow Step-0b, orch-state-access.md §4,
   and router-d1-claim all read). The routing fields are preserved; only the field path changes.

**what-considered:**
1. For po-fda9 and po-vn-macro-tooling: remove vs. migrate the note to `.head`
   - Rejected migration: neither script dispatches a task via the head pointer. A note in `.head`
     without `active_task_id`/`next_agent` is not a routing signal and would be misleading.
     Both scripts' purpose is expressed fully in their task-row mutations alone.
2. For po-s107: remove the write entirely vs. retarget to `.head`
   - Chose retarget: po-s107 explicitly sets `status: "ready"`, `active_task_id`, `next_agent`.
     This IS a dispatch routing signal. Removing it would break the intended router cue.
     Retargeting to `.head` is the correct minimal change — routing semantics preserved, field target corrected.
3. Whether to add a retarget comment vs. silent edit
   - Added brief inline `# RETARGET (SSOT-W1-HEAD-METADATA-COLLAPSE)` comment above each change site.
     This makes the intent auditable for future PO scripts and matches the po-s66/po-s121 precedent
     (those scripts already document why `.task_board.head` must not be written).

**smoke-proof:**
- All three scripts run against temp copy: jq exit 0, valid JSON, `.task_board.head.status = "deprecated"` preserved in all outputs.
- Zod validator (`bun scripts/orch-validate.mjs`) exit 0 on all three script outputs.
- Live SSOT: `git diff HEAD -- docs/data/orch/orch-state.json` = empty (not touched).

**why-decision:** Minimal-blast-radius approach. Two scripts needed no routing signal at all → remove. One script had real routing intent → retarget. The DeprecatedHeadStubSchema in orchStateSchema.ts (TaskBoardSchema.head) now hard-gates re-inflation via `.strict()` — any future write of routing fields to `.task_board.head` would fail Stage 1 validation.

**why-change:** No divergence from task spec. po-s121 note explicitly names these 3 scripts as the re-inflators: `po-vn-macro-tooling-sprint-open.jq / po-fda9-groom-ready.jq / dev-team-router`. The SSOT-W1-HEAD-METADATA-COLLAPSE task scope (script retarget) is satisfied.

**commit-sha:** (see commit below)

**files-changed:**
- `scripts/po-fda9-groom-ready.jq` (removed `.task_board.head` write; added retarget comment)
- `scripts/po-vn-macro-tooling-sprint-open.jq` (removed `.task_board.head` string write; added retarget comment)
- `scripts/po-s107-ohlcv-vnm-garbage-annotate-bump.jq` (retargeted `.task_board.head` → `.head`; added retarget comment)
- `docs/agent-memory/decisions/sprint-SSOT-INTEGRITY-PERIMETER-developer.md` (this DJ entry)
