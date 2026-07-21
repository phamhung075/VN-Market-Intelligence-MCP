## Architecture Brief — New Recurring Agent: `orch-sentinel` (Orchestration-Health Meta-Auditor)

**Sprint:** ORCH-HEALTH-RECURRING
**Date:** 2026-07-21
**Author:** agents-architect
**Status:** DESIGN ONLY — zero code, zero `.md` edits outside this brief
**Input:** 4-loop orchestration audit findings (2026-07-21, router read-only fan-out, 4 Explore agents) — full evidence cited throughout
**Final agent id:** `orch-sentinel` (working name "orchestration-health" retired — collides semantically with the scorecard artifact it produces; `orch-sentinel` reads unambiguously as "watches the orchestration," distinct from `system-auditor` which watches infra/data/DB)

---

## 0. Why a NEW agent, not a 5th system-auditor tier (prior-art check)

The most recent precedent for "add a new audit dimension" (`2026-07-18-cron-workflow-optimize-tier4-fleet-audit.md`, D-FLEET) explicitly **rejected** a new standalone agent and bolted a Tier-4 onto `system-auditor` instead, citing the Host-Load Budget Rule's standing prohibition on new always-on detector agents (`2026-05-27-gated-self-improvement-loop.md` §6). That precedent is checked here, not silently overridden:

| D-FLEET's rejection reason | Does it apply to `orch-sentinel`? |
|---|---|
| New agent = new host-load line item | Same concern applies — addressed in §6 Resource Budget below with the same line-itemed template, cadence kept deliberately low (weekly + 1 light daily, no new container). |
| D-FLEET's subject (fleet behavioral quality) was already adjacent to `system-auditor`'s existing D1-D5 registry and its D-IMPROVE emit pipeline — genuinely an extra dimension of the SAME detector | **Not the case here.** OH-3 (§2) requires auditing `system-auditor`'s OWN probe coverage — its `probe.sh` endpoint list, its Tier-2/3 check tables, its zone coverage. An agent cannot be the sole auditor of its own blind spots without recreating the exact self-resolve conflict-of-interest the fleet already has a standing lesson against (`feedback_auditor_self_resolves_signal_false_green`: a detection-only agent that marks its own prior finding resolved based on its own unwitnessed narrative is a confirmed false-green class). Tier-4/D-FLEET never had to audit Tier-1/2/3's OWN coverage gaps — it audited *other* agents' cycle telemetry. OH-3 structurally cannot live inside the entity it inspects. |
| Scope was a rollup ACROSS agents that could reuse `system-auditor`'s existing write boundary (notebook + signal_queue + improvement-proposals) | `orch-sentinel`'s scope (OH-1..OH-4, this brief) is likewise a cross-cutting rollup, but three of its four questions (Q1 feedback wiring, Q2 verification coverage, Q3 auditor blind spots) are about **the coordination layer itself** (task_board, signal_queue, cron fire-election, which agent watches which agent) — a distinct subject from `system-auditor`'s D1-D5 (runtime/fetch/DB/doc/memory health) and D-FLEET (per-agent behavioral precision). Auditing "does agent A's output reach agent B" is not a system-health check; it is a topology check. |

**Verdict:** honoring the router's explicit task framing (new agent, name chosen by architect) is also the architecturally correct call here, not a rubber stamp — OH-3's self-audit-of-the-auditor requirement is the deciding factor, independent of the task framing. Budget discipline from the D-FLEET precedent is still honored in full (§6).

Also checked and not duplicated: `docs/architecture-briefs/2026-06-10-quality-audit-framework.md` (D1-D10 external black-box quality, not orchestration wiring), `.claude/skills/self-critique/SKILL.md` (single-agent self-review of its own cycle, not cross-agent pipe wiring), `anomaly-task-bridge` (a bridge mechanism `orch-sentinel` OBSERVES the liveness of, per OH-1.3 — never a mechanism it drives).

---

## 1. Mission, Name, Boundary

**Mission:** `orch-sentinel` is the meta-observer of the fleet's 4-loop orchestration (dev-team cron / cowork cron / claude-manager-helper cron / system-auditor crons). On a recurring cadence it re-answers the same 4 questions this 2026-07-21 one-off audit answered manually, so no future "is my orchestration wired correctly and fully used?" ever again requires a human-triggered multi-agent Explore fan-out.

