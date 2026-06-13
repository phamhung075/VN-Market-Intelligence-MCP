<!-- size-justification: ~180L — 12-section spec per CONTEXT brief pattern; each section load-bearing for agent-father implementation. SPRINT: FIX-COWORK-GUARANTEED-BACKSTOP (5th recurrence). -->

# Architecture Brief: Cowork Guaranteed-Slot Backstop — Layer A Restore

**Authored by:** architect
**Date:** 2026-06-13
**Sprint task:** FIX-COWORK-GUARANTEED-BACKSTOP (priority=high, 5th recurrence)
**Zone:** docs/agents/cowork-team/flow/ (cowork reliability — NOT dev-mcp-server code, NOT cowork-schedule.json data)
**Handoff target:** agent-father (implement)

---

## 1. Chosen Option: A — Restore Layer-A Per-Slot RemoteTriggers for the 4 Guaranteed Chef/Audit Slots

**Decision: Option A.**

Rationale over B and C:

- **Option C is off the table.** The CLI harness reports `durable:true` as "session-only, not written to disk." This was already observed to fail in the wild (the exact evaporation that caused the 32h gap). No concrete persistence mechanism — launchd plist, macOS crontab, or `.claude/scheduled_tasks.json` — currently exists to back `CronCreate` across session-end for the Claude Code CLI. The launchd plists in `launchd/` control long-running daemons (docker-events, socat-bridge), not CLI session commands. Writing a plist that shells into `claude` and issues `CronCreate` programmatically is architecturally fragile and untested; it would require a dedicated spike before being trusted at production. Choosing C without a concrete, proven persistence mechanism repeats the original mistake.

- **Option B (silence-watchdog) does NOT close the root.** A watchdog that fires when a heartbeat gap exceeds 20min is itself a session-scoped agent or must be on a session-independent trigger. If it runs as another `CronCreate`, it shares the same evaporation failure mode as Layer B — the watchdog dies at the same time as the dispatcher it is supposed to watch. If it runs as a RemoteTrigger (session-independent), then the correct design is to run the actual guaranteed slots on RemoteTriggers, not the watchdog. Option B simply proxies Option A at one level of indirection, adds latency (20+ min gap before re-arm), and still depends on someone re-arming Layer B. G3 ("survives deliberate CLI restart without manual /cron-cowork-team") is not satisfied by B.

- **Option A closes the root permanently.** RemoteTriggers run session-independently on claude.ai infrastructure. They survived the 32h Layer-B gap (confirmed by §1 of the runbook). The root cause is that Layer A was deleted before §9's stability gate ("proven across ≥2 session restarts") was met. Restoring Layer A for the 4 guaranteed slots directly addresses this.

**Dedup / double-fire prevention** (the crux — see §6 below).

---

## 2. Scope: Guaranteed Slots Requiring Layer-A Coverage

From `docs/data/cowork-schedule.json`, the slots with `guaranteed: true`:

| slot_id | cron | trigger_id (old, now null) | notes |
|---|---|---|---|
| chef-morning | `15 5 * * 1-5` | `trig_019nwLpkYELqFdE1DZaRhPUk` (was deleted) | VN market critical |
| chef-eod | `45 8 * * 1-5` | `trig_011HNsRMNiQwa3vNwN1b9Anh` (was deleted) | VN market critical |
| chef-evening | `45 19 * * *` | `trig_01CLotVE4XinDFxM2jErUCir` (was deleted) | daily preview |
| digest-sunday | `47 13 * * 0` | `trig_014GzK19w1ZNpwnRjA91ce3P` (was deleted) | weekly |
| tnb-audit | `13 20 * * *` | `trig_01LpUxJ98v2aK22FqLSBtL1G` (was deleted) | daily audit |

All 5 slots have `trigger_status: deleted`, `trigger_id: null`. These are the backstop targets.

Note: `chef-intraday` (`guaranteed: false`) does NOT get a RemoteTrigger — RemoteTrigger enforces ≥1h minimum (API_MIN_INTERVAL). Its `*/15 2-8` cadence is sub-hourly so Layer B covers it when alive; it is explicitly non-guaranteed and can miss during session gaps without breaking SLA.

---

## 3. RemoteTrigger Recreation Spec

**Workspace environment_id:** `env_011CV1yonRDFUhYhGEdkVwqj` (from `cowork-schedule.json _notes.spike_1951a_oq3`)

Each RemoteTrigger must carry:
```
action         = "create"
name           = "<slot_id>-backstop"
cron_expression = <slot.cron>
enabled        = true
job_config.ccr.environment_id = "env_011CV1yonRDFUhYhGEdkVwqj"
job_config.ccr.events         = [{ prompt: "<slot.trigger_prompt>" }]
session_context.model         = "claude-sonnet-4-6"
session_context.sources       = [{ git_repository: { url: "<VN-Market-repo-url>" } }]
mcp_connections               = [vn-market MCP]
enabled_plugins               = []
persist_session               = false
```

`trigger_prompt` per slot is already in `cowork-schedule.json` under the `trigger_prompt` field. Use verbatim.

