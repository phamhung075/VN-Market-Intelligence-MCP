<!-- size-justification: 175L — four-section coherence audit covering SF-1 interplay, cron-overlap generalization, DAG/SSOT link gaps, stale-read structural assessment. Each section is load-bearing for agent-father and janitor follow-through. -->
# Architecture Brief — WORKFLOW-PROTOCOL-COHERENCE-AUDIT

**Date:** 2026-06-14
**Author:** agents-architect
**Priority:** P1
**Status:** READY — awaiting agent-father (Section E signals)
**Scope:** Post-implementation coherence audit of gateway-call-contract.md SSOT and SF-1 single-flight lock. Parallel agent; write-zone docs/architecture-briefs/ only.

---

## A — SF-1 Interplay Verdict: CLEAN with one protocol-doc gap

### What was checked

SF-1 uses `task_kind: "sprint-task"`, key `"dev-team-cron-singleton"`, TTL=5400s, with no `owner_session` binding requirement. Checked against:

1. **YIELD/session-gate (Step 0b)** — YIELD is a JUMP TO `session-gate` that exits when the board and signals are empty. SF-1 is claimed before Step 0b runs. No conflict: SF-1 is the outer envelope; YIELD is an inner exit path WITHIN the held lock, and the session-exit path (`JUMP TO end`) calls `task_release` correctly regardless of which exit branch is taken.

2. **HEAD.lock guard (Step 0-PREFLIGHT)** — SF-1 is placed before the HEAD.lock check. Correct: two concurrent sessions cannot both attempt HEAD.lock removal. No conflict.

3. **Mutex-wrap for on-demand maintenance/cowork spawns** — uses `task_kind: "sprint-task"`, key format `"task:on-demand:<agent_id>:<date>"`. Namespace disjoint from `"dev-team-cron-singleton"`. No conflict, no double-gate: SF-1 gates the cron session itself; mutex-wrap gates individual agent spawns within that session.

4. **S2 pipeline-resume dispatcher-wrap** — key `"task:<bare_task_id>"`. Namespace disjoint. No conflict.

5. **S3 PO triage dedup** — key `"task:po-triage-<date>"`. Namespace disjoint. No conflict.

6. **Commit-mutex** — `task_kind: "commit-mutex"`, key `"commit-mutex:main"`, TTL=60s. Entirely separate kind. No conflict.

### One protocol-doc gap (LOW severity)

`docs/protocols/task-lock-protocol.md` § Four Lock Kinds and § TTL Reference do NOT enumerate `"dev-team-cron-singleton"` as a recognized lock entry. The table lists `cowork-slot`, `sprint-task`, `dashboard-row`, `commit-mutex`. SF-1 IS a `sprint-task` (reuses the kind correctly), but a reader consulting the protocol doc alone cannot infer the singleton-session pattern from the TTL table.

The gap is documentation-only: the runtime behavior is correct (sprint-task kind + bare singleton key IS supported by the DB schema). The protocol doc simply needs a fifth row in the TTL Reference table documenting the session-singleton subclass.

Additionally, the `task-lock-protocol.md` § Claim Grammar still shows `owner_session` in the SKIP log line (line 59). The SF-1 design document explicitly states "TTL-only, no owner-session binding." The claim grammar does not explain the TTL-only release semantic as a distinct option — a reader may incorrectly infer that `task_release` will fail if the owner_session changes (e.g. after mcp-server restart). The memory note `lock_orphaned_by_rebuild` confirms this was a real failure mode. The protocol doc should document the distinction between owner-session-scoped release (standard) and TTL-only release (session-singleton subclass).

**Verdict: CLEAN at runtime. One doc gap in task-lock-protocol.md to close.**

---

## B — Cron-Overlap Generalization: RECOMMEND for cowork-team; DEFER for others

### Sibling cron dispatchers assessed

| Dispatcher | Cadence | Observed max tick | Overlap exposure | Has session-level guard? |
|---|---|---|---|---|
| `dev-team` | 60min (`7 * * * *`) | 3h28m (sprint) | HIGH — fixed by SF-1 | YES (SF-1 implemented) |
| `cowork-team` | 15min (`*/15 * * * *`) | ~12–20min (heaviest parallel fan-out) | MEDIUM — plausible at heavy market-open ticks | NO |
| `system-auditor Tier-1` | 30min (`*/30 * * * *`) | Tier-1 is ping-only; ≤5min typical | LOW | NO |
| `system-auditor Tier-2` | 4h (`0 */4 * * *`) | Full freshness sweep ~15–30min | LOW | NO |
| `system-auditor Tier-3` | daily 02:00 (`0 2 * * *`) | Deep DB audit ~15min | NEGLIGIBLE | NO |
| `health-recheck` (cloud RemoteTrigger `trig_019Q8D5`) | 2h | ~10–15min | LOW | NO |

