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

## 2026-06-28T08:08:25Z (rev 2 — liveness extension added)

**Brief:** `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md`

CROSS-SESSION-MULTI-TEAM-ORCH (rev 2): N sessions of same role share `owner_agent` → cannot be distinguished by heartbeat/release probes → double-fire + lock interference. Mutex sound; defeat is attribution-only. P1: thread `CLAUDE_CODE_SESSION_ID` as `owner_client_session` into task_locks; rebind matching ladder; delete self-held-heartbeat; CLAUDE.md step 2.5 PRE-CLAIM gate. P1.5 (liveness + orphan takeover): server-side reaper extends gcExpiredLocks to emit `orphan-signal` rows before GC-delete; 600s periodic timer covers all-sessions-dead case; adopter resumes from checkpoint (git SHA for sprint-task, published artifact for cowork) — never restarts; poison-task cap N_MAX=3 → BUG escalation; orch-state board flip via orch-apply.sh only. P2: session-presence registry. P3: fire-time cron leader election. Grounded lessons: spawn-retry-under-lag (slow≠dead grace), recurring-bug-escalation (N_MAX=3), guaranteed-slot-double-post (period-key dedup), chef-fabricated-publish + headless-no-post (idempotency). PO signoff required.

**Signal dropped:** `docs/signals/cross-session-multi-team-orch-20260628T080825Z.json` → pm (rev 2)
