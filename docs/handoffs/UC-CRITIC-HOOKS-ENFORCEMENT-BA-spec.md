# BA Spec — UC-CRITIC-HOOKS-ENFORCEMENT

**Task:** UC-CRITIC-HOOKS-ENFORCEMENT · P1 · SPIKE (plan-only, timebox 180min) · zone cross-service/ · sprint ULTRACODE-AUDIT-FIXALL
**BA date:** 2026-08-06
**Verdict carried forward:** CRITIC → PO-ratified 2026-08-05T09:06:11Z → spec complete, zero PO blockers → **NEXT: architect**

---

## 0. Scope binding (from PO ratification — read verbatim before acting)

PO ratification (`.task_board` row field `po_goahead_20260805T090611`) already corrected the audit brief's attribution error and fixed scope. Restated here so architect never has to re-derive it:

- **7 confirmed hook invocations end in `|| true`** (live-reconfirmed this cycle, byte-exact):
  - `.claude/settings.local.json`: `tmux-agent.sh status` (SubagentStart), `tmux set-option ...` (PreToolUse Bash), `branch-hygiene-stop.sh` (Stop), `notebook-auto-prune.sh` (PostToolUse Write|Edit), `context-bloat-backstop.sh` (PostToolUse Write|Edit|NotebookEdit), `orch-state-hook-bash-backstop.sh` (PostToolUse Bash).
  - `.claude/settings.json`: graphify `PreToolUse` (matcher `Glob|Grep`) — `[ -f graphify-out/graph.json ] && echo '...' || true`.
- **`orch-state-hook-prewrite.mjs` (PreToolUse Write|Edit) is OUT OF SCOPE** — re-confirmed live-read this cycle (`.claude/settings.local.json:31`): the command is a bare `bun ".../orch-state-hook-prewrite.mjs"` with no `2>/dev/null`, no `|| true`. It is the one fail-closed hook. **Do not touch it. Any architect design that edits this file is a scope violation.**

---

## 1. Live-code findings that refine the fix design (read before architect scopes work)

Read all 7 target scripts end-to-end this cycle (not just their `|| true` wrapper) to avoid a naive "strip `|| true` everywhere" mis-scope. Two things the wrapper-level framing misses:

1. **The swallowing happens at TWO layers, not one.** Several scripts (`orch-state-hook-bash-backstop.sh`, `context-bloat-backstop.sh`, `notebook-auto-prune.sh`) already capture their *internal* validator's exit code correctly (e.g. `VALIDATE_OUT=$(bun "$VALIDATOR" ... 2>&1) || VALIDATE_EXIT=$?` in `orch-state-hook-bash-backstop.sh:64`) and print a warning when that inner call fails. The actual gap is the **outer** `2>/dev/null || true` appended in `.claude/settings.local.json` itself — that wrapper discards the hook *script's own* exit code (e.g. a missing `bun`/`jq` binary, a `set -u` unbound-variable abort, a permission error before the script reaches its own guards) and converts it to a silent 0 with stderr thrown away. Fixing only the inner validator-call pattern (already partially done) does not close this; the fix must target the invocation string in the settings file(s), not just script internals.
2. **Not all 7 invocations are load-bearing validators.** Three of the seven perform no enforcement/validation function at all:
   - `tmux-agent.sh status` (SubagentStart) — read-only tmux session/window status query, informational only.
   - `tmux set-option ...` (PreToolUse Bash) — cosmetic tmux status-bar text update.
   - graphify `PreToolUse` — conditionally injects an `additionalContext` hint if a graph file exists; the `|| true` here guards the shell `&&`/`||` idiom itself (not a validator's pass/fail), and a failure only means the hint doesn't render.
   A silent failure of any of these three degrades a UI nicety, not a safety/integrity gate. The other four are genuine enforcement mechanisms with no other structural backstop (§3 risk tiers).

---

## 2. Requirements

### FR-1 — Exit-code fidelity at the hook-invocation boundary
**DDD layer: infrastructure** (hook registration config + shell wrapper, not domain logic).
Replace the blanket `2>/dev/null || true` (and the graphify `... || true` idiom) with an invocation form that preserves and surfaces the wrapped script's real exit status to Claude Code, instead of unconditionally collapsing every outcome — crash, permission error, missing dependency, or genuine "nothing to report" — to exit 0 + no output. Per Claude Code's own hook exit-code contract (0 = silent/success, 1 = non-blocking warning surfaced to the user, 2 = blocking + stderr fed back to Claude), architect should pick, per hook-event type, which non-zero code is reachable without violating that event's platform constraint (see NFR-1 — PostToolUse/Stop cannot retroactively block an already-completed action; SubagentStart/PreToolUse can).

### FR-2 — Crash-vs-clean-pass discriminator inside each validator script
**DDD layer: application** (decision logic inside each script — what counts as "nothing to check" vs "a prerequisite broke").
Every one of the four load-bearing scripts (`orch-state-hook-bash-backstop.sh`, `context-bloat-backstop.sh`, `notebook-auto-prune.sh`, `branch-hygiene-stop.sh`) has multiple early `exit 0` guards (e.g. `[ -z "$PROJECT_ROOT" ] && exit 0`, `BASH_CMD=$(jq ... 2>/dev/null || true)` then `[ -z "$BASH_CMD" ] && exit 0`) that currently treat "legitimately nothing to do" (e.g. non-governed file path, empty Bash command field) identically to "a prerequisite command itself failed" (e.g. `jq`/`bun`/`git` missing or erroring). Requirement: distinguish these two cases with a different, detectable outcome — the second case must not silently fall through the same `exit 0` path used by the first.

### FR-3 — Secondary backstop: hook-liveness check independent of any single event
**DDD layer: infrastructure / application.**
Root cause tie-in: this SPIKE's own board row sat `IN_PROGRESS` for ~24h with **zero live task-lock**, discovered only by a manual `task_list_held` audit — i.e. the exact failure class this task exists to close (a broken enforcement mechanism producing zero live signal) already happened one layer up, in the dispatch pipeline, not the hooks. `Bash(*)` allow-all plus per-event-only hooks means a hook script can be deleted, chmod'd non-executable, or have its `settings.local.json` entry removed outright, and nothing will ever fire to say so (no event depends on the hook having fired). Requirement: a periodic, independent-of-any-single-tool-call check that verifies (a) each of the 4 load-bearing hook scripts still exists and is executable, (b) each is still registered in `.claude/settings.local.json`/`.claude/settings.json` under its expected event/matcher, and — where cheaply feasible — (c) evidence that it fired at least once in a window where its trigger condition was met (e.g. `orch-state-hook-bash-backstop.sh` should show recent activity if Bash writes touching `orch-state.json` occurred in that window).

### FR-4 — Durable failure telemetry, reusing existing plumbing
**DDD layer: application / interface.**
When FR-2's discriminator fires or FR-3's liveness check finds a broken/missing hook, the failure must be persisted and surfaced through **existing** channels, not a new bespoke one: `docs/signals/*.json` signal-bus convention + `send_telegram(channel="bug")` with the established dedup discipline (`get_recent_fixes` pre-check, one-open-signal-per-target-max — same pattern `context-bloat-backstop.sh` already implements for its own `context_bloat_breach` signals). Do not invent a new dashboard, log format, or channel for this.

### FR-5 (explicit non-goal) — `orch-state-hook-prewrite.mjs` is out of scope
**DDD layer: N/A (process constraint).**
Already fail-closed (§0). Zero edits to this file are in scope. Any implementation touching it is a scope violation and must bounce to PO.

### FR-6 (recommendation, non-blocking) — Risk-tiered rollout, not uniform treatment of all 7
**DDD layer: application (sequencing/prioritization guidance, not code).**
See §3 for the full tier table. Summary: architect should sequence real fail-loud/backstop work on the 4 load-bearing validators first (they are each the *sole* structural guard for their respective policy), and explicitly **exempt or minimally-treat** the 3 cosmetic/informational invocations (`tmux-agent.sh status`, `tmux set-option`, graphify `PreToolUse`) rather than over-engineering parity across all 7 — matches the standing lesson against fleet-wide gates validated/generalized off a non-representative subset, applied here in the opposite direction (don't force uniform heavy treatment onto invocations with no enforcement function).

---

## 3. Risk tiers (for architect sequencing — not a PO decision, BA recommendation)

| Tier | Hook | Function | Blast radius if it silently fails today |
|---|---|---|---|
| **CRITICAL** | `orch-state-hook-bash-backstop.sh` (PostToolUse Bash) | Re-validates `orch-state.json` (Zod schema) after any Bash write that might have mutated it — the **only** backstop for shell-path writes (`jq ... > orch-state.json`, `mv`, `tee`) that bypass the Write/Edit-tool prewrite gate | Corrupted SSOT hot file goes undetected — this exact file has already been the subject of multiple prior SSOT-corruption incidents (full-doc overwrite, dangling refs) recorded in project memory |
| **HIGH** | `context-bloat-backstop.sh` (PostToolUse Write\|Edit\|NotebookEdit) | Sole detector for governed-file line/byte-cap breaches (feeds `claude-manager-helper`) | Context-bloat governance silently stops functioning fleet-wide |
| **HIGH** | `notebook-auto-prune.sh` (PostToolUse Write\|Edit) | Sole enforcement of the 200L/cap notebook-size discipline | Agent notebooks grow unbounded, degrading every future session's context load |
| **HIGH** | `branch-hygiene-stop.sh` (Stop) | Sole check that a session ends on `main` with a clean tree and no leftover worktrees — production runs `bun --hot` off `main` | A session can exit on a dirty/feature branch undetected; production hot-reload picks up half-merged code (directly matches a known incident class in project memory — subagent branch hijack) |
| **LOW** | `tmux-agent.sh status` (SubagentStart) | Read-only status query, informational | tmux pane shows stale/no status — cosmetic only |
| **LOW** | `tmux set-option ...` (PreToolUse Bash) | Cosmetic status-bar text | Same — cosmetic only |
| **LOW** | graphify `PreToolUse` (`.claude/settings.json`) | Conditionally injects a context hint if a knowledge graph exists | Hint doesn't render; agent falls back to raw file search, no correctness or safety impact |

---

## 4. Non-functional requirements

- **NFR-1 — Respect the platform's blocking-capability boundary.** PostToolUse and Stop-after-action hooks in Claude Code cannot retroactively undo an already-executed tool call. "Fail-loud" for these event types means *guaranteed visible signal* (FR-1/FR-4), not "prevented the action" — an architect design that promises to block a completed Bash write is infeasible and must not be proposed. SubagentStart/PreToolUse hooks (`tmux-agent.sh status`, the PreToolUse Bash tmux hook, graphify) have more headroom here but are Tier LOW (§3) so blocking semantics are not warranted regardless.
- **NFR-2 — Dedup discipline.** New failure signals must follow the same one-open-signal-per-target convention `context-bloat-backstop.sh` already uses, to avoid a BUG-telegram storm firing on every subsequent tool call while a hook stays broken.
- **NFR-3 — No hot-path latency regression.** `context-bloat-backstop.sh` and `notebook-auto-prune.sh` both explicitly document a fast-exit "hot path" contract (no `wc -l`/`wc -c` calls on non-governed paths) to avoid slowing every Write/Edit call. The crash-discriminator (FR-2) must not add subprocess calls on the already-passing/no-op path — it can only change what an *already-failing* prerequisite check does, not add new checks to the success path.
- **NFR-4 — No new dependency stack.** Reuse `jq`/`bun`/`git`, already required by all 7 scripts, for FR-3's liveness check rather than introducing a new tool that itself becomes an unmonitored 8th thing.
- **NFR-5 — Test-file parity gap (flag, not a blocker).** `context-bloat-backstop.sh`, `notebook-auto-prune.sh`, and `orch-state-hook-prewrite.mjs` each already ship a co-located test file (`*.test.sh`/`.test.mjs`) — any exit-code-propagation change should extend these with crash-injection cases (simulate missing `bun`/`jq`, non-zero exits) rather than a parallel suite. **`tmux-agent.sh` and `branch-hygiene-stop.sh` and `orch-state-hook-bash-backstop.sh` currently have zero test coverage** — architect should decide whether minimal test scaffolding for these is in this SPIKE's follow-on FIX scope or a separate ticket (not a PO call — technical scoping).

---

## 5. Edge cases

- **Dependency removal mid-session:** `.claude/settings.local.json` itself whitelists `Bash(rm -rf ~/Library/Caches/Homebrew/*)` as an allowed command — a plausible, in-repo-sanctioned path to removing a hook script's runtime dependency (`bun`, `jq`, `git`, if ever Homebrew-installed) mid-session. FR-2's discriminator must treat "dependency binary not found" as a real, surfaced failure, not a fall-through no-op.
- **Hook file deleted or renamed but still referenced in settings** — currently silent (`2>/dev/null || true` swallows "no such file or directory"). Covered by FR-3(a)/(b).
- **Hook made non-executable (`chmod -x`)** — same silent swallow today. Covered by FR-3(a).
- **False-positive risk from legitimate transient states:** `context-bloat-backstop.sh` and `notebook-auto-prune.sh` both implement a deliberate settle-window re-read (a file mid-write can transiently look over-cap). FR-2's discriminator must not misclassify this documented, intentional transient as a "crash" — it is an existing, already-correct no-op path, not a candidate for new failure signaling. (Mirrors a previously logged false-positive class in project memory — a breach reported against a live in-flight edit.)
- **Concurrent sessions hitting the same hook simultaneously** (two agents editing files at once → two parallel `notebook-auto-prune.sh` invocations) — FR-3/FR-4's dedup must be scoped per target file/hook, not global, so a benign race between two legitimate concurrent runs is never misread as "the hook is broken."
- **VN market-data edge cases:** not applicable. This SPIKE is pure dev-tooling/CI-hook infrastructure with no VN market-data, locale, or BCTC surface — noting explicitly per spec template rather than omitting the section.

---

## 6. Blockers

**None requiring PO.** PO's ratification already resolved the one scope-determining question (which hook is fail-closed vs swallowing). The three items below are technical/sequencing judgment calls for **architect**, not business/priority/VN-term/data-source decisions — listed as non-blocking guidance, not looped back to PO:

1. Whether FR-3's liveness check becomes a new standalone script or is folded into an existing periodic agent's cadence (e.g. `system-auditor`'s existing tier1/tier2/tier3 health-check cycle, which already owns "is X still alive/registered" checks elsewhere in the system) — BA recommends folding into the existing auditor cadence over minting a new cron, per the standing lesson against adding a detector with no clear owning actuator.
2. Whether to also add minimal test scaffolding for the 3 currently-untested scripts (NFR-5) inside this same follow-on FIX, or split it into a separate ticket.
3. Exact non-zero exit code (1 vs 2) chosen per hook-event type for FR-1 — bounded entirely by Claude Code's own hook exit-code semantics (NFR-1), not a product/business call.

---

## 7. Recommended scope for architect (tier-ordered)

| Priority | Target | FR(s) |
|---|---|---|
| 1 (CRITICAL) | `orch-state-hook-bash-backstop.sh` + its `.claude/settings.local.json` invocation | FR-1, FR-2, FR-4 |
| 2 (HIGH) | `context-bloat-backstop.sh` + invocation | FR-1, FR-2, FR-4 |
| 2 (HIGH) | `notebook-auto-prune.sh` + invocation | FR-1, FR-2, FR-4 |
| 2 (HIGH) | `branch-hygiene-stop.sh` + invocation | FR-1, FR-2, FR-4 |
| 3 (cross-cutting) | FR-3 liveness/registration check covering all 4 above (+ optionally the 3 LOW-tier for registration-presence only, not full crash-discriminator treatment) | FR-3 |
| 4 (LOW, optional/exempt) | `tmux-agent.sh status`, `tmux set-option` (PreToolUse Bash), graphify `PreToolUse` | FR-6 (recommend: descope from full redesign, registration-presence check only if bundled with FR-3) |
| — (explicit exclusion) | `orch-state-hook-prewrite.mjs` | FR-5 — do not touch |

No code changes performed by BA (plan-only SPIKE, per `plan_only: true` / `mode: spike` on the board row). No production code, no hook scripts, no settings files edited this cycle.

---

## RETURN
DONE: BA spec complete, requirements + risk-tiered fix scope written, zero PO blockers.
NEXT: architect — technical blueprint for fail-loud exit-code propagation (FR-1/FR-2) + secondary liveness backstop (FR-3/FR-4) across the 4 Tier-CRITICAL/HIGH hook invocations, per fix table above. Do not touch `orch-state-hook-prewrite.mjs` (FR-5).
HANDOFF: docs/handoffs/UC-CRITIC-HOOKS-ENFORCEMENT-BA-spec.md
PIPELINE: continue