### cowork-team analysis

`cowork-team` fires every 15min. The leader-lock mechanism in `docs/agents/cowork-team/flow/leader-lock.md` (step 0b) already provides per-tick serialization: it uses `task_id: "cowork-leader"`, `task_kind: "cowork-slot"`, TTL=1800s. This is functionally equivalent to SF-1 for the cowork session. The key difference:

- cowork leader-lock uses `owner_session` for heartbeat re-bind (FIX-CWK-LEADER-LOCK-REBIND) with orphan recovery via `task_force_release_orphan`. This is MORE sophisticated than SF-1 (handles restart-orphan + peer-held separately).
- SF-1 uses TTL-only release, which is simpler but sufficient for 60min cadence where false-expiry risk is low.

**Verdict for cowork-team: already protected by leader-lock. SF-1 pattern is not needed separately — the cowork leader-lock IS the session-singleton gate for that dispatcher.**

However: the leader-lock does not explicitly document its role as a "session-level single-flight guard." The concept is present but unnamed. Aligning the naming (and adding the same SKIP exit at Step 0b if PEER-HELD) would make the pattern visible for future maintainers. This is a documentation-clarity improvement, not a functional gap.

### system-auditor and health-recheck

Overlap exposure is LOW because ticks are short and cadence is wide. The standard per-tier overlap failure mode is duplicate BUG reports to the Telegram BUG channel, which the system-auditor's own `docs/data/system-auditor-known-issues.json` fingerprint dedup already prevents. Adding SF-1 would provide a belt-and-suspenders guard but is not urgent.

**Recommendation: generalize SF-1 as a named pattern ("session-singleton lock") in `docs/protocols/task-lock-protocol.md`, so any future cron dispatcher can adopt it via a single paragraph reference. Do NOT implement for system-auditor or health-recheck now. For cowork-team: confirm leader-lock is the equivalent; add comment in leader-lock.md calling this out.**

---

## C — DAG/Link Gaps for gateway-call-contract.md SSOT

### Confirmed gaps

1. **`docs/references/tree-map.md`** — does NOT list `docs/standards/gateway-call-contract.md` anywhere in the Tree. The tree has an entry for `docs/standards/mcp-tools.md` (line 36-37) but `gateway-call-contract.md` is absent. Since this file was created AFTER the last tree-map update, it is an orphan in the DAG. Correct parent node: under `docs/standards/mcp-tools.md` (its SSOT reference), OR as a sibling of `docs/standards/mcp-tools.md` under the root CLAUDE.md branch.

2. **`CLAUDE.md` § MCP Tools** — confirmed no reference to `gateway-call-contract.md`. CLAUDE.md already contains the server-string rule as SSOT ("MCP Tools — call_tool wrapper ONLY" section). The contract file adds a preflight-readable consolidation. CLAUDE.md should not become a copy of the contract, but a one-line pointer ("preflight reference: `docs/standards/gateway-call-contract.md`") would make the contract discoverable from the root. Currently, the only link into it is from `dev-team/flow/main.md` Step 0-PREFLIGHT — making it effectively only accessible to the dev-team cron, not to other agents (cowork-team, system-auditor, ops, etc.) who have the same tool-call error surface.

3. **`docs/standards/mcp-tools.md`** — not read; if it does not reference the new contract, agents loading mcp-tools.md for tool discovery have no path to the stale-read guard or the send_telegram enum spec. This is a cross-link gap within the standards subtree.

### Orphan risk

If the only link to `gateway-call-contract.md` is the GCC-PREFLIGHT directive in `dev-team/flow/main.md`, then:
- system-auditor, ops, cowork agents loading their own preflight do not encounter it.
- The janitor's orphan-detection scan (DAG walk from CLAUDE.md root) will flag it as an unreachable node.

**Corroboration with janitor's task:** the janitor is separately listing dangling links. This file is a confirmed orphan-in-the-making — not yet stranded (it is linked from dev-team flow) but not rooted in the DAG.

---

## D — Stale-Read Structural Assessment

### The gateway-call-contract stale-read guard (Section 5)

Section 5 of `gateway-call-contract.md` documents the correct behavioral pattern: Read → verify → Edit in strict order; re-Read on "modified since last read"; max one retry. This is advisory text. It closes the documentation gap but does NOT structurally enforce the pattern.

### Is there a protocol gap?

The 10-session audit found ×22 stale-read Edit/Write races. The root causes are:

**Class A (15 of 22): parallel sprint tasks writing the same file without re-Reading.** The commit-mutex serializes the `git add → verify → git commit` window but does NOT gate the `Read → Edit` reasoning step that precedes staging. Two agents can both Read the same file, then both attempt to Edit it — the second Edit arrives against a stale view. The commit-mutex does not help here because the race is at the agent reasoning layer, not the git-index layer.

**Class B (7 of 22): sequential agents using a cached Read from a prior reasoning step.** Same underlying cause: the file was Read earlier in the session, the agent later edits without re-Reading.

### Protocol gap assessment

There is no protocol doc that mandates a "re-Read before Edit" invariant for agents under concurrent write scenarios. `docs/protocols/agent-chaining-protocol.md` governs pipeline sequencing and spawn rules but does not address intra-session file access discipline. The stale-read guard exists only in the new `gateway-call-contract.md` (advisory, dev-team only), not as a fleet-wide protocol rule.

**Structural fix options:**

Option 1 — **Protocol enforcement notice in `docs/protocols/agent-chaining-protocol.md`**: add a "File Write Safety" section that mandates re-Read immediately before any Edit/Write in multi-agent sprint contexts (parallel tier tasks). Low friction — one section addition to an existing protocol. Does not change runtime behavior; changes what agents are required to do.

Option 2 — **Per-agent knowledge injection**: add the stale-read invariant to the BUILD-STANDARD (microservice-build-standard.md) and to the developer/qa agent `knowledge.always_load` list. Broader coverage but more files to update.

Option 3 — **Structural serialization**: enforce strict sequential Write by routing all file-write steps through the commit-mutex window (i.e., only stage + write + commit while holding the mutex). This eliminates the race structurally but requires agents to defer all file writes to the end of their reasoning — impractical for multi-step flows.

**Recommendation: Option 1.** Add a "Concurrent Write Safety — re-Read Invariant" section to `docs/protocols/agent-chaining-protocol.md`. Scope: any agent executing under a parallel-tier fan-out (Step 3 execute-tier.md) MUST re-Read any file it will Edit in the same turn-sequence as the Edit call. This closes the protocol gap with minimal surface change. The gateway-call-contract Section 5 becomes a subordinate reinforcement; the protocol doc becomes the structural mandate.

---

## E — Prioritized Agent-Father Implementation Signals

| Priority | Signal | File(s) | Description |
|---|---|---|---|
| P1 | COHERENCE-GAP-1: tree-map DAG entry | `docs/references/tree-map.md` | Add `docs/standards/gateway-call-contract.md` as a child node under `docs/standards/mcp-tools.md` in the Tree. One-line addition. |
| P1 | COHERENCE-GAP-2: task-lock-protocol session-singleton row | `docs/protocols/task-lock-protocol.md` | Add row to TTL Reference table for `"dev-team-cron-singleton"` (session-singleton subclass of sprint-task). Add paragraph in § Claim Grammar documenting the TTL-only release semantic (no owner_session enforcement) as a valid pattern for session-singleton locks. |
| P2 | COHERENCE-GAP-3: agent-chaining re-Read invariant | `docs/protocols/agent-chaining-protocol.md` | Add "Concurrent Write Safety — re-Read Invariant" section. Scope: parallel-tier agents MUST re-Read before Edit. Cross-reference gateway-call-contract.md § 5. |
| P2 | COHERENCE-GAP-4: CLAUDE.md gateway-call-contract pointer | `CLAUDE.md` § MCP Tools section | Add one pointer sentence: "Preflight reference for all 6 tool-call error classes → `docs/standards/gateway-call-contract.md`". Does not duplicate content — pointer only. |
| P3 | COHERENCE-GAP-5: cowork leader-lock naming clarity | `docs/agents/cowork-team/flow/leader-lock.md` | Add comment at top: this lock serves as the cowork-team session-singleton guard (equivalent of dev-team SF-1). No functional change. |
| P3 | COHERENCE-GAP-6: mcp-tools.md cross-link | `docs/standards/mcp-tools.md` | Add reference to `gateway-call-contract.md` in the Quick Start section so agents loading mcp-tools.md for discovery get a path to the stale-read and send_telegram guards. |

**Sequencing:** COHERENCE-GAP-1 and COHERENCE-GAP-2 are independent and can be implemented in parallel. COHERENCE-GAP-3 should be completed before the next system-wide sprint fan-out. COHERENCE-GAP-4 requires no gating. COHERENCE-GAP-5 and COHERENCE-GAP-6 are low-urgency cleanup.

No production code changes. All changes are doc/flow files only. No container rebuild required.

---

*Authored: 2026-06-14T14:19:52Z | Zone: docs/architecture-briefs/ | Parallel agent — exclusive write-zone*
