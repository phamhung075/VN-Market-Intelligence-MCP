# agents-architect — Notebook

## 2026-06-13T16:18:10Z

**Brief:** `docs/architecture-briefs/2026-06-13-origin-lag-push-discipline.md`

FU-ORIGIN-LAG-PUSH-DISCIPLINE: recurring root-cause (30+ unpushed commits/2h, 3 consecutive maintenance passes). Root cause confirmed: commit-mutex and commit-boundary NEVER push; generic commit/SKILL.md pushes bare (no rebase-retry, fails non-fast-forward). Design: fold bounded rebase-retry push step into commit-mutex critical section as Step 3d-PUSH (1 initial + 1 rebase-retry attempt, abort on conflict, bug-telegram on failure). TTL bumped 60s → 90s to preserve 4× headroom. commit-boundary gets RULE 4 (same guard, no-gateway path). commit/SKILL.md Step 3 gets guard. PO flow inline commit block replaced with skill reference. 4 agent-father tasks decomposed in brief §6. Race-safety: push is inside the already-serialized mutex window; no two agents push concurrently; rebase-retry operates on stable local HEAD. orch-state.json updated on disk (backlog→ready); pm to commit.

**Signal dropped:** `docs/signals/origin-lag-push-discipline-20260613T161810Z.json` → pm

---

## 2026-06-13T17:52:21Z

**Brief:** `docs/architecture-briefs/2026-06-13-orch-state-read-discipline.md`

ORCH-STATE-READ-DISCIPLINE: orch-state.json is 933KB/~233K tokens — any full Read-tool load burns 23% of a 1M context. Root cause: no canonical read-access rule; 2 literal cat-full-file shell reads + multiple ambiguous "Read … extract" phrasings across 10 flow files. SSOT home selected: new `docs/standards/orch-state-access.md` (not the consolidate brief — briefs are historical, standards are living). Guard sentence + jq recipe table per section (.head ~150t, .head.status ~3t, .task_board count ~5t, .task_board slices ~500t, .sprint_goal ~80t, .signal_queue → cross-ref signal-dashboard). 12-item copy-pasteable edit inventory for agent-father: 2 literal cat→jq replacements, 4 bash-pipeline clarification comments, 6 "Read … extract" → explicit jq recipes. Write side (§2.3 atomic write) left unchanged. AC: grep cat = 0 hits, grep "Read `docs/data/orch" = 0 hits, new standards file exists.

**Signal dropped:** `docs/signals/orch-state-read-discipline-20260613T175221Z.json` → agent-father

---

## 2026-06-14T12:18:16Z

**Brief:** `docs/architecture-briefs/2026-06-14-dev-team-tool-contract-cron-overlap.md`

DEV-TEAM-TOOL-CONTRACT-CRON-OVERLAP: two-finding brief from 10-session cron audit. F1: six recurring tool-call error classes (server string, meta-tool misrouting, name guessing, task_id type, send_telegram enum/field, stale-read) burning turns every session — fix by creating `docs/standards/gateway-call-contract.md` (~60L canonical contract) and adding a GCC-PREFLIGHT read directive at top of dev-team/flow/main.md Step 0-PREFLIGHT. F2: cron fires every 60min but ticks run up to 3h28m → concurrent sessions; TTL-scoped orphaned locks cause SKIP failures on restart — fix by adding SF-1 single-flight session lock (task_claim key="dev-team-cron-singleton" TTL=5400s) at PREFLIGHT entry with heartbeat at Step 3 and release at session exit. Cron schedule unchanged. Doc/flow only — no production code. 3 agent-father tasks; F1-B + F2-A serialize on same file.

**Signal dropped:** `docs/signals/dev-team-tool-contract-cron-overlap-20260614T121816Z.json` → agent-father
