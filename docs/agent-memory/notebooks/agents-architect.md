# agents-architect — Notebook

## 2026-06-24T15:04:57Z

**Brief:** `docs/architecture-briefs/2026-06-24-prediction-daily-cadence.md`

ARCH-PREDICTION-DAILY-CADENCE: prediction_claims producer starved since 2026-06-14 — Sprint 1949-T5 disabled monday.md (P-3..P-5 create_prediction_claim) but weekly.md only reads get_prediction_accuracy (never writes claims). Fix: create daily-predict.md reusing monday.md P-3..P-5 pipeline (cap=3/day), add same-day dedup gate in main.md (task_claim key published:digest-daily:YYYY-MM-DD TTL=86400s), add digest-daily cron slot (30 17 * * *) to cowork-schedule.json, update main.md dispatch table to route daily slot → daily-predict.md and Sunday → weekly.md (unchanged). Weekly ceiling raised to 15/week. Honest NO-OP when no ticker passes conviction threshold. weekly.md and monday.md untouched.

**Signal dropped:** `docs/signals/prediction-daily-cadence-20260624T150457Z.json` → agent-father

---

## 2026-06-26T15:28:08Z

**Brief:** `docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md`

ORCH-STATE-HOT-COLD-SPLIT: orch-state.json is 2.46 MB / 26,185 lines (53% evictable terminal dead weight). Root causes: in-file archive never shrinks hot file (task-archive.md targets wrong denominator + same-file array); whole-file 2.46 MB rewrite per mutation; 10 meta-tracking keys (schema cruft); backlog prose inflation (507 chars/item × 313 items). Target < 150 KB hot file + append-only cold archive (docs/data/orch/archive/YYYY-MM.json). 7 tasks: HSC-1 (eviction script) → HSC-2 (one-time migration) + HSC-3..7 parallel → HSC-5 last (meta-key collapse, highest risk). Context reduction 94%. Primary hallucination vector (done_verified prose) evicted to cold, unreachable during normal planning cycles.

**Signal dropped:** `docs/signals/orch-state-hot-cold-split-20260626T152808Z.json` → pm

---

## 2026-06-28T08:08:25Z

**Brief:** `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md`

CROSS-SESSION-MULTI-TEAM-ORCH: N sessions of the same agent role (two dev teams, two analysis teams) share `owner_agent` and therefore cannot be distinguished by heartbeat/release/ownership probes — causing double-fire and lock interference. The mutex primitive (task_claim INSERT-OR-IGNORE) is sound; the defeat is attribution-only. Fix: thread `CLAUDE_CODE_SESSION_ID` (harness UUID, verified live, read nowhere in codebase) as `owner_client_session` into task_locks; rebind heartbeat/release matching ladder to it; delete self-held-heartbeat anti-pattern in leader-lock.md:64-81; insert CLAUDE.md step 2.5 PRE-CLAIM gate. Three phases: P1=attribution fix (unblocker, 7 atomic tasks split across dev-mcp-server+agent-father), P2=presence registry (session-presence enum + task_list_held output), P3=fire-time cron leader election (replaces operator-level OBSERVE-ONLY convention). Migration-before-switch sequencing constraint enforced. PO signoff required before code lands.

**Signal dropped:** `docs/signals/cross-session-multi-team-orch-20260628T080825Z.json` → pm