After creation, agent-father writes the returned `trigger_id` back to `cowork-schedule.json`:
- `trigger_id: "<new-id>"`
- `trigger_status: "active"`
- `last_reactivated_at: "<ISO-now>"`

---

## 4. §9 Stability Gate — Do NOT Delete Layer A Until Proven

The §9 rule from `docs/protocols/cowork-master-cron-runbook.md`:

> "Must NOT be deleted until 1957b is done AND the cron-cowork-team skill is proven stable across ≥2 session restarts."

This gate was violated before. The design going forward:

**Layer A (RemoteTriggers) and Layer B (*/15 CronCreate) COEXIST PERMANENTLY until an explicit, time-gated stability vote.**

The stability vote requires ALL of the following before any future Layer-A deletion is even proposed:
1. Layer B has survived ≥2 documented, logged CLI session restarts without missing a guaranteed slot (verified via `last_fired` diff in cowork-schedule.json).
2. A runbook §9-gate flag `layer_a_deletion_locked: true` in `cowork-schedule.json._notes` is cleared by PO explicitly.
3. This clearing is a separate sprint task, not an incidental edit.

Agent-father adds this lock field now:
```json
"_notes": {
  ...,
  "layer_a_deletion_locked": true,
  "layer_a_deletion_gate": "Do NOT delete RemoteTriggers until: 2x session-restart survivals logged in cowork-master-cron-runbook.md §9.stability_log AND PO clears this flag via explicit sprint task."
}
```

---

## 5. Dual-Layer Coexistence Rules

Both Layer A and Layer B will fire the same guaranteed slot within the same 15-min window on normal operation. This is intentional — the dedup mechanism handles it.

**Coexistence constraint:** Layer A fires its own fresh CLI session (`persist_session: false`) independently of Layer B's session. They are causally independent.

**Conflict window:** Both fire at e.g. 05:15Z. Layer A session starts ~05:15Z, Layer B dispatcher tick also runs at 05:15Z and spawns the same `unified-agent/chef.md`.

This is acceptable and expected — the dedup mechanism resolves it inside the slot flow.

---

## 6. Dedup / Double-Fire Prevention (The Crux)

**Mechanism: `last_fired`-based idempotency gate ALREADY EXISTS in `cowork-schedule.json` and was designed for exactly this in the original Sprint 1951 dual-layer parallel run (see `2026-05-18-cowork-team-command.md §7`).**

The gate works as follows:

1. When a guaranteed slot fires (from either Layer A or Layer B), the agent flow checks `cowork-schedule.json .slots[] | select(.slot_id == "<slot>") | .last_fired`.
2. If `last_fired` is within the expected non-fire window for that slot (e.g. chef-morning fired in the past 30 min), the agent exits silently — no Telegram publish, no dish output.
3. The first-to-write wins. The second to arrive reads `last_fired` already updated and exits silently.

**Load-bearing path:** `docs/agents/cowork-team/flow/last-fired.md` writes `last_fired` atomically after a slot fires. `docs/agents/cowork-team/flow/spawn-fanout.md` reads it before spawning.

**Gap to address (agent-father MUST verify before marking DONE):** The `last_fired` check must be present and active in the slot flow. Given that Layer B currently does the `last_fired` write (Step 5b via `last-fired.md`), and Layer A fires an independent session that may not go through the same dispatcher, agent-father must confirm the idempotency check lives IN the individual agent's flow (unified-agent/flow/chef.md, tran-ngoc-bau/flow/main.md, digest-predict/flow/main.md) NOT only in the cowork-team dispatcher. If it is only in the dispatcher, a Layer-A-fired session bypasses it entirely — this would cause double-publish.

**Required verification by agent-father before RemoteTrigger creation:**
- Read `docs/agents/unified-agent/flow/chef.md` — confirm a `last_fired` recency check exists at the top of the flow (or a slot-claim token check via `slot-claim.md`).
- If the check is in the dispatcher only, add it to each guaranteed agent flow before creating RemoteTriggers.
- The check threshold: `last_fired` within past N minutes where N < the slot's inter-fire interval (e.g. chef-morning repeats daily at 05:15Z — if `last_fired` is today's date at 05:xx UTC, skip).

**Double-publish monitor (already designed in §9 of 2026-05-18-cowork-team-command.md):** `drain-signals.js` detects same `dish_type` + UTC hour published twice in MARKET and emits a BUG signal. This remains the post-hoc safety net but is not a substitute for the flow-level gate.

---

## 7. Files to Create / Modify

| File | Action | Owner |
|---|---|---|
| `docs/data/cowork-schedule.json` | Update 5 guaranteed slots: set `trigger_id`, `trigger_status: "active"`, `last_reactivated_at`; add `layer_a_deletion_locked` to `_notes` | agent-father |
| `docs/protocols/cowork-master-cron-runbook.md` | Update §1 (Layer A active again, list 5 trigger IDs), §9 (add stability_log table, document deletion lock) | agent-father |
| `docs/agents/unified-agent/flow/chef.md` | Verify/add `last_fired` idempotency check at top (see §6) | agent-father (verify first, add only if missing) |
| `docs/agents/tran-ngoc-bau/flow/main.md` | Same check | agent-father (verify first) |
| `docs/agents/digest-predict/flow/main.md` | Same check | agent-father (verify first) |
| RemoteTrigger (claude.ai platform) | Create 5 triggers per §3 spec | agent-father (via RemoteTrigger MCP tool) |

