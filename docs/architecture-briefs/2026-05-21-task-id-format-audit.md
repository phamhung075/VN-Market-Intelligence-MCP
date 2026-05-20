# task_id format audit — 16 sites (Sprint 1960c + 1962c)

<!-- size-justification: audit report, read-once by po + agent-father post-1962c -->

**Date:** 2026-05-21
**Auditor:** architect
**Sprint refs:** 1960c (inner self-claim), 1962c (outer dispatcher-wrap)
**Source signals:** `docs/signals/agent-father-1960c-done.json`, `docs/signals/agent-father-1962c-wire-done.json`

---

## Summary

- Sites audited: 16 (9 inner + 7 outer)
- PASS: 11
- WARN: 5
- FAIL: 0
- Auto-fixable: yes (all WARNs are mechanical grammar/coverage fixes)

---

## Per-site table

| # | Site | File:line | task_id template | kind | owner_agent | TTL(s) | C1 | C2 | C3 | C4 | C5 |
|---|------|-----------|-----------------|------|-------------|--------|----|----|----|----|-----|
| I-1 | Inner — PO kickoff claim | `flows/po/sprint-kickoff.md:35` | `"task:" + sprint_id` | sprint-task | po | 3600 | N/A | PASS | N/A | PASS | WARN |
| I-2 | Inner — PO signoff release | `flows/po/sprint-signoff.md:17` | `"task:" + sprint_id` | — | po | — | N/A | N/A | N/A | PASS | WARN |
| I-3 | Inner — PM heartbeat (sprint) | `flows/pm/main.md:90` | `"task:" + sprint_id` | — (hb only) | — | — | N/A | N/A | N/A | PASS | N/A |
| I-4 | Inner — PM heartbeat (task) | `flows/pm/main.md:98` | `"task:" + task_id` | — (hb only) | — | — | N/A | N/A | N/A | PASS | N/A |
| I-5 | Inner — Developer claim | `flows/developer/main.md:47` | `"task:" + task_id` | sprint-task | developer | 3600 | PASS | PASS | PASS | PASS | PASS |
| I-6 | Inner — Microservice-dev claim | `flows/developer/microservice-main.md:46` | `"task:" + task_id` | sprint-task | \<agent-id\> | 3600 | PASS | PASS | PASS | PASS | PASS |
| I-7 | Inner — QA re-claim (stolen-lock path) | `flows/qa/main.md:67` | `task_id` (positional, no `"task:"` prefix in call) | sprint-task | qa | 3600 | WARN | PASS | PASS | WARN | PASS |
| I-8 | Inner — Agent-Father edit-apply claim | `flows/agent-father/edit-apply.md:8` | `"task:" + task_id` | sprint-task | agent-father | 3600 | N/A | PASS | N/A | PASS | PASS |
| I-9 | Inner — Agent-Father main (no claim) | `flows/agent-father/main.md:34-35` | — (sub-flows own locks) | — | — | — | N/A | N/A | N/A | N/A | N/A |
| I-10 | Inner — Drain-signals row claim | `flows/dev-team/drain-signals.md:22` | `"dash:" + section_name + ":" + row.id` | dashboard-row | dev-team | 1800 | N/A | PASS | N/A | PASS | PASS |
| O-S1 | Outer — execute-tier parallel fan-out | `flows/dev-team/execute-tier.md:37` | `"task:" + task_id` | sprint-task | dev-team | 3600 | PASS | PASS | PASS | PASS | PASS |
| O-S2 | Outer — main.md pipeline resume | `flows/dev-team/main.md:127` | `"task:" + bare_task_id` | sprint-task | dev-team | 3600 | PASS | PASS | PASS | PASS | PASS |
| O-S3 | Outer — main.md PO triage guard | `flows/dev-team/main.md:154` | `"task:po-triage-" + date` | sprint-task | dev-team | 1800 | PASS | PASS | PASS | PASS | PASS |
| O-S4 | Outer — main.md UNBLOCK/CLEAN inline | `flows/dev-team/main.md:184-185` | `"task:" + batch_id` (abbreviated positional) | sprint-task | dev-team | 3600 | PASS | PASS | PASS | WARN | PASS |
| O-S5 | Outer — developer.md multi-zone fan-out | `.claude/agents/developer.md:39` | `"task:" + task_id` | sprint-task | developer | 3600 | PASS | PASS | PASS | PASS | PASS |
| O-S6 | Outer — ba.md architect fan-out | `.claude/agents/ba.md:119` | `"task:" + req_id` | sprint-task | ba | 3600 | PASS | PASS | PASS | PASS | PASS |
| O-S7 | Outer — pm.md dev-specialist fan-out | `.claude/agents/pm.md:126` | `"task:" + task_id` | sprint-task | pm | 3600 | PASS | PASS | PASS | PASS | PASS |

