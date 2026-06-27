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
