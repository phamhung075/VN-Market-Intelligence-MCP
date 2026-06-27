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

**commit-sha:** (populated post-commit below)

---

<!-- commit SHA appended after git commit -->