No new files required. No dev-mcp-server code changes. No cowork dispatcher flow changes.

---

## 8. DDD Layer Assignment

This is purely **infrastructure / trigger layer**:
- RemoteTrigger creation = external infrastructure registration (no domain code changes)
- `last_fired` idempotency check = application layer guard (already exists; verify-not-add)
- `cowork-schedule.json` update = SSOT data edit
- Runbook update = protocol document

No DDD violations. No new interfaces. Pure extension of existing design.

**BUILD-STANDARD: not-applicable** (reliability fix — no new service, no new feature primitive).

---

## 9. Verification Gates (Mapped to Task Requirements)

| Gate | What to verify | Provable by |
|---|---|---|
| G1 | chef-morning fires 2026-06-16T05:1x..05:3xZ | `cowork-schedule.json` chef-morning.last_fired updated + notebook entry |
| G2 | chef-eod fires 2026-06-16T08:4x..09:0xZ | same pattern |
| G3 | Survives deliberate session restart — guaranteed slot fires post-restart with NO manual /cron-cowork-team | Layer-A RemoteTrigger fires independently; session restart does not suppress it |
| G4 | No double-publish on Mon 2026-06-16 | BUG channel silent on `double_publish`; MARKET has exactly one chef-morning dish |

G3 is the critical proof gate. After agent-father creates the RemoteTriggers, the test procedure is:
1. Kill Claude Code CLI session (close terminal / restart).
2. Do NOT invoke `/cron-cowork-team`.
3. Wait for the next guaranteed slot boundary (e.g. chef-morning at 05:15Z).
4. Verify cowork-schedule.json `last_fired` updates AND a Telegram MARKET message appears.
5. If it does: Layer A confirmed session-independent. Root closed.

---

## 10. Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| RemoteTrigger `last_fired` gate absent in agent flows — double-publish | HIGH | §6 mandatory verify-before-create step |
| RemoteTrigger platform outage (claude.ai infra) | LOW | Layer B still fires during sessions; accepted residual |
| workspace trigger count limit (OQ-2, still UNKNOWN) | MEDIUM | Current count was 3 (qa-responder + 2 vault) + 5 new = 8 total. Well under any plausible limit. |
| Agent-father creates triggers but forgets to write trigger_ids back to SSOT | MEDIUM | Runbook §3 recovery (Step 1 jq query) fails without trigger_id — mandate SSOT write as part of acceptance |
| Layer A and B both fire, slot-claim token race | LOW | Slot-claim tokens in `slot-claim.md` are session-scoped; Layer A runs in a separate session so tokens don't conflict — `last_fired` wall-clock check is the correct gate |

---

## 11. Acceptance Criteria

**AC-1:** 5 RemoteTriggers created (chef-morning, chef-eod, chef-evening, digest-sunday, tnb-audit). `RemoteTrigger(action="list")` shows all 5 enabled.

**AC-2:** `cowork-schedule.json` updated — all 5 slots have non-null `trigger_id`, `trigger_status: "active"`, populated `last_reactivated_at`.

**AC-3:** `cowork-schedule.json._notes.layer_a_deletion_locked: true` added with deletion gate note.

**AC-4:** Runbook `§1` updated to reflect Layer A active (5 triggers, trigger IDs listed). `§9` updated with stability_log table and deletion lock explanation.

**AC-5:** Agent-father has verified (READ, not assumed) that each of the 3 guaranteed agent flows (chef.md, tnb main.md, digest-predict main.md) contains a `last_fired` recency check. If any is missing, it is added before RemoteTrigger creation.

**AC-6 (verification, inherently multi-day):** G1+G2+G3+G4 pass on Mon 2026-06-16.

---

## 12. Agent-Father Signal / Handoff

Agent-father owns full implementation. Implementation order:

1. READ `docs/agents/unified-agent/flow/chef.md`, `docs/agents/tran-ngoc-bau/flow/main.md`, `docs/agents/digest-predict/flow/main.md` — verify `last_fired` idempotency gate exists in each.
2. If any gate is missing: ADD it (flow-level, top of flow, before any publish action) in the same commit.
3. CREATE 5 RemoteTriggers via `RemoteTrigger(action="create", ...)` per §3 spec.
4. WRITE trigger IDs back to `docs/data/cowork-schedule.json` (atomic temp→rename pattern).
5. ADD `layer_a_deletion_locked` field to `_notes`.
6. UPDATE `docs/protocols/cowork-master-cron-runbook.md` §1 and §9.
7. COMMIT: `fix(cowork/backstop): restore Layer-A RemoteTriggers for 5 guaranteed slots + deletion lock`.
8. Report G3 test result after next guaranteed slot boundary post-implementation.

**Do NOT delete any RemoteTrigger in this sprint.** The deletion lock added in step 5 documents this permanently.
