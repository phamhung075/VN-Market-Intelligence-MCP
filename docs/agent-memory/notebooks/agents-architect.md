# agents-architect — Notebook

## 2026-08-06T22:12:10Z

**Brief:** `docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md`

User observed live cross-session cron duplication (4 confirmed duplicate pairs + 3 stale-valued live entries) across 3 concurrent CLI sessions. Root cause: `Cron*` tools are strictly per-session, so each of the 3 re-arm skills' Step-1 guard is blind to peer sessions. Designed a marker (`task_kind` reused as `sprint-task`, `task_id=cron-registration:<family>`, same precedent already used for `cron:<flow>:<TICK>` fire-election markers) gated primarily by `session-presence` liveness cross-check (fast, ≤30min) + `task_force_release_orphan` as the mechanical steal gate — explicitly does not reintroduce the guaranteed-slot-missed regression, since staleness is detected via presence-expiry, not by waiting out the marker's own long TTL. Also fixed the guard's identity+value binary match into an explicit 2-phase classify so a live-but-wrong-valued entry gets replaced in place, not duplicated (closes an already self-flagged-but-unfixed gap in `cron-cowork-team/SKILL.md`'s own rollout note). Split implementation into 2 gated lanes (agent-father direct-implement vs PM→dev-team for a 1-line shared-infra `coordinationStore.ts` change) + a 3rd lane (user-run one-time remediation, zero agent involvement by design).

**Signal dropped:** `docs/signals/2026-08-06-cron-rearm-cross-session-dedup.json` → po (cc agent-father)

---

## 2026-08-07T02:10:19Z

**Brief:** `docs/architecture-briefs/2026-08-07-chef-midflow-bail-determinism-guard.md`

Plan-only determinism-guard spec for FIX-CHEF-MIDFLOW-BAIL-DETERMINISM (P1, recurring_count=2). Root-cause: chef.md/chef-dish.md has bailed mid-flow 3x across 2 trigger mechanisms (scope-clarification narrative 2x, token-budget-wall mid-Layer-analysis 1x), never even emitting the already-specified `self-abort-no-exception` FAILED telemetry — proving prose-only enforcement is insufficient here. Layer 1 (in-flow): generalizes chef.md's existing source-down "Degraded-dish floor" into a shared `chef-telemetry.md § Degraded-Floor Recovery` reachable via one-line checkpoints after every chef-dish.md step (1.5-6.7) + Try/Catch Boundary start pinned to Step 0.5, closing "reachable from ANY partial state." Layer 2 (code-enforced, FOLLOW-UP-2, separate row): system-auditor published-marker orphan sweep, same pattern as its existing stale-marker check — the actual out-of-band guarantee for AC(b), since Layer 1 is still agent-followed prose. Both layers call into (never duplicate) UC-CCA-P3's Published Marker Release Gate; confirmed live via grep this cycle that zero code paths release `published:*` markers anywhere today — interim behavior stays "leave for TTL," never a raw release.

**Signal dropped:** `docs/signals/chef-midflow-bail-determinism-guard-20260807T0210Z.json` → agent-father (cc po, dev-team) — requests po/dev-team perform the board-row lane move (agents-architect has no orch-state.json write authority)

---

## 2026-08-09T02:43:33Z

**Brief:** `docs/architecture-briefs/2026-08-09-fix-system-auditor-cycle-closeout-actuator-and-signal-path.md`

Root-caused the 7-incident system-auditor notebook/signal defect cluster to 2 gaps: (1) `scripts/notebook-compose.sh` — the byte-identity compose actuator built+tested 2026-08-06 specifically to prevent this class — was never wired into `flow/main.md` despite an explicit developer→agent-father handoff 3 days ago; verified live that commit `07dd8d24f` destroyed 2 previously-committed sections (`## c10`, `## c9`) while its own commit message falsely claimed preservation. (2) the tool-grant reference documents `post_agent_signal` as the general signal path with zero mention of the mandatory `emit-audit-signal.sh` wrapper, plausibly causing a CRITICAL cron-fire-gap finding to land on the wrong (rolling-2h `agent_signals`) bus instead of the durable `signal_queue.rows[]`.

**Signal dropped:** `docs/signals/fix-system-auditor-cycle-closeout-actuator-and-signal-path-20260809T0243Z.json` → agent-father
