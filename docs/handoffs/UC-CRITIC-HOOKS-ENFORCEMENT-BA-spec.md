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

---

## [Architect] Brownfield Findings

- **Zone:** cross-service/ (confirmed via `system-map.json` `.project.zones[] | select(.id=="cross-service")` → `path: scripts/`, `specialist: developer`). Single zone, no split — matches BA's own header.
- **BUILD-STANDARD: not-applicable** — bug-fix/hardening of existing hook infrastructure; `hook-guard.sh` (below) is a shared shell utility, not a new architectural primitive/service.

### Verified paths (read end-to-end this cycle)
- `.claude/settings.local.json:20,40` — `tmux-agent.sh status` / `tmux set-option` — LOW, FR-6 exempt from FR-1/FR-2, FR-3 registration-presence only.
- `.claude/settings.local.json:31` — `orch-state-hook-prewrite.mjs` — **confirmed untouched, FR-5 respected.**
- `.claude/settings.local.json:51,62,71,80` — `branch-hygiene-stop.sh` (Stop) / `notebook-auto-prune.sh` / `context-bloat-backstop.sh` / `orch-state-hook-bash-backstop.sh` (all PostToolUse) — FR-1 targets.
- `.claude/settings.json:9` — graphify `PreToolUse` — LOW, FR-6 exempt (the `|| true` here guards a shell `&&/||` idiom, not a validator; leave untouched).
- `scripts/agents-flow/orch-state-hook-bash-backstop.sh:35-36,45,48-49,60` — ambiguous guards (PROJECT_ROOT fallback, stdin-tmp write, **L48-49 the exact jq/BASH_CMD example BA cited**, validator-missing check).
- `scripts/agents-flow/context-bloat-backstop.sh:48-49,58-62,97,117-120,146-150` — same shape; **L97's `jq` read of `file-size-caps.json` is the highest-value target** — a corrupted SSOT here today falls through as "non-governed path" (silent no-op), the worst instance of this whole defect class because it's an SSOT-corruption event, not a per-call fluke.
- `scripts/agents-flow/notebook-auto-prune.sh:60-61,248-252` — same STDIN/file_path shape. `:306` (`LINE_CAP` from the same caps SSOT) already has a safe fallback (`case ... ''|*[!0-9]*) LINE_CAP=200`) — lower priority, optional, note only (falls back to the documented default rather than mutating on bad input, unlike the other guards which no-op entirely with zero visibility).
- `scripts/agents-flow/branch-hygiene-stop.sh:19,24,30` — **opposite failure polarity**: `git rev-parse`/`git status`/`git worktree list` failures fall through as `""`/`true`, which reads as "clean" — a crash here is silently indistinguishable from "nothing wrong" (backwards from the other 3, same root defect).
- `scripts/agents-flow/orch-state-hook.test.mjs:219-252` — `describe('AC-3 — PostToolUse Bash backstop is non-blocking (always exits 0)')`. None of its 3 cases exercise a crash path (unrelated cmd, orch-mentioning-pass, empty stdin) so none break under this design — but the title's blanket claim goes stale; retitle + extend (NFR-5).
- `scripts/agents-flow/orch-state-hook.test.mjs:325-` `WEDGE-GUARD` describe block — confirms `orch-state-hook-prewrite.mjs`'s fail-**open** design is deliberate (blocking on infra failure would wedge every future Write/Edit). Correctly opposite polarity from this fix's fail-**loud** (non-blocking) design — the two hooks have different platform capabilities (PreToolUse can block; PostToolUse cannot), which is NFR-1's own point, now cross-confirmed against a second file.
- `docs/agents/system-auditor/flow/tier1-probe.md:1-224` — table tops out at **A-32** (Disk); **A-33 confirmed free**, extension point for FR-3. `scripts/emit-audit-signal.sh` (UC-ASL-P2) — blessed, already dedup(`dedup_key`)+telegram+signal-row+dashboard-wired single script — stronger reuse target than hand-rolling a new dedup pattern (FR-4/NFR-2/NFR-4 for free).