**Boundary — observe + report, NEVER fix** (same PLAN-ONLY posture as `system-auditor`'s AUD-ND-1, generalized to the doc/coordination plane instead of infra):
- Findings route to `docs/data/orch/orch-state.json .signal_queue.rows[]` (`to: "po"`) per `.claude/skills/signal-dashboard/SKILL.md`, **write path: `scripts/orch-apply.sh` ONLY** (§4).
- A human-readable scorecard is regenerated each run (§4).
- `orch-sentinel` NEVER edits any other agent's `.md` file, flow doc, cron config, or `orch-state.json .task_board`/`.head`/`.sprint_goal` sections. NEVER runs `docker`/`git commit --amend`/any mutating command against another agent's owned state. NEVER flips the status of a signal_queue row it did not itself author (no self-resolve, no resolving others' rows either — it is a producer, not a triage authority).
- NEVER self-resolves its own prior findings (`feedback_auditor_self_resolves_signal_false_green`): a finding that reads clean on a later run is recorded as `status: RESOLVED-OBSERVED` in the **scorecard** only (never touches the signal_queue row's status field — that stays `po`'s / the row-consumer's job).

**Non-goals (explicit):** does not replace `system-auditor` (infra/data/DB health), does not replace `tran-ngoc-bau` (strategy-methodology audit), does not replace `claude-manager-helper` (doc/config janitor), does not dispatch fixes, does not touch `apps/**` code, does not create tasks directly on `.task_board` (routes through `po` triage like every other signal producer).

---

## 2. Four Audit Dimensions — OH-1..OH-4 (refined from findings)

All thresholds below are **read live from their owning source** each cycle (drain-signals.md's `>50` guard, signal-dashboard SKILL's `200`-row cap, system-map.json cadence values) — `orch-sentinel` never hardcodes a duplicate copy of a number owned elsewhere (`feedback_no_hardcode_stats`). Severity vocabulary = the canonical signal_queue 5-level schema (`CRITICAL | HIGH | MED | LOW | INFO`, per `signal-dashboard/SKILL.md` row shape) — distinct from `system-auditor`'s 3-level `CRITICAL|WARN|INFO` internal rollup, because `orch-sentinel` writes directly via `orch-apply.sh` (not through `emit-audit-signal.sh`, which is `system-auditor`'s own dedup-ledger-bound script).

### OH-1 — Feedback-Loop Throughput (answers Q1: do findings from loops 2/3/4 reach loop 1?)

| Check | Metric | Source | Flag condition |
|---|---|---|---|
| OH-1.1 | Signal→task mint rate | `signal_queue.rows[]` disposition histogram over trailing 7d (FOLD/COLLAPSE/DEDUP/RESOLVED/PLAN-ONLY vs any row that produced a `.task_board` row with matching `origin_signal_id`) | `HIGH` if mint rate == 0 for 2 consecutive full runs while triage volume > 0 (today: 144 triaged, 0 mints) |
| OH-1.2 | Signal-born task age in BACKLOG | `.task_board` rows with `origin_signal_id` set — read-only jq, same boundary `system-auditor` D-FLEET §2b already established (never writes `.task_board`) | `MED` at P50 age > 5d in BACKLOG; `HIGH` at P90 > 14d; report count + oldest `task_id` |
| OH-1.3 | Anomaly-Task-Bridge (ATB) liveness | count of `repair_task_request` rows + `docs/signals/atb-*.json` in trailing window | **Corroboration-gated** — see box below. Never CRITICAL from a single zero-count read. |
| OH-1.4 | File-plane drain backpressure | count of `docs/signals/*.json` lacking `from`/`to`/`type` (non-routable) | `MED` at >30 (75% of the live `>50` mandatory-full-drain guard read from `drain-signals.md`); `HIGH` at guard breached (today: 52) |
| OH-1.5 | Queue-plane prune health | count of `signal_queue.rows[]` with `status` NOT IN `{NEW,READ,RESOLVED,SUPERSEDED}` (non-canonical, e.g. `"triaged"` — never eligible for `orch-cold-evict.sh`) | `MED` at >70% of the live 200-row cap; `HIGH` at >90% (today: 144/147 ≈ 98% of rows stuck — already past HIGH) |
| OH-1.6 | NEW-row max age per recipient | `max(now − ts)` for `status=NEW` rows, grouped by `to` | `MED` at any recipient > 24h stale (today: `unified-agent` at ~33h) |

**OH-1.3 corroboration box** (`feedback_false_infra_failure_corroboration_gate` + `feedback_internal_consistency_is_not_corroboration_check_the_other_plane` applied): zero ATB rows alone is NOT evidence of a broken bridge — today's finding is that PO's inline triage (dev-team `:07`/`:37` tick) closes NEW auditor rows within ~30min, **structurally pre-empting** ATB's 2h threshold by design. Plane 1 (ATB row count = 0) must be corroborated against an INDEPENDENT plane 2 (signal_queue NEW-row age for auditor-sourced rows, from OH-1.6's own data, filtered to `from` = system-auditor-family): if plane 2 shows rows consistently resolved/triaged well under 2h, verdict = `INFO "pre-empted by design"`. Only if plane 2 ALSO shows rows aging past 2h with ATB still silent does this promote to `HIGH` ("bridge should have fired and didn't"). Never both planes read from the same `signal_queue.rows[]` query with different filters and called "corroborated" — plane 2 must be an independently-computed aggregate, not a re-slice of plane 1's own result set restated.

### OH-2 — Behavioral-Verification Coverage Map (answers Q2: does anything verify policy/architecture/tool-understanding/file-location per agent?)

| Check | Metric | Source | Flag condition |
|---|---|---|---|
| OH-2.1 | Coverage matrix: 4 belief axes × agent population | Parse declared scope from `agent-father/flow/review-setup.md` (structure-only), `tran-ngoc-bau` init (runtime-narrative), `.claude/skills/self-critique/SKILL.md` (pilot roster + T1-T5 scope), `.claude/skills/claim-truth-gate/SKILL.md` (narrative-agents scope) — build a live 4×N matrix each run, never a hardcoded prior copy | `INFO` row per axis×agent-class with zero matching verifier (today: "architecture adherence, runtime" = 0 coverage for the whole fleet) |
| OH-2.2 | D-FLEET pilot graduation status | Read `Tier-4 pilot runs: N` line from `system-auditor` notebook + the 6 G1-G6 criteria (`2026-07-18` brief §7) | `LOW` if pilot run count unchanged for >30d without a graduation decision either way (staleness, not failure — pilots are allowed to sit) |
| OH-2.3 | T4-C dependency (per-agent `tool-usage-stats.byAgent`) | `jq 'has("byAgent")'` on `docs/agent-memory/modules/tool-usage-stats.json` | `INFO` "still degraded mode" while absent — becomes relevant input to OH-2.2's graduation-readiness read, never escalated past `INFO` on its own (it's a known, already-flagged LANE-B backlog item, not a new discovery each run) |

