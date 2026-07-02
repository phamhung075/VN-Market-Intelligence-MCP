# TOKEN-ECONOMY-TICK-PREFLIGHT — Handoff

**Sprint:** SPRINT-S · **Zone:** multi (NOT apps/-scoped — see § Zone below) · **Route:** architect (alone) → pm
**Spec SSOT:** `docs/architecture-briefs/2026-07-01-token-economy-tick-preflight.md`

---

## [Architect] Brownfield Findings

### Zone

**No `apps/<service>/` is touched by any of the 3 work units.** All files are in the
orchestration/flow-doc layer: `docs/agents/*/flow/*.md`, `.claude/skills/*/SKILL.md`,
`scripts/agents-flow/*`. Per `.claude/skills/zone-detect/SKILL.md` Tier-2 ("root/scripts/ →
route to `developer` (generic)"), PM should route dev tasks to **`developer`** (generic),
**not** any `dev-<service>` specialist. `ZONE: root (docs/agents + .claude/skills +
scripts/agents-flow) — no apps/<service> touch.`

**BUILD-STANDARD: not-applicable** (bug-fix/perf-refactor, in-zone, no new primitives, no new
microservice) per Standard Detection matrix.

### Verified paths

- `apps/mcp-server/src/interface/mcp/server.ts:465-491` — `/mcp` Streamable-HTTP handler.
  Constructs `new WebStandardStreamableHTTPServerTransport({})` (empty options — **no
  `sessionIdGenerator`**) fresh per request, connects a fresh `McpServer`, handles ONE request,
  closes both. **This is stateless mode** — confirmed live (see below), no `initialize`
  handshake or `Mcp-Session-Id` header required.
- `docs/agents/cowork-team/flow/{main,leader-lock,blind-guard,match-slots,pressure-read,
  pressure-cadence,tick-snapshot,pressure-emit,slot-claim,telemetry}.md` — full current cowork
  tick body (~700L cumulative across 10 files).
- `docs/agents/dev-team/flow/main.md:77-238` — Step 0-PREFLIGHT (START telegram → self-arm
  cron-detect-loop → presence claim → SF-1 claim → fire-election claim → GCC-PREFLIGHT read →
  HEAD.lock/worktree-GC).
- `docs/agents/system-auditor/probe.sh` — **already** the exact deterministic evidence collector
  WU-3 wants (docker ps, health curls, restart count, mem, disk). `docs/agents/system-auditor/
  flow/tier1-probe.md` layers A-01..A-32 verdict rules + the A-20 pdf-extractor 3x in-container
  multi-probe (NOT currently inside `probe.sh` — only inline pseudocode) on top of its output.
- `scripts/agents-flow/{drain-signals,ci-health-probe}.js` — the two existing canonical
  precedent scripts. **Neither calls any MCP tool** (drain-signals touches sqlite3/fs only;
  ci-health-probe shells to `gh`/`git`). There is **no existing precedent** in this repo for a
  script calling an MCP tool — WU-1/WU-2 are the first.
- `scripts/agents-flow/cowork-tick-autosilent.sh` — pre-existing, **zero references** in any
  flow/skill doc (verified `grep -rl` across `docs/` and `.claude/`; `git log` shows only a
  path-move commit). See Risk R5.

### Live-verified mechanics (RAW, tested against the running `mcp-server-1` container, 2026-07-02)

A raw `curl -X POST http://localhost:3000/mcp` JSON-RPC `tools/call` body, **with no prior
`initialize` handshake**, succeeds:
```bash
curl -sS -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<tool>","arguments":{...}}}'
```
Response is **SSE-framed**, not plain JSON:
```
event: message
data: {"result":{"content":[{"type":"text","text":"<JSON-stringified tool result>"}]},"jsonrpc":"2.0","id":1}
```
**Error shape (verified, tested with a deliberately-unknown tool name):**
```
data: {"result":{"content":[{"type":"text","text":"MCP error -32602: Tool nonexistent_tool_xyz not found"}],"isError":true},"jsonrpc":"2.0","id":1}
```
Errors surface as `.result.isError == true` with a **plain-text (non-JSON) string** in
`.result.content[0].text` — **NOT** a JSON-RPC-level `.error` field. HTTP status is 200 in both
success and tool-error cases (only transport-level failures — connection refused, timeout — are
non-200/no-response).

This is the exact mechanism the brief's "Scripts call tools via JSON-RPC curl" line refers to,
now fully specified and proven live — the single highest-value/highest-risk unknown in this
sprint is now closed.

### Reuse patterns

- **`scripts/agents-flow/mcp-call.sh` (NEW, shared)** — one bash helper implementing the above
  contract once (`mcp_call <tool_name> <json_args_via_jq>` → prints `.result.content[0].text` on
  stdout, non-zero exit + stderr on `isError`/transport failure/timeout). Consumed by WU-1 and
  WU-2. **WU-3 does not need it** (see R9). Base URL `${MCP_HTTP_URL:-http://localhost:3000/mcp}`
  with the brief's own stated fallback `https://zenmidi.com/vn-market/mcp` on local connection
  failure. Bash (not Node) — consistent with the existing flow-docs' own bash+jq idiom used
  throughout `leader-lock.md`/`blind-guard.md`/`match-slots.md`; zero new runtime deps.
  DRAIN-INJECTION-SAFE: request bodies built exclusively via `jq -n --arg name --argjson args`
  — tool name is always a static literal at each call site, args always bound via `--argjson`,
  never raw string concatenation.
- **`scripts/agents-flow/cowork-match-slots.js` (reuse unchanged)** — already self-contained:
  when run with no args it internally reads `docs/data/cadence-policy.json` +
  `docs/data/pressure-state.json`, does the `isStale` check, and runs **adaptive-mode** cadence
  evaluation (Steps 4.2/4.4/4.5-equivalent) in the SAME call `match-slots.md` already makes
  today. WU-1's script should invoke it exactly as `match-slots.md` Step 2+3 does today — no
  reimplementation.
- **`docs/agents/system-auditor/probe.sh` (extend, not duplicate)** — fold the A-20 3x
  in-container probe loop (currently only in `tier1-probe.md` inline pseudocode) into `probe.sh`
  itself so it stays the single evidence-collector SSOT; WU-3's new wrapper script layers
  thresholds from `system-map.json .project.infrastructure.docker.host_runtime_set` on top.

### Design decisions

- **Layer:** all 3 deliverables are `scripts/agents-flow/*.sh` (interface/scheduler-adjacent
  tooling, not `apps/` code) — no DDD layer applies; they are operational scripts per
  `docs/policies/dev-standards.md § Script Persistence`.
- **Verdict contract (uniform across all 3 WUs, normalizing brief prose):** every preflight
  script emits ONE compact JSON object on stdout and a matching exit code. WU-1/WU-2 add an
  explicit **`ERROR`** verdict (curl/timeout/malformed-response/non-200) not spelled out in the
  brief's WU-2 section but required by HARD CONSTRAINT #4 uniformly — on `ERROR` the LLM falls
  back to the **original, unabridged inline pseudocode**, which stays in the flow `.md` files
  verbatim (annotated as the fallback path, never deleted). WU-3's fallback is inherent by
  construction (any non-ALL-GREEN already triggers the full subagent, which redoes Tier-1
  from scratch).
- **No script writes `orch-state.json`, ever, by construction** — confirmed for all 3 WUs (see
  R11). Do not add an `orch-apply.sh` wrapper inside the scripts; it is simply never invoked
  from that layer.
- **WU-1 verdict payload must carry FULL objects, not IDs** — `slots[]` needs the complete
  slot object (`slot_id, agent, flow_path, cron, trigger_prompt, guaranteed, policy_id,
  last_fired, due_reason, cadence_minutes`) and `one_shots[]` needs the complete claimed task
  object (`id, team, agent, intent, prompt, deadline_at, zone`) — see R2.
- **WU-3 heartbeat target:** a NEW small dedicated file (e.g.
  `docs/data/auditor-tier1-last-healthy.json`, atomic overwrite) — **not** the shared
  `docs/agent-memory/notebooks/system-auditor.md` (see R10).

### Scan clean: true ✓ (with 11 risk notes below — none block the design, all are decomposition-critical)

---

## Risk Notes (pm: propagate into task ACs; dev: read before writing code)

**R1 (WU-1+WU-2, blocking-design, now RESOLVED):** MCP-from-shell mechanism fully specified and
live-verified above — build it ONCE as `scripts/agents-flow/mcp-call.sh`, do not let dev
reinvent it per script.

**R2 (WU-1, correctness):** `claim_due_scheduled_tasks` is a one-shot atomic `pending→firing`
mutation. The script's verdict JSON must carry the **full** claimed task objects in
`one_shots[]` — re-calling the tool on the WORK-continuation path would find nothing left
(already flipped), orphaning the claimed rows.

**R3 (WU-1, minor):** SILENT-path `emit_pressure_state` uses last-known
`calendar_status`/`pressure_mode`/`last_regime`/`last_volatility_level` from
`docs/data/pressure-state.json` (verified live-populated) rather than a fresh Step-4.2
recompute — acceptable, but needs a safe default (`"unknown"`) for the missing-file/first-run
edge case.

**R4 (WU-1, spec/prose inconsistency caught):** the brief's numbered script-steps (1-8) omit
signal_queue draining, but its flow-doc-update paragraph claims "Steps 0a...collapse."
Reconciled: the script does a **READ-ONLY count** of NEW cowork-addressed signal_queue rows
(for the step-7 SILENT gate condition only). The actual drain + mark `NEW→READ` (via
`orch-apply.sh`) + route-to-Step-5-slot logic **stays inline in `main.md`**, reachable only on
the WORK path — it must NOT be deleted during decomposition.

**R5 (WU-1, dead-code/debt, action recommended):** `scripts/agents-flow/cowork-tick-autosilent.sh`
is pre-existing and **completely unwired** (zero doc references). It implements an incompatible
strategy: no MCP presence/fire-election claim at all (uses a fragile "run the matcher 3x, diff
stdout" heuristic instead of a real mutex), a **raw `git commit -c user.name=... -c
user.email=...`** that bypasses the commit-mutex skill entirely, and it unconditionally
writes+commits a `docs/signals/cowork-team-*.json` file even on true-silent ticks —
contradicting today's canonical `telemetry.md` Step 6.1 rule (SKIP the write when silent AND no
spawns AND no errors). Recommend: **retire (delete) in the same commit** that ships
`cowork-tick-preflight.sh`, per CLAUDE.md "detect then reduce debt, dead code." Flag to pm as an
explicit line item — do not silently leave it dormant.

**R6 (WU-2, correctness-critical, native-tool constraint):** `CronList`/`CronCreate`/
`CronDelete` are Claude Code CLI-native tools — **unreachable from a curl-based script**. The
dev-team PREFLIGHT's self-arm call (`.claude/skills/cron-detect-loop/SKILL.md` re-arm) therefore
**cannot** be folded into `dev-team-tick-preflight.sh`; it must remain an LLM-interpreted step
that runs on **every** tick (RUN and SKIP alike), independent of the SF-1/fire-election verdict
— self-arm's purpose (this session's own crons surviving a restart) is orthogonal to which
session wins a given tick. **Resolution (confirms and justifies the brief's own instruction):**
change the `CronCreate` `prompt:` text itself in `cron-detect-loop/SKILL.md` Job 1 to instruct
self-arm FIRST, then the preflight script, and only conditionally read `main.md` on RUN — this
is the **only** one of the 3 WUs whose CronCreate prompt string must functionally change (WU-1
and WU-3 do not have this constraint).

**R7 (WU-2, lock-semantics precision):** current `main.md` has **two distinct SKIP paths** with
different release obligations: (a) SF-1 claim fails → SKIP telegram, no release (never held it);
(b) SF-1 succeeds but fire-election is lost → release SF-1 (just claimed) then SKIP telegram.
The brief collapses both into one "SKIP" verdict — the script must preserve this internal
distinction or a peer session could be wrongly starved of SF-1. DoD ("byte-identical lock
semantics") already demands this; flagging so it isn't lost in decomposition.

**R8 (WU-2, constraint #4 gap):** brief states RUN/SKIP only for WU-2; constraint #4 requires an
explicit third `ERROR` verdict symmetric to WU-1's DEFER/ERROR handling (see § Design decisions
above). Add to WU-2's AC list explicitly.

**R9 (WU-3, positive/reuse, scope boundary):** `probe.sh` already does everything WU-3 needs;
extend it (A-20 fold-in) rather than duplicate. The ALL-GREEN gate is **pure shell** (docker/
curl/df) — **no MCP call needed**, so `mcp-call.sh` is out of scope for WU-3.
`get_system_status`/`get_cron_health` cross-referencing stays deferred to the subagent-only
failure path, unchanged from today.

**R10 (WU-3, output-boundary conflict):** the brief's "notebook or signals log" phrasing is
ambiguous and the notebook option is unsafe — a bare script writing directly to
`docs/agent-memory/notebooks/system-auditor.md` bypasses the mutex-guarded, single-writer AC-3
settled-write protocol the full subagent uses, risking a race if a live subagent write
interleaves. Resolved: heartbeat → new dedicated file, not the notebook (see § Design
decisions).

**R11 (all 3 WUs, confirms constraint #3 satisfied by construction):** none of the 3 scripts
write `orch-state.json`, directly or otherwise — verified by design walkthrough of every step.
No wrapper needed inside the scripts.

---

## File-level change map (for PM decomposition)

**WU-1 — cowork silent-path** (`scripts/agents-flow/` + `docs/agents/cowork-team/flow/` +
`.claude/skills/cron-cowork-team/SKILL.md`)
- NEW `scripts/agents-flow/mcp-call.sh` (shared with WU-2)
- NEW `scripts/agents-flow/cowork-tick-preflight.sh`
- MODIFIED `docs/agents/cowork-team/flow/main.md` (JUMP-TO table + Steps 0a/0b/0b.3/0c/1-4b)
- ANNOTATE (no functional change expected) `leader-lock.md`, `blind-guard.md`, `match-slots.md`
  — become the ERROR-fallback path, referenced not deleted
- `.claude/skills/cron-cowork-team/SKILL.md` — doc-note only; CronCreate prompt text likely
  unchanged (main.md itself now invokes the script — verify at dev time)
- HOUSEKEEPING: retire `scripts/agents-flow/cowork-tick-autosilent.sh` (R5)
- UNCHANGED (consumed as-is): `cowork-match-slots.js`, `pressure-read.md`, `pressure-cadence.md`,
  `tick-snapshot.md`, `pressure-emit.md`, `slot-claim.md`, `spawn-fanout.md`, `last-fired.md`,
  `telemetry.md`

**WU-2 — dev-team SF-1-first preflight** (`scripts/agents-flow/` + `docs/agents/dev-team/
flow/main.md` + `.claude/skills/cron-detect-loop/SKILL.md`)
- NEW `scripts/agents-flow/dev-team-tick-preflight.sh` (uses `mcp-call.sh`)
- MODIFIED `docs/agents/dev-team/flow/main.md` Step 0-PREFLIGHT (presence+SF-1+fire-election
  inline pseudocode → "run script"; self-arm call relocates out of the main.md read-path per R6;
  GCC-PREFLIGHT read + HEAD.lock/worktree-GC becomes first main.md content reached on RUN; ERROR
  fallback keeps the original inline pseudocode verbatim)
- MODIFIED `.claude/skills/cron-detect-loop/SKILL.md` — Job 1 `CronCreate` `prompt:` text
  **functionally changes** (only WU with this requirement — R6)

**WU-3 — auditor Tier-1 shell healthcheck** (`scripts/agents-flow/` +
`docs/agents/system-auditor/probe.sh` + `.claude/skills/cron-detect-loop/SKILL.md`)
- NEW `scripts/agents-flow/auditor-tier1-probe.sh`
- MODIFIED `docs/agents/system-auditor/probe.sh` (fold in A-20 3x-probe sequence)
- MODIFIED `.claude/skills/cron-detect-loop/SKILL.md` — Job 2 `CronCreate` `prompt:` text
  changes: run shell probe first, spawn subagent only on non-ALL-GREEN
- ANNOTATE (no functional change) `docs/agents/system-auditor/flow/tier1-probe.md` — header
  note pointing to the new shell-first gate
- UNCHANGED: Tier-2, Tier-3 entirely

---

## RETURN

DONE: Technical design complete, brownfield findings + risk notes + file-level change map written to `docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT.md`. Central technical unknown (MCP-from-shell mechanism) closed via live verification against the running mcp-server container.
ZONE: root (docs/agents + .claude/skills + scripts/agents-flow) — no apps/<service> touch; PM routes dev tasks to `developer` (generic), not a dev-<service> specialist.
BUILD-STANDARD: not-applicable (bug-fix/perf-refactor, in-zone, no new primitives, no new microservice)
NEXT: pm | decompose into 3 work-unit tasks (WU-1 cowork, WU-2 dev-team, WU-3 auditor) per the file-level change map above; WU-1/WU-2 share `scripts/agents-flow/mcp-call.sh` — sequence so the shared helper lands first (or as part of WU-1) and WU-2 depends on it; WU-3 is fully independent (no shared-helper dependency, no apps/ touch, safest to parallelize)
HANDOFF: docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT.md
PIPELINE: continue