**Legend:** N/A = check not applicable for this site type (heartbeat-only, release-only, or no inner self-claim target).

---

## Findings

### FAIL (blocking)

None.

---

### WARN (style / coverage)

**WARN-1 — C5: `flows/po/sprint-kickoff.md:35` — claim with no in-file release path on error**

The PO kickoff flow claims `"task:" + sprint_id` (ttl=3600) at step 4b and immediately returns at step 5 with `NEXT: ba`. There is no try/finally or error path that releases the lock if kickoff fails after the claim succeeds. Release is deferred to `po/sprint-signoff.md` (approve path only). On the reject path in `sprint-signoff.md`, the lock is also NOT explicitly released — it expires by TTL.

Risk level: low (sprint umbrella is intentionally long-lived across many sub-agent cycles; TTL expiry is acceptable). However, the lack of an explicit release on the reject path in `sprint-signoff.md` creates a 3600s window where a re-triggered kickoff would see a false "held" claim.

Recommended fix: add `call_tool(server="vn-market", tool="task_release", ...)` to the Reject path in `sprint-signoff.md`. One-line addition.

---

**WARN-2 — C4: `flows/qa/main.md:67` — abbreviated positional syntax for re-claim**

The stolen-lock recovery path reads:
```
→ call task_claim(task_id, "sprint-task", "qa", 3600)
```
This is positional shorthand, not the canonical MCP meta-syntax `call_tool(server="vn-market", tool="task_claim", arguments={...})`. Two additional issues:
1. `task_id` here is the bare task id variable — the caller must prepend `"task:"` themselves, which the shorthand obscures.
2. The re-claim has no `payload` field, unlike all other claim sites.

This is a prose/documentation shorthand, not a structural break (the comment states "proceed even if claim fails"), but it diverges from the canonical form and increases misreading risk.

Recommended fix: replace with full `call_tool(server="vn-market", tool="task_claim", arguments={ task_id: "task:" + task_id, task_kind: "sprint-task", owner_agent: "qa", ttl_seconds: 3600 })` block.

---

**WARN-3 — C4: `flows/dev-team/drain-signals.md:36` — abbreviated syntax for release**

```
call_tool("task_release", { task_id: row_key })
```
Missing `server="vn-market"` and `tool=` named arguments. The full-form claim at line 21 correctly uses `call_tool(server="vn-market", tool="task_claim", ...)`. The release at line 36 uses abbreviated positional form.

Recommended fix: expand to `call_tool(server="vn-market", tool="task_release", arguments={ task_id: row_key })`.

---

**WARN-4 — C4: `flows/agent-father/edit-apply.md:53,74` — abbreviated syntax for heartbeat and release**

```
call_tool("task_heartbeat", {task_id: "task:" + task_id})   # line 53
call_tool("task_release", {task_id: "task:" + task_id})     # line 74
```
Both use abbreviated positional form without `server="vn-market"` and `tool=` named params. The claim at line 7-12 uses full canonical syntax. The tail operations diverge.

Recommended fix: expand both to full `call_tool(server="vn-market", tool="task_heartbeat", arguments={...})` / `task_release` forms.

---

**WARN-5 — C4: `flows/dev-team/main.md:184-185` — inline table abbreviated syntax for S4**