### OH-3 — Auditor Blind-Spot Meta-Check (answers Q3: does system-auditor cover all zones?)

| Check | Metric | Source | Flag condition |
|---|---|---|---|
| OH-3.1 | Probe-coverage diff | `system-map.json` `services[]`/`data_sources[]`/`databases[]`/`channels[]` vs `grep`-parsed endpoint lists in `system-auditor/probe.sh` + `flow/tier1-probe.md` severity table + Tier-2/3 check tables (B-xx/C-xx) | `HIGH` per structural entity present in system-map.json with ZERO matching probe reference (today: kinh-dich-service, rag-service, news-fetch, mcp-gateway — 0 HTTP probes; rag_vectors LanceDB — 0 coverage) |
| OH-3.2 | VPS route count drift | 3-way compare: docs-declared route count (`docs/references/vps-setup*.md`) vs `system-map.json` data_sources geo_blocked count vs live `get_vps_proxy_health()` route count | `MED` on any mismatch (today: 7 doc vs 8 system-map vs "4 ok" live) |
| OH-3.3 | Tier-4/D-FLEET self-promotion guard | Confirm `AUDIT_TIER=4` absent from any live cron config (`cronConfig.ts` grep via `dev-mcp-server` doc pointer, read-only) — guards against silent self-promotion past the PO gate | `CRITICAL` if found registered as a recurring cron (violates `2026-07-18` brief §7 "no self-promotion" invariant) — this is the one OH-3 check allowed straight to CRITICAL without corroboration, because it is a binary presence/absence read against an explicit written invariant, not an inference |
| OH-3.4 | Heartbeat granularity regression | `auditor-tier{1,2,3}-last-healthy.json` shape (bare `{last_healthy_at}` vs any richer per-dimension shape) | `INFO` — tracked as a known limitation (per-Tier-3-dimension status already unrecoverable across notebook's 3-section retention), not a new finding each run once logged once |

### OH-4 — Capability Utilization (answers Q4: does cowork use the app's full capability?)

| Check | Metric | Source | Flag condition |
|---|---|---|---|
| OH-4.1 | Utilization snapshot | `{granted_never_called, called/registry %, top-5 concentration %}` — live jq over `tool-usage-stats.json` × `tool-registry.json` × per-package grant lists, never hardcode "183"/"104"/"43" | `INFO` snapshot always recorded; no severity on the raw number alone |
| OH-4.2 | Delta vs previous run | Diff THIS run's OH-4.1 numbers against the **previous scorecard's** stored OH-4.1 block (self-diff mechanism, §4 — no notebook history needed) | `LOW` if utilization % has been flat (±2pp) for 3+ consecutive full runs — flags stagnation, not a fresh finding |
| OH-4.3 | Persistent high-value dormancy | Cross-reference architecturally significant tools (prediction stack: `create_prediction_claim`/`get_prediction_accuracy`/`get_calibration_report`; evidence-synthesis payoff: `get_evidence_summary`/`get_open_chain_findings`; sector/cascade: `get_supply_chain_exposure`/`get_sector_rotation`/`get_cascade_metrics`/`get_correlation_matrix`; BCTC deep reads; portfolio risk) against current call counts | `MED` for any tool at 0 calls across 3+ consecutive full runs (persistent, not noise — a single-run zero is not itself a finding) |
| OH-4.4 | Doc-coverage drift | `docs/agents/tools/list/*.md` count vs `tool-registry.json` `totalCount` | `LOW` on mismatch (today: 157 vs 183) |

**Anti-flood guarantee (dogfooding OH-1.5):** `orch-sentinel` writes at most one `signal_queue` row per **genuinely new or state-changed** check per run (dedup gate below, modeled on `D-IMPROVE-4`'s cooldown pattern) — it must not itself become a contributor to the exact queue-congestion problem OH-1.5 measures. Before writing any row, glob `docs/signals/` is not applicable here (this agent writes signal_queue only, never file-plane `docs/signals/*.json`); instead read the current `signal_queue.rows[]` for an existing `status=NEW` row from `orch-sentinel` with the same `check_id` — if present, skip re-emit (the scorecard already reflects the current value; the queue does not need a duplicate).

---

## 3. Cron Cadence + Fire-Election Design

Two cron entries, both routed through the SAME `docs/agents/orch-sentinel/flow/main.md` entry point (dispatch SKILL rule: cron skill files never hardcode a sub-flow path):

| Mode | Cron | Dimensions run | Rationale |
|---|---|---|---|
| `MODE=FULL` | `15 3 * * 0` (03:15 UTC Sunday = 10:15 VN Sunday) | OH-1 + OH-2 + OH-3 + OH-4 | Sunday = VN market fully closed (no market-hours collision risk at all, unlike a weekday off-peak pick). Offset +15min from nothing else on the fleet's Sunday schedule — clean slot. |
| `MODE=LITE` | `45 1 * * *` (01:45 UTC daily = 08:45 VN, before 09:00 VN market open) | OH-1 only | OH-1 (signal_queue/task_board plumbing) is the fastest-moving dimension — findings file's own framing. OH-2/3/4 track doc/code/registry state that changes on a weekly-or-slower cadence; running them daily would be pure token cost with zero new signal. Scheduled 15min before `system-auditor` Tier-3 (`0 2 * * *`) to avoid host-load stacking at the same boundary. |

**Fire-election** (per `.claude/skills/dispatch-claim/SKILL.md` § Fire-Time Election, fixed-time pattern — both crons are fixed-time, not `*/N` intervals):

```
# MODE=FULL (weekly, fixed 03:15 UTC)
FIRE_TICK = date -u +"%Y-%m-%dT03:15Z"
FIRE_TASK_ID = "cron:orch-sentinel-full:" + FIRE_TICK

# MODE=LITE (daily, fixed 01:45 UTC)
FIRE_TICK = date -u +"%Y-%m-%dT01:45Z"
FIRE_TASK_ID = "cron:orch-sentinel-lite:" + FIRE_TICK

task_claim(task_id=FIRE_TASK_ID, task_kind="sprint-task", owner_agent="orch-sentinel",
           owner_client_session=$CLAUDE_CODE_SESSION_ID, ttl_seconds=600,
           payload={"site":"fire-election","mode":MODE,"tick":FIRE_TICK})
```
Same claimed/re-entrant/peer-collision branching as `system-auditor`'s Step 0d (`docs/agents/system-auditor/flow/main.md` §Step 0d) — on peer-collision, log + `send_telegram(channel="work")` + clean EXIT, no orphan signals. Release at end-of-cycle after the scorecard/notebook/signal writes complete (§4), same convention as `system-auditor`'s FIRE_TASK_ID release.

**Cron skill file:** `.claude/commands/crons/cron-orch-sentinel.md` — two `CronCreate` entries (FULL + LITE), both pointing at `docs/agents/orch-sentinel/flow/main.md`, `MODE=FULL`/`MODE=LITE` passed as a spawn-prompt token (same pattern as `system-auditor`'s `AUDIT_TIER=N` token). No manual/on-demand mode needed for v1 (unlike D-FLEET's pilot-first design) — `orch-sentinel`'s dimensions are all read-only, doc/data-plane checks with an established §6 budget; no code-dependency gate blocks it the way D-FLEET's §2c did, so it does not need a pilot-graduation gate of its own. If a future dimension needs one, that is a separate brief.

---

## 4. Write Contract

**Read boundary (broader than a typical cowork agent — explicit carve-out, same pattern already established for `system-auditor` Tier-4/D-FLEET):** read-only access to `docs/agent-memory/notebooks/*.md` (ALL agents, for OH-2.1's coverage-matrix parse), `docs/agents/*/flow/*.md` and `docs/agents/*/init.md` (ALL agents, for OH-2.1/OH-3.1's declared-scope parse), `docs/agents/system-auditor/probe.sh` (OH-3.1), `docs/data/orch/orch-state.json` `.task_board` and `.signal_queue` (read-only for OH-1/OH-2, read-write ONLY on `.signal_queue` per below), `docs/data/system-map.json`, `docs/data/tool-registry.json`, `docs/agent-memory/modules/tool-usage-stats.json`, `docs/agents/tools/list/*.md` (count only), `docs/architecture-briefs/*.md` (for graduation-criteria checks like OH-2.2/OH-3.3). This is READ-ONLY across the entire fleet's doc tree — no other agent has this breadth of read scope granted for a write-boundary this narrow.

**Write boundary — 3 targets, nothing else:**

1. **Notebook** `docs/agent-memory/notebooks/orch-sentinel.md` — **OVERWRITE class** (per `.claude/skills/notebook-write/SKILL.md` AC-6 two-class contract, same class as `po` and `market-watcher`): full-file replace each cycle, ≤80L cap, preamble + 1 section only (this cycle's run only — no rolling history in the notebook). This satisfies the task framing's "cycle log, full overwrite" literally. Trend/delta computation (OH-4.2, OH-2.2, OH-4.3's "3 consecutive runs" checks) does **not** depend on notebook history — see point 2.

2. **Scorecard** `docs/data/orch-sentinel-scorecard.md` — regenerated in full each run, same established pattern as `docs/data/DASHBOARD.md` (a generated, agent-authored markdown artifact living in `docs/data/`, per `docs/references/tree-map.md` "volatile → `docs/data/*.json`" rule generalized the same way `DASHBOARD.md` already is — a structured, machine-regenerated `.md` scorecard is the accepted precedent for this file class, not a hand-authored knowledge doc). **This is where trend/delta lives**: before overwriting, `orch-sentinel` reads its OWN prior scorecard content into memory, extracts the last run's OH-4.1/OH-2.2/OH-4.3 stored values from a small fenced `<!-- OH-STATE: {json} -->` block at the bottom, computes deltas/consecutive-run counters against them, then writes the new scorecard (human-readable tables per OH-1..OH-4 + the updated `OH-STATE` block for the next run to diff against). This is the same self-referential-diff technique `system-auditor`'s `D-BCTC-EVAL` sweep already uses (comparing this run's data against a snapshot block held in its own prior write) — applied to the scorecard instead of the notebook, since the notebook here is OVERWRITE-class and cannot hold history.

3. **Signal queue** `docs/data/orch/orch-state.json .signal_queue.rows[]` — **`scripts/orch-apply.sh` wrapper ONLY**, never a raw `Write`/`mv`/full-doc overwrite (per CLAUDE.md's orch-state hot-file contract):
   ```bash
   jq '.signal_queue.rows += [{...new row...}]' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
   ```
   - Exit 0 → success, proceed to POST-WRITE READ-BACK assert (per signal-dashboard SKILL's mandatory contract): re-read the file, confirm the new row `id` is a member of `.signal_queue.rows[]`. Absent → FAIL LOUD (`[SIGNAL-ROW-ASSERT] FAIL`) + BUG-channel Telegram.
   - Exit 2 (CAS mtime mismatch — concurrent writer, per orch-apply.sh's own contract) → retry up to 3× (WF-2 concurrent-writer contract, `orch-sentinel` is a 4th class alongside dev-team/cowork-team/system-auditor Tier-2 at the same boundary since MODE=LITE fires at 01:45 UTC daily, close to but offset from Tier-3's 02:00 — collision is unlikely but the retry contract must exist regardless).
   - Exit 1 (validation/conservation-guard failure) → do NOT retry — log + BUG-channel Telegram, skip this row, continue to next (never abort the whole cycle over one bad row).

**No other writes.** No `docs/signals/*.json` (file-plane — that channel belongs to dev-team/cowork drain, `orch-sentinel` only ever READS it for OH-1.4's count), no `.task_board`, no `.head`, no other agent's notebook, no `.claude/agents/*.md`, no cron config.

---

## 5. Policy Compliance Table

| Policy | How `orch-sentinel` honors it |
|---|---|
| Fail-loud (`docs/protocols/fail-loud-protocol.md`) | Any of the ~20 source reads (probe.sh grep, system-map.json, tool-registry.json, etc.) failing after 1 retry → log + BUG-channel Telegram + skip that ONE check (mark `TOOL-UNAVAILABLE` in scorecard), never silently substitute a guess. Never fail the whole cycle over one unreadable source. |
| Caveman comms | All inter-agent signal_queue payloads follow `.claude/skills/caveman/SKILL.md` ultra-compact form — `summary ≤120 chars`, no prose payload in the row itself (payload detail lives in the scorecard, `payload_ref` points there). |
| Token-economy | Weekly FULL + daily LITE (OH-1 only) cadence is itself the token-economy decision — no `*/15` or `*/30` tick for a meta-analysis dimension that changes slowly (§3 rationale). |
| Notebook ≤200L | OVERWRITE class, ≤80L cap (well under 200L; matches `market-watcher`'s ≤80L precedent for the same class) — no rolling-history risk of ever approaching the cap. |
| No hardcoded stats | Every threshold (`>50` file-plane guard, `200`-row cap, `183` tool count, `7`/`8` VPS routes) is read live from its owning source each cycle via `jq`/`grep`, per §2's "Source" column — never copy-pasted into `orch-sentinel`'s own flow docs as a literal. |
| Never self-resolve own signals | §1 boundary — a finding that later reads clean is marked `RESOLVED-OBSERVED` in the scorecard only; the signal_queue row's `status` field is never touched by `orch-sentinel` after it writes `NEW`. |
| Corroboration gate before CRITICAL | OH-1.3 (§2 box) is the explicit worked example — two independently-sourced planes required. Fleet-wide: only OH-3.3 (a binary invariant-presence check, not an inference) is permitted to emit `CRITICAL` directly; every other check tops out at `HIGH` unless a second independent plane corroborates escalation to `CRITICAL` — this cap is a design rule for `orch-sentinel` specifically, stricter than `system-auditor`'s own vocabulary, because meta-audit findings are inherently one level more inferential than a direct infra probe and deserve the extra caution. |

---

## 6. Resource Budget (Host-Load Budget Rule template, `2026-05-27` brief §6)

```
New cron/agent: orch-sentinel (2 cron entries: FULL weekly, LITE daily)
Schedule: 15 3 * * 0 (FULL) + 45 1 * * * (LITE)
RAM: ~0 MB incremental resident — same pattern as system-auditor/agents-architect: an
  on-demand Claude agent session, not a standing process. Zero new Docker service.
Disk:
  - Notebook: ≤80L file, OVERWRITE class — zero net long-run growth (no accumulation).
  - Scorecard: docs/data/orch-sentinel-scorecard.md, regenerated in full each run,
    estimated ~150-250 lines (4 dimensions × ~6 checks × ~3-5 lines/row + OH-STATE block)
    — bounded, not accumulating (full overwrite, not append).
  - signal_queue rows: ~200 bytes/row, anti-flood dedup gate (§2) caps this at roughly
    ≤10 new rows/week in steady state (only genuinely new/changed findings) — same order
    of magnitude as system-auditor's existing Tier-2/3 row volume, not a new order.
Tick cost: 2 Claude sessions/week (1 FULL + 7 LITE, LITE being cheap — OH-1 only, read-only
  jq passes over orch-state.json + drain-signals.md grep + docs/signals/*.json glob-count).
  Recommend model=sonnet (not haiku like system-auditor) — OH-2/OH-3 require doc-parsing +
  coverage-gap judgment calls (is this axis/agent-class/service actually covered?), not pure
  numeric threshold comparison; the corroboration-gate reasoning (§2, §5) also benefits from
  the stronger model. FULL run wall-time target <10 min; LITE <2 min.
Fleet context: current Docker cap = 8GB (project_host_memory_panic memory). Zero new Docker
  services/processes/containers — same "rides an existing on-demand session pattern" argument
  already accepted for system-auditor and agents-architect.
Decision: proposed APPROVED — within budget, weekly+light-daily cadence, zero new
  infrastructure. Final sign-off is PO's mandatory critique gate at implementation-review
  time (this brief is not a self-authorizing budget approval — flagged to agent-father to
  carry this table into whatever review step precedes cron registration).
```

---

## 7. Implementation Handoff (for agent-father)

**Standard scaffold (via `docs/agents/agent-father/flow/create.md`):** `agent_type = cowork` is the closest template fit (cron-driven, not sprint-execution). Standard Step 4-7 scaffold produces 4 base files; Step 8 registers 3 locations. The following are **additions beyond the standard cowork template**, modeled directly on `system-auditor`'s existing shape (closest structural precedent, not a template `create.md` knows about):

| File | Action | Precedent to mirror |
|---|---|---|
| `.claude/agents/orch-sentinel.md` | Create — frontmatter: `name: orch-sentinel`, `model: sonnet` (§6 rationale), `tools: Read, Write, Edit, Glob, Grep, Bash, mcp__gateway__call_tool`, description states observe-only + write boundary (3 targets) in the description line itself, same style as `system-auditor.md`'s description field | `.claude/agents/system-auditor.md` |
| `docs/agents/orch-sentinel/init.md` | Create — bootstrap pointer, same shape as every other agent's `init.md` | Any existing `init.md` |
| `docs/agents/orch-sentinel/flow/main.md` | Create — thin dispatcher: extract `MODE=FULL|LITE` from spawn prompt (same extraction-and-propagate pattern as `system-auditor`'s `AUDIT_TIER` extraction), run §3 fire-election, dispatch to sub-flows below, run §4 emit-scorecard as end-of-cycle | `docs/agents/system-auditor/flow/main.md` (Tier Dispatch + Step 0d sections specifically) |
| `docs/agents/orch-sentinel/flow/dim-oh1-feedback-loop.md` | Create — OH-1.1..OH-1.6 checks (§2), runs in both FULL and LITE mode | `docs/agents/system-auditor/flow/tier1-probe.md` (split-child pattern) |
| `docs/agents/orch-sentinel/flow/dim-oh2-verification-coverage.md` | Create — OH-2.1..OH-2.3, FULL mode only | same split pattern |
| `docs/agents/orch-sentinel/flow/dim-oh3-auditor-blindspot.md` | Create — OH-3.1..OH-3.4, FULL mode only | same split pattern |
| `docs/agents/orch-sentinel/flow/dim-oh4-capability-utilization.md` | Create — OH-4.1..OH-4.4, FULL mode only | same split pattern |
| `docs/agents/orch-sentinel/flow/emit-scorecard.md` | Create — shared end-of-cycle: compose scorecard (self-diff read of prior scorecard, §4), write notebook (OVERWRITE, §4), write signal_queue rows via `orch-apply.sh` (§4, with POST-WRITE READ-BACK + retry/abort branching), commit, fire-election release, RETURN block | `docs/agents/system-auditor/flow/main.md` §"Anomaly Reporting"/§Notebook Append Gate sections (structure, not literal reuse — different write targets) |
| `docs/agents/orch-sentinel/audit-dimensions.md` | Create — registry doc listing OH-1..OH-4, check IDs, scope, dedup namespace (mirrors `system-auditor`'s own dimension registry so a future architect finds this the same way) | `docs/agents/system-auditor/audit-dimensions.md` |
| `docs/agents/tools/package/orch-sentinel.md` | Create — MCP tool list (reuses existing tools only: `get_cron_health`, `get_pipeline_health`, `get_vps_proxy_health`, `get_alerts`, `post_agent_signal` is NOT used — writes go through `orch-apply.sh` per §4, not `post_agent_signal`), read-boundary note (§4), write-boundary note (§4), explicit `task_claim`/`task_release`/`task_list_held` for fire-election | `docs/agents/tools/package/system-auditor.md` |
| `docs/agent-memory/notebooks/orch-sentinel.md` | Seed — preamble + one placeholder `## <ISO>` section noting "not yet run" | any freshly-seeded notebook |
| `docs/data/orch-sentinel-scorecard.md` | Seed — empty scorecard shell with the 4-dimension section headers + an empty `OH-STATE` block, so the FIRST live run has something to diff against (zero-state, not fabricated data) | `docs/data/DASHBOARD.md` (shape precedent, not content) |
| `.claude/commands/crons/cron-orch-sentinel.md` | Create — 2 `CronCreate` entries (FULL/LITE, §3), both pointing at `docs/agents/orch-sentinel/flow/main.md` | `.claude/commands/crons/cron-system-auditor.md` |

**Registration (beyond `register-agent.md`'s standard 3 locations — roster/CLAUDE.md/dispatch already covered by Step 8):**
- `.claude/skills/dispatch/SKILL.md` Dispatch Table: add a row distinct from `system-auditor`'s existing "system health / audit" row — suggested: `orchestration wiring / loop coverage audit (observe, report)` → `orch-sentinel` → `main` → "Recurring meta-audit of the 4-loop coordination fabric itself (signal wiring, verification coverage, auditor blind spots, tool-capability utilization) — distinct from system-auditor's infra/data/DB health scope." (`.claude/skills/dispatch/SKILL.md` is Architect/claude-manager-helper-owned per `tree-map.md` Write Ownership — this brief cannot write it directly; flagging the exact row text here so whoever executes it does not have to re-derive it.)
- `docs/references/tree-map.md` Write Ownership table: add 2 rows — `docs/agent-memory/notebooks/orch-sentinel.md` (owner: `orch-sentinel`, trigger: each cycle) and `docs/data/orch-sentinel-scorecard.md` (owner: `orch-sentinel`, trigger: each cycle). Same "Architect / claude-manager-helper" write-ownership caveat as above.
- `docs/data/system-map.json` `project.agents[]`: add the `orch-sentinel` entry (id, type=agent, cadence). Owner per tree-map: Developer/PM/System-Auditor — route accordingly, do not hand-edit outside that ownership if the live registration flow differs.

**Explicit non-asks:** no `apps/**` code change (zero — every tool `orch-sentinel` calls already exists), no new MCP tool, no new signal type, no `improvement-proposals` pipeline involvement (that pipeline is `system-auditor`'s D-IMPROVE/self-critique lane; `orch-sentinel` writes plain `signal_queue` rows to `po`, same as `tran-ngoc-bau`/`agents-architect`).

---

## Signal to Agent-Father

Signal file: `docs/signals/orchestration-health-agent-20260721T150023Z.json`

```json
{
  "from": "agents-architect",
  "to": "agent-father",
  "type": "brief_complete",
  "payload": "docs/architecture-briefs/2026-07-21-orchestration-health-agent.md",
  "priority": "normal",
  "createdAt": "2026-07-21T15:00:23Z",
  "notes": "Implement new recurring agent orch-sentinel per §7 file list. agent_type=cowork is the closest create.md template fit but the flow/tools/registration set is non-standard (system-auditor-shaped, not a plain cycle.md cowork agent) — follow §7's precedent-mirror column per file, do not use the plain cowork template verbatim. Zero apps/** dependency, zero new MCP tool, zero cron registration blocked on anything landing first (unlike the D-FLEET pilot). Two dispatch/tree-map registration edits (§7) are Architect/claude-manager-helper-owned per tree-map.md Write Ownership — route those two edits accordingly rather than agent-father hand-editing outside its normal 3-location registration. Resource budget (§6) proposed APPROVED but flagged for a PO mandatory-critique pass before the crons go live, consistent with the Host-Load Budget Rule."
}
```

---

## Designer Notes (Architect Record)

The task arrived pre-framed as "design a new agent" while the most recent adjacent precedent in this repo (D-FLEET, five days ago) explicitly rejected exactly that move for a similar-looking request. Rather than either blindly complying or blindly re-litigating, §0 checks the precedent's actual rejection reasoning against this case and finds a genuine structural difference: OH-3 requires auditing `system-auditor`'s own coverage gaps, which cannot live inside the entity being audited without recreating the fleet's own standing self-resolve/false-green lesson. That is the deciding argument, not the task framing alone — and it is checkable by a future reader the same way D-FLEET's own §0 comparison table is.

The write-contract instruction ("notebook full overwrite" + "human-readable scorecard") looked, on first read, like it wanted trend/delta data (OH-4.2, OH-2.2's "N runs unchanged," OH-4.3's "3 consecutive runs") without a place to keep history, since full-overwrite notebooks by definition don't retain history. Resolved by moving the state-carrying job onto the scorecard itself (self-referential diff against its own prior write, before overwrite) — a technique already live in this codebase (`system-auditor`'s `D-BCTC-EVAL` snapshot mechanism) rather than a new invented pattern, so the notebook can stay a true single-cycle overwrite exactly as asked, and trend data still has a home.

The four dimensions in the findings file were solid starting metrics; the main refinement made here was (a) making every threshold a live read from its owning doc instead of a second hardcoded copy, (b) adding the corroboration-gate worked example (OH-1.3) so the policy isn't just a bullet point but has one fully worked case new implementers can pattern-match against, and (c) an explicit anti-flood guarantee so this new detector does not itself become a contributor to the exact signal_queue congestion (OH-1.5) it is built to measure — the meta-irony was too obvious to leave unaddressed.