### Design decisions

**FR-1 (invocation boundary, 4 scripts only — CRITICAL+HIGH tier):** drop the outer `2>/dev/null || true` entirely from the 4 `.claude/settings.local.json` command strings (lines above). Un-swallows both bash-interpreter-level failures (deleted/chmod'd script → exit 126/127 + stderr) and the script's own exit code. Exit-code convention, uniform across all 4 (NFR-1: none can block an already-done action or an in-progress session in a way this fix should introduce): `0` = clean pass or legitimate no-op (unchanged); `1` = FR-2 discriminator detected a prerequisite crash (non-blocking, stderr visible to the agent). Considered giving `branch-hygiene-stop.sh` (a Stop hook) exit `2` on crash — Claude Code's Stop-hook contract can legitimately delay session end, a capability PostToolUse lacks — but that introduces a NEW blocking behavior this SPIKE never asked for; **not adopted**, flagged as a future option only, not implemented.

**FR-2 (crash discriminator, shared helper — extend not duplicate):** new `scripts/agents-flow/lib/hook-guard.sh`, one function `hg_run <label> <cmd...>` — captures the wrapped command's real stderr + exit code (instead of `2>/dev/null || true` discarding both), prints stdout only on success, else writes `[<label>] PREREQUISITE-FAILURE: exited <n>: <stderr>` to stderr and returns 1. Sourced by all 4 scripts. Applied ONLY at the input-boundary guards listed in Verified Paths above (not retroactively to every `exit 0` in `notebook-auto-prune.sh` — 21 sites total, most are internal prune-loop mechanics already covered by existing `notebook_unparseable_breach`/`notebook_single_section_overage_breach` signals; scoping the retrofit to input-boundary guards matches BA's own example and the SPIKE timebox). Pattern (canonical, `orch-state-hook-bash-backstop.sh:48-49`):
  ```bash
  # BEFORE: BASH_CMD=$(jq -r '...' "$STDIN_TMP" 2>/dev/null || true); [ -z "$BASH_CMD" ] && exit 0
  if ! BASH_CMD=$(hg_run "jq:tool_input.command" jq -r '.tool_input.command // empty' "$STDIN_TMP"); then
    exit 1   # jq itself crashed — NOT the same as "no command field"
  fi
  [ -z "$BASH_CMD" ] && exit 0   # jq succeeded, field genuinely absent — unchanged no-op
  ```
  `branch-hygiene-stop.sh` needs the same wrap but must flip a `problems+=(...)` entry on failure (forces the FAIL branch) rather than `exit 1` directly — its 3 `git` calls feed a report, not an early exit.
  NFR-3 compliance: `hg_run` adds zero NEW subprocess calls vs. today (same commands, stderr now goes to a tempfile instead of `/dev/null`, exit code is checked instead of discarded) — no new `wc -l`/`wc -c` on the hot/no-op path, unchanged.

**FR-3 (liveness backstop → fold into system-auditor, per BA Blockers item 1):** new check **A-33 "Hook Enforcement Liveness"** in `docs/agents/system-auditor/flow/tier1-probe.md` (Tier-1, cheap). For the 4 load-bearing scripts: (a) `[ -f "$SCRIPT" ]`, (b) `[ -x "$SCRIPT" ]`, (c) `jq` presence-check against `.hooks.<Event>[].hooks[].command` in the owning settings file for the exact matcher/command substring. For the 3 LOW-tier scripts: (c) only, per FR-6. BA's "(d) evidence it fired" is explicitly **descoped** — no fire-log plumbing exists today and building one is new infrastructure, which would violate FR-4 ("reuse existing, don't invent") and NFR-4 (no new dependency stack); (a)+(b)+(c) alone already close the two edge cases BA names in §5 (file deleted/renamed, chmod non-executable). Emit via `scripts/emit-audit-signal.sh --check-id "A-33" --severity WARN --detail-json '{"dedup_key":"hook_enforcement_liveness:<script-basename>", ...}'` — dedup scoped per-script (NFR-2).