The planning dispatch table uses inline shorthand:
```
outer_claim=task_claim("task:"+batch_id,"dev-team",ttl=3600)
```
This is inside a markdown table cell (not a fenced code block). The mixed `"task:"+batch_id` string-concat style is consistent with other sites for the prefix, but the positional `task_claim(...)` call omits `call_tool(server=..., tool=..., arguments={...})` wrapper. Since this is a prose table (not executable code), the risk is agent misreading the invocation contract.

Recommended fix: move S4 UNBLOCK/CLEAN dispatch to a fenced code block using the canonical call_tool form, matching S2/S3 style in the same file.

---

### PASS

11 sites pass all applicable checks. Summary:

- **C1 (inner/outer same-task agreement):** All 5 outer-to-inner pairs where the inner flow has a self-claim use the identical `"task:" + task_id` prefix format. S3 outer uses a unique guard key (`task:po-triage-YYYYMMDD`) that is intentionally disjoint from PO's inner sprint_id claim — no conflict. S6 outer (`"task:" + req_id`) spawns architect inner which has no self-claim — gap by design (architect is read-only in this context), C1 not applicable.
- **C2 (kind consistency):** All outer sprint-task sites match their inner counterparts. The single dashboard-row site (drain-signals.md S1-inner) is self-contained with no outer counterpart — no C2 issue.
- **C3 (TTL ordering — outer ≥ inner):** All outer TTLs are 3600s. All inner TTLs are 3600s (or 1800s for guard-only sites). No outer TTL inversion observed. S3 PO triage guard is 1800s (outer) with no inner claim — no C3 issue.
- **C4 (grammar — MCP meta-syntax):** 11 sites use the canonical `call_tool(server="vn-market", tool="task_claim", arguments={...})` form. 5 sites use abbreviated syntax (WARNs above, none in the primary claim path).
- **C5 (release coverage):** All claim sites have an explicit release path. The sprint umbrella claim in `sprint-kickoff.md` is released in `sprint-signoff.md` (approve path). The reject path is the sole gap (WARN-1).

---

## C1 — Inner/Outer Agreement Matrix

| Outer site | Outer task_id | Inner flow | Inner task_id | Agreement |
|------------|--------------|------------|---------------|-----------|
| S1 (execute-tier) | `"task:" + task_id` | developer/main.md or microservice-main.md | `"task:" + task_id` | PASS |
| S2 (main.md resume) | `"task:" + bare_task_id` | nextAgent (developer/qa) | `"task:" + task_id` | PASS — same bare value from pipeline-state |
| S3 (main.md triage) | `"task:po-triage-" + date` | po/main.md | no self-claim (triage guard only) | PASS — disjoint by design |
| S4 (main.md UNBLOCK/CLEAN) | `"task:" + batch_id` | route_to / qa | `"task:" + task_id` | PASS — batch_id = task_id in context |
| S5 (developer.md) | `"task:" + task_id` | microservice-main.md | `"task:" + task_id` | PASS |
| S6 (ba.md) | `"task:" + req_id` | architect/main.md | no self-claim | PASS — architect has no lock |
| S7 (pm.md) | `"task:" + task_id` | developer/main.md or microservice-main.md | `"task:" + task_id` | PASS |

---

## Recommended follow-up

Only WARNs found. No FAILs — two-tier defense is structurally intact.

Recommended actions (all auto-fixable, no redesign needed):

1. **Sprint 1963 (format-fix) — optional, defer to next refactor cycle** — fix WARNs 1–5 in one pass:
   - `flows/po/sprint-signoff.md` — add explicit release to Reject path
   - `flows/qa/main.md:67` — expand re-claim to full call_tool form
   - `flows/dev-team/drain-signals.md:36` — expand release to full call_tool form
   - `flows/agent-father/edit-apply.md:53,74` — expand heartbeat + release to full call_tool form
   - `flows/dev-team/main.md:184-185` — move S4 inline table to fenced code block with full call_tool form

2. All 5 fixes are mechanical one-line or two-line expansions. No logic change required.
3. WARN-1 (sprint-signoff reject path missing release) has the highest operational risk — prioritize if sprint durations regularly exceed 3600s.