**FR-4 (telemetry reuse):** fully satisfied by FR-2 (Claude-Code-native stderr surfacing, zero new channel) + FR-3 (`scripts/emit-audit-signal.sh`, zero new channel/schema/dashboard).

### Test strategy (NFR-5 — architect's call per BA Blockers item 2)
- Extend `orch-state-hook.test.mjs`'s AC-3 block (retitle to reflect exit 0 vs exit 1) + 2 new crash-injection cases (STDIN_TMP write into a read-only `TMPDIR`; jq unavailable via a `PATH` override, mirroring the file's own existing `ORCH_HOOK_BUN_BIN`-style override convention).
- Extend `context-bloat-backstop.test.sh` / `notebook-auto-prune.test.sh` with a malformed-`file-size-caps.json` case → expect exit 1, not silent "non-governed" exit 0.
- **IN SCOPE for this same FIX** (BA's open question, decided): minimal new test scaffolding for `branch-hygiene-stop.sh` and `orch-state-hook-bash-backstop.sh` — both currently zero-coverage AND both receive an FR-1+FR-2 behavior change in this fix (highest-risk combination: untested + changing). `tmux-agent.sh` stays out (LOW tier, FR-6 exempt, no code change here).

### Risk flags
1. `notebook-auto-prune.sh:306` already has a safe hardcoded fallback (`LINE_CAP=200`) on SSOT-read failure — correctly conservative, just silent; optional/non-gating follow-up only.
2. Dropping `2>/dev/null || true` surfaces crash stderr to the CURRENT agent session only (Claude-Code-local) — no Telegram/push path added by FR-1/FR-2, so no spam risk; the only durable/pushed telemetry is FR-3, which already has NFR-2 dedup.
3. Confirmed FR-5 boundary respected end-to-end — zero edits proposed to `orch-state-hook-prewrite.mjs` or its test file.
4. **CRITICAL delivery-mechanism finding (live-verified this cycle, not in BA's spec):** `.claude/settings.local.json` is machine-local and **untracked** — `git check-ignore -v .claude/settings.local.json` → matched by `~/.config/git/ignore:1` (`**/.claude/settings.local.json`); `git ls-files` confirms zero commit surface. Cross-confirmed by a prior developer decision (`sprint-SSOT-INTEGRITY-PERIMETER-developer.md:78`, same fact) and a prior PO decision (`sprint-HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING-po.md` STEP po-S2, 2026-06-30) documenting a related **session-restart ACTIVATION GAP**: Claude Code loads `settings.local.json` into a session's process only at session start, so any FR-1 edit here takes effect for NEW sessions only — already-running sessions keep swallowing until their next natural restart (self-resolving, not a defect, per that precedent — same applies here, no forced-restart action needed). Consequence for delivery: the FR-1 edit to the 4 invocation strings is a **direct live-file edit on this machine, not a git-committed change** — "developer" cannot ship it via a normal commit/PR for that specific file (the 4 target scripts themselves, `hook-guard.sh`, and the `tier1-probe.md` A-33 addition ARE tracked and commit normally). No generator/bootstrap script writes this file today (checked: none exists) — it is hand-maintained with zero tracked source of truth, meaning a future accidental revert/regeneration of `settings.local.json` would silently regress FR-1 with no tracked diff to catch it. **Recommendation (not gating, flagged for developer/PM judgment):** consider a follow-on to have FR-3's A-33 check diff the live invocation strings against a small tracked "expected hook config" snapshot (e.g. `docs/data/hooks-registry.json`) rather than only checking script existence/executable/registration-presence — closes the "someone silently re-added `|| true`" regression class this untracked-file fact newly exposes. Left as a recommendation, not added to this fix's scope (would expand FR-3 beyond BA's tier-ordered table without a new BA/PO scoping pass).
- **Scan clean:** true ✓

→ journal: `docs/agent-memory/decisions/sprint-ULTRACODE-AUDIT-FIXALL-architect.md` [task_id: UC-CRITIC-HOOKS-ENFORCEMENT]

## RETURN (architect)
DONE: Technical blueprint complete — FR-1 (exit-code fidelity, 4 invocation strings), FR-2 (shared `hook-guard.sh` crash discriminator, applied at named input-boundary guards), FR-3 (new A-33 system-auditor check, reuses `emit-audit-signal.sh`), FR-4 (zero new plumbing) fully specified. FR-5 respected (zero touch on `orch-state-hook-prewrite.mjs`). Test scope decided (NFR-5): add coverage for the 2 zero-coverage scripts receiving behavior changes; extend the 2 existing suites; `tmux-agent.sh` out.
ZONE: cross-service/
NEXT: developer — atomic, single-zone, fully specified (no PM decomposition needed).
HANDOFF: docs/handoffs/UC-CRITIC-HOOKS-ENFORCEMENT-BA-spec.md
PIPELINE: continue

---

## [Developer] Implementation Record

**FR-1 (invocation boundary, live-file-only):** dropped `2>/dev/null || true` from exactly the 4 CRITICAL/HIGH invocation strings in `.claude/settings.local.json` (`branch-hygiene-stop.sh`, `notebook-auto-prune.sh`, `context-bloat-backstop.sh`, `orch-state-hook-bash-backstop.sh`). Left `tmux-agent.sh status`, the `tmux set-option` PreToolUse hook, and `orch-state-hook-prewrite.mjs` byte-for-byte untouched. Re-confirmed live: `git check-ignore -v .claude/settings.local.json` still matches — this edit carries no commit surface, as architect flagged; `git status`/`git diff` will never show it.

**FR-2 (shared discriminator):** new `scripts/agents-flow/lib/hook-guard.sh` — `hg_run <label> <cmd...>` (merged stdout+stderr capture, zero new subprocess forks vs. the pre-existing call site — deliberately NOT using a temp file/fd-juggling to keep NFR-3) and `hg_resolve_project_root` (a `command -v git` builtin check discriminates "git binary missing" from "git ran fine, not inside a repo", zero new forks on either branch). Applied at exactly the input-boundary guards architect named per script:
- `orch-state-hook-bash-backstop.sh`: PROJECT_ROOT resolution, `mktemp` for the stdin-capture tmp file, the `cat >` stdin write, the `jq` command-field extraction (canonical pattern), and the validator-missing check (`[ -f "$VALIDATOR" ]` → now a real PREREQUISITE-FAILURE, since ORCHSTATE already exists — this is CRITICAL-tier's core concern, a silently-disabled backstop).
- `context-bloat-backstop.sh`: PROJECT_ROOT resolution, stdin capture (`cat` + `jq` file_path extraction), and the `file-size-caps.json` caps-TSV `jq` read — architect's named "highest-value target" (a corrupted governance SSOT used to fall through as "non-governed path", the worst instance of the defect class). Deliberately did NOT wrap the `wc -l`/`wc -c` measurement calls (lines architect listed as read/considered, not part of the canonical FR-2 pattern, and `wc` is a core-OS utility outside BA's named dependency-removal risk set (`git`/`jq`/`bun` via the whitelisted Homebrew `rm -rf`) — wrapping it added real regression risk (pipefail-sensitive rewrite) to a hot-path/well-tested script for negligible coverage gain; flagged here as a deliberate scope-narrowing, not an oversight.
- `notebook-auto-prune.sh`: PROJECT_ROOT resolution + stdin capture (same shape as context-bloat-backstop.sh). The separate `LINE_CAP`-from-SSOT read (old L306, its own `case ... ''|*[!0-9]*) LINE_CAP=200` fallback) was deliberately left untouched — architect flagged it as already-safe/non-gating, explicitly not part of this fix's scope.
- `branch-hygiene-stop.sh`: opposite polarity per architect's design — the 3 `git` calls (`rev-parse --abbrev-ref HEAD`, `status --porcelain`, `worktree list --porcelain`) now flip a `problems+=(...)` entry AND set a `prereq_crash` flag on failure (rather than an early `exit 1`, since these feed a report); script exits 1 only if `prereq_crash=1`, still exits 0 for a normal "real problems found" report (unchanged).
- Exit convention, uniform across all 4: `0` = clean pass/legit no-op (unchanged), `1` = FR-2 discriminator caught a prerequisite crash.

**Incidental root-cause fix:** while crash-testing `orch-state-hook-bash-backstop.sh`, found its `mktemp` template (`orch-backstop-stdin-XXXXXX.json`) has a suffix AFTER the trailing `X`s — BSD/macOS `mktemp` (unlike GNU) only randomizes `X`s at the very end of the template, so this literally created the SAME non-random filename every invocation; the first-ever run on a given `$TMPDIR` succeeds, then every subsequent run collides with "File exists". This was invisible before (silently swallowed by the very wrapper this task removes) and would have made the CRITICAL backstop non-functional after its very first firing on any given host. Fixed by dropping the `.json` suffix from the template (functionally irrelevant — the file's extension was never read by anything).

**FR-3 (liveness backstop):** new **A-33 "Hook Enforcement Liveness"** section in `docs/agents/system-auditor/flow/tier1-probe.md` (after A-32/Disk, before "MCP System Status") — `check_hook_liveness()` helper checks (a) file exists, (b) executable bit, (c) registered in the owning settings file (`.claude/settings.local.json` for the 4 load-bearing + 2 of the 3 LOW-tier; `.claude/settings.json` for graphify) via a `jq` substring match against `.hooks[][].hooks[]?.command`. Load-bearing hooks get (a)+(b)+(c); the 3 LOW-tier hooks get (c) only, per FR-6. Verified live against the real `.claude/settings.local.json`/`.claude/settings.json` — all 7 currently register clean (empty `reasons`); a synthetic missing-script case correctly returns `missing:...` + `not-registered:...`. Emits via `scripts/emit-audit-signal.sh` on WARN (load-bearing only), dedup key `hook_enforcement_liveness:<script-basename>` (NFR-2). FR-3(d) ("evidence it fired") explicitly descoped per architect — no new plumbing (FR-4/NFR-4).

**Test scope resolution:** the router-relayed test scope listed "add coverage for orch-state-hook-bash-backstop.sh (currently zero test coverage)" AND separately "extend orch-state-hook.test.mjs AC-3" — these are the SAME target (the AC-3 `describe` block in that file already exercises `orch-state-hook-bash-backstop.sh`, as architect's own Verified Paths note independently confirmed/corrected). Resolved as ONE action: retitled + extended AC-3 (2 new crash-injection cases: `jq` unavailable via `PATH` override, unwritable `TMPDIR`), rather than also minting a redundant parallel test file for the same script.

- `scripts/agents-flow/orch-state-hook.test.mjs`: AC-3 retitled ("exit 0 on pass/no-op, exit 1 on a prerequisite crash"), 2 new crash cases — **21/21 pass** (19 pre-existing + 2 new).
- `scripts/agents-flow/context-bloat-backstop.test.sh`: +T5 (corrupted `file-size-caps.json` → exit 1) — **5/5 pass**.
- `scripts/agents-flow/notebook-auto-prune.test.sh`: +T8 (`jq` missing via `PATH` override → exit 1) — **8/8 pass**.
- `scripts/agents-flow/branch-hygiene-stop.test.sh` (NEW — first-ever coverage): T1 clean/main/no-warning, T2 non-main branch, T3 dirty tree, T4 git-binary-missing crash (opposite polarity, exit 1) — **4/4 pass**. Isolated via a copied fixture repo (this hook resolves its own root via `$0`, not `git rev-parse`, so PROJECT_ROOT env overrides don't apply here the way they do for the other 3 scripts).

**Files modified:** `.claude/settings.local.json` (live-only, untracked — no diff), `scripts/agents-flow/lib/hook-guard.sh` (NEW), `scripts/agents-flow/orch-state-hook-bash-backstop.sh`, `scripts/agents-flow/context-bloat-backstop.sh`, `scripts/agents-flow/notebook-auto-prune.sh`, `scripts/agents-flow/branch-hygiene-stop.sh`, `scripts/agents-flow/orch-state-hook.test.mjs`, `scripts/agents-flow/context-bloat-backstop.test.sh`, `scripts/agents-flow/notebook-auto-prune.test.sh`, `scripts/agents-flow/branch-hygiene-stop.test.sh` (NEW), `docs/agents/system-auditor/flow/tier1-probe.md`, `docs/policies/dev-standards.md`, `docs/WORK.md`.

**Tests written:** 2 new + AC-3 retitle (`orch-state-hook.test.mjs`), T5 (`context-bloat-backstop.test.sh`), T8 (`notebook-auto-prune.test.sh`), 4 new (`branch-hygiene-stop.test.sh`) — all GREEN, no regressions (19→21, 4→5, 7→8, 0→4).

**tsc status:** N/A — zone is `cross-service/` (pure bash/md/json), no `apps/` TS/Go source touched.

**Full suite:** all touched/extended shell + `bun:test` files re-run directly and confirmed green (see counts above); no unified cross-repo shell-test runner exists to invoke as a single command (confirmed — each `*.test.sh` is run standalone, matching this file's own precedent for prior `cross-service/` FIX rows).

**Docs updated:** `docs/agents/system-auditor/flow/tier1-probe.md` (new A-33 section), `docs/policies/dev-standards.md` (exit-code line for the orch-state hook gate, +T5 note on the context-bloat regression-test block, new CANONICAL block for `hook-guard.sh`), `docs/WORK.md` (one-liner).

**Graphify:** skipped — no Skill-tool path available to this spawned agent (matches prior developer sessions' documented structural constraint, e.g. `FIX-DEVTEAM-REVIEW-LANE-SECONDARY-DRAIN`'s WORK.md entry).

**Simplicity gate:** PASS — Q1 scope clean (no config knob/flag beyond what FR-1/FR-2/FR-3 require), Q2 no single-use abstractions (`hg_run` has 4 call-sites across 4 scripts, `hg_resolve_project_root` has 3), Q3 senior-test clean, Q4 ratio <50% overhead (scope narrowed twice — `wc` calls, `notebook-auto-prune.sh` LINE_CAP read — rather than expanded to "be thorough", reasons recorded above).

→ journal: `docs/agent-memory/decisions/sprint-UC-CRITIC-HOOKS-ENFORCEMENT-developer.md` [task_id: UC-CRITIC-HOOKS-ENFORCEMENT]

## RETURN (developer)
DONE: FR-1 (live-only `.claude/settings.local.json` edit, 4 invocations), FR-2 (`hook-guard.sh` + 4 scripts, scoped to named input-boundary guards, 1 incidental BSD-mktemp bug fixed), FR-3 (A-33 in `tier1-probe.md`, reuses `emit-audit-signal.sh`) all implemented. FR-4 satisfied by reuse. FR-5 respected — zero edits to `orch-state-hook-prewrite.mjs`, confirmed. Tests: 21/21 + 5/5 + 8/8 + 4/4 (new file) all GREEN, no regressions.
ZONE: cross-service/
NEXT: qa — verify-committed mode (this task has no dedicated branch; changes are on `main` per repo convention). Flag for QA: `.claude/settings.local.json`'s FR-1 edit will NOT appear in `git diff` — verify it directly on disk, not via git.
HANDOFF: docs/handoffs/UC-CRITIC-HOOKS-ENFORCEMENT-BA-spec.md
PIPELINE: continue
