# agents-architect — Notebook

## 2026-05-21T19:09:09Z

**Brief:** `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md`

9 optimization levers across 3 phases targeting per-cycle token waste and excess MCP calls. Key findings: 3 concurrent market-hours agents (news-scout/market-watcher/alert-commander) each independently call get_cycle_bootstrap + get_macro_snapshot per 15-min tick (~168 redundant calls/trading-day); 4 agents use `trigger: startup` lazy-loads that violate the waterfall-lazy-load ban; qa notebook is 1149L (5.7× over cap); news-scout calls get_agent_signals 3× per cycle with overlapping windows. Phase 1 (agent-father only): startup-trigger fixes, notebook trim, signal payload pointers, ULTRA caveman on status pings — est. 25–35% context reduction. Phase 3 (dev-team): tick-snapshot dedup for bootstrap triplicate.

**Signal dropped:** `docs/signals/token-toolcall-economy-20260521T190909Z.json` → po

---

## 2026-05-21T19:08:39Z

**Brief:** `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md`

Sprint 1967a read-only orchestration audit: 13 findings across 6 surfaces. 5 HIGH (alertSource enum missing `legal_risk` in write_alert_verdict, verified_decision not in post_agent_signal schema, DASHBOARD stale-race on sprint close, market-watcher identity recurrence post-fix, weekly cron jobs have no retry on crash), 7 MED (cowork lock release timing, DASHBOARD unbounded growth, coverage claim drift, fire-drift guard missing, dead API_MIN_INTERVAL slots, alert-commander mcp-tools.md lazy, recurring-bug freeze no timeout). Gate: post-1965c-soak dispatch except ITEM-01/09/04 priority batch.

**Signal dropped:** `docs/signals/agents-architect-1967a-brief-done.json` → po (1967c sign-off) → pm (1967b TASK conversion)

---

## 2026-05-21T19:29:19Z

**Brief:** `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md`

Sprint 1967b canonical re-run: 22 findings across 7 surfaces (13 ratified from v1, 9 new). 6 HIGH: alertSource enum gap, verified_decision schema absent, DASHBOARD stale-race, market-watcher identity recurrence, cowork lock release timing, weekly cron no retry. 13 MED cover signal naming, DASHBOARD prune, execute-tier try/finally gaps, isRunning in finally, TASKS.md LWW, identity stanzas missing (8 agents), fire-drift guard, API_MIN_INTERVAL dead slots. 1 BCTC-gated (ITEM-13 freeze policy). 2 deferred to Sprint 1968 L-1/L-2. PM to slate 1967c.

**Signal dropped:** `docs/signals/architect-1967b-brief-done.json` → pm (1967c slate decomposition)

---

## 2026-06-01T08:34:55Z

**Brief:** `docs/architecture-briefs/2026-06-01-context-resume-economy.md`

Fleet-wide context-resume wastes ~410k tokens/day: DASHBOARD.md (153 KB, 63 dead non-NEW rows, unbounded `_Updated:` header) is read in full every cron tick by 10+ agents; pipeline-state.json resume fields are freeform prose; the existing handoff-delta-read skill is not wired into DASHBOARD. Designed three-phase fix: (1) signal-dashboard SKILL upgraded to mtime/linecount Phase-1 skip + section-only Phase-2 read + mandatory PRUNE enforced in drain-signals.md; (2) pipeline-state.json v2 schema with machine-readable `head` block for routing and capped `narrative`; (3) optional cowork equivalents audit. Target: ~38k→~0–400 tokens/DASHBOARD read, ~1750→~150 tokens/pipeline-state routing read, ~95% fleet resume token reduction.

**Signal dropped:** `docs/signals/context-resume-economy-20260601T083455Z.json` → agent-father

---

## 2026-06-01T09:21:33Z

**Brief:** `docs/architecture-briefs/2026-06-01-signal-dashboard-cap-extract.md`

RE-CAP-1 hygiene fix: `.claude/skills/signal-dashboard/SKILL.md` is 192L (overage 72 vs 120L skill-file cap). The §WRITE/§READ/§PRUNE protocol bodies added in b38ac812 are load-bearing (fleet resume-economy contract); designed lazy-load extraction — move those three section bodies verbatim to a new sibling `dashboard-protocol.md` child, condensing each to a ~3-line summary + pointer in the parent, projecting parent to ~118L. All callers (drain-signals.md 0a-D-PRUNE) remain resolvable; §PRUNE section header + mandatory-call statement stay in SKILL.md.

**Signal dropped:** `docs/signals/signal-dashboard-cap-extract-20260601T092133Z.json` → agent-father

---

## 2026-06-01T20:19:21Z

**Brief:** `docs/architecture-briefs/2026-06-01-detector-plan-only-safety.md`

AUD-ND-1 (CRITICAL): system-auditor had no explicit prohibition on destructive ops; LLM inference path caused `docker stop mcp-server` on false-positive CRITICAL signals twice — second incident during VN trading hours permanently destroyed Monday intraday price data. Fix: insert explicit PLAN-ONLY INVARIANT block in flow/main.md + init.md; replace unconstrained Bash grant in tools/package with read-only allowlist (docker ps/inspect/stats/logs/exec-sqlite3, curl, df, free); forbidden list is explicit. Scope: system-auditor only (3 files). QA proof: AUD-ND-1-PROVEN-RED synthetic false-positive must produce signal/DASHBOARD/BUG with zero infra mutation, verified by docker ps mcp-server start-timestamp unchanged.

**Signal dropped:** `docs/signals/detector-plan-only-safety-20260601T201921Z.json` → agent-father

---

## 2026-06-01T21:12:21Z

**Brief:** `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md` (v2 — operator refinement)

Operator strengthened the direction: TASKS.md + DASHBOARD.md fully deleted (not generated views); ONE single JSON file (`docs/data/orch/orch-state.json`). Full reader inventory completed — 40+ reader sites in code + agent flows identified with file:line citations, all have clean migration paths, no blocker found. Concurrency re-analysis: WIP<=2 + commit-mutex + dashboard-row lock means real concurrent writers = 1 at a time; single-file is safe with atomic temp-rename write protocol. Schema v3 merges all four sections (head/task_board/signal_queue/narrative) into one file. One greenlight question surfaced for operator: D4-R4 concurrent-commit alarm threshold (default: keep 30s window, accept slightly more noise on unified file).

**Signal dropped:** (brief is the handoff — no separate signal file; router routes OSC-1/2/3/4 to agent-father + dev-mcp-server + ops)

---

## 2026-06-01T20:58:53Z

**Brief:** `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md`

Operator-directed JSON-first SSOT design: 3 files under `docs/data/orch/` (pipeline-state.json moved, task-board.json new, signal-queue.json new); markdown views become generated-only output. Highest-risk item is the `pipeline-state.json` path rename — 14 reader sites across code and agent files must land in ONE atomic commit to prevent test breakage; OSC-5 (flip readers off Markdown) is deferred to a PO-gated hardening period.

**Signal dropped:** (no separate signal file — brief is the handoff; router to route OSC-1/2/3/4 to agent-father + dev-mcp-server + ops per §5 task batch)

---

## 2026-06-01T20:58:24Z

**Brief:** `docs/architecture-briefs/2026-06-01-orch-state-consolidation.md`

Operator pushback on prior brief's 5-surface model (3 existing + 2 proposed twins) resolved. Two proposed twins (`tasks-state.json`, `signals-state.json`) rejected; replaced by ONE `docs/data/orch-state.json` projection. Critical latent bug discovered: 1837a schema test expects v1 root fields (`activeTaskId`, `status`) but live pipeline-state.json is v2 (`head.active_task_id`) — test silently fails, janitorJob reads wrong field path, alert-commander reads `.currentSprint` which is absent in v2. Phase 0 schema fix unblocked and mandatory regardless of option chosen (B=recommended one-projection / C=pipeline-only minimal). Option B: 3 canonical files + 1 machine projection, 6-phase plan, 10–14 tasks, awaiting operator greenlight.

**Signal dropped:** `docs/signals/orch-state-consolidation-20260601T205824Z.json` → agent-father

---

## 2026-06-01T21:06:42Z

**Brief:** `docs/architecture-briefs/2026-06-01-agent-self-critique-detect-source.md`

Added a new decentralized DETECT source to the SELF-IMPROVE-GATE pipeline: an end-of-cycle self-critique step (sibling of doc-self-heal) that fires only on 5 machine-anchored triggers (T1 tool failure, T2 capability gap, T3 low-confidence result, T4 recurring notebook workaround, T5 budget overrun), writes a DRAFT IMP-*.md proposal, and feeds the existing agents-architect → PO → agent-father pipeline unchanged. Design requires 3 file edits (cowork-end-cycle SKILL +1L, dev-team post-cycle +1L, new self-critique SKILL ~90L) plus a 14-day shadow pilot on news-scout and dev-team before fleet-wide.

**Signal dropped:** `docs/signals/agent-self-critique-detect-20260601.json` → agent-father (BLOCKED on PO approval)

---

## 2026-06-02T01:21:01Z

**Brief:** `docs/architecture-briefs/2026-06-02-esc-opus-dispatch-seam.md`

10-cycle silent ESC failure: bctc-analyst (Sonnet) prose-invokes deep-dive-opus.md (model:claude-opus-4) but no runtime boundary enforces a model switch mid-flow — zero Opus analysis ever ran. Fix: replace inline invocation with a task_claim idempotency guard + esc-deep-dive-request signal to dev-team; drain-signals.md gains ESC-DISPATCH handler that spawns bctc-analyst with model=opus override; deep-dive-opus.md gains § Output Signal to close the loop to PO. Three-file edit for agent-father; drain-signals.md will exceed 120L cap and must extract ESC-DISPATCH to a child file. FU-BCTC-TOOL-PARAMS (get_cash_flow quarters-param ignored; get_bctc_full takes code not ticker) is a parallel dependency for full analytical value.

**Signal dropped:** `docs/data/orch/orch-state.json` `.signal_queue` row (to:po, type:brief_complete)

---

## 2026-06-02T04:09:04Z

**Brief:** `docs/architecture-briefs/2026-06-02-fb-jargon-gate.md`

fb-market-poster STEP 4 check 3 is pure model self-attestation — false-greened 3× in one session (thanh khoảy ×6, (FII) ×2, full hexagram paragraph), all caught only by router raw grep. Designed a deterministic gate: SHARED executable (`scripts/fb-jargon-gate.sh` + `.claude/skills/fb-jargon-gate/SKILL.md`) called from a new hard-fail STEP 4a in the flow; forbidden token SSOT lives exclusively in the script (32 English-jargon + 8 notation + anchored hexagram `vị thế <name>` + VN typos + calendar weekday check); 10 false-positive traps documented with safe anchored patterns; 3 smoke tests specified (Test A fires on `sentiment`, Test B passes clean, Test C proves `không` never triggers hexagram check).

**Signal dropped:** `docs/data/orch/orch-state.json` signal_queue row `architects-fb-gate-brief-20260602T0409Z` → agent-father

---

## Carry-over

- market-watcher/cycle.md Step 5 append/overwrite drift: confirm agent-father applies fix in same pass as frontmatter edit (§12c market-watcher row).
- OQ-1 through OQ-4 from §10 of 1951b brief remain open for agent-father to resolve before Phase 3 QA.
- L-1 alert-commander: verify whether 1963-MW-IDENTITY fix (agent-father 2026-05-21) already promoted mcp-tools.md to always_load — if yes, L-1 for alert-commander is a no-op.

---

## 2026-06-02T03:16:33Z

**Brief:** `docs/architecture-briefs/2026-06-02-notebook-write-prune-contract.md`

4th notebook cap breach in 3 days root-caused to 4 distinct failure modes: (F-1) unified-agent `## Prior cycles` is a permanent accumulator section whose `###` sub-blocks are structurally invisible to block-level AC-2 prune; (F-2) bctc-analyst has a dead "Overwrite" instruction overridden by `cowork-end-cycle` → append path producing 6 live sections; (F-3) AC-5 write-time guard never reaches effective write path in any of the 3 breaching agents (all inline their writes before chaining cowork-end-cycle); (F-4) market-watcher OVERWRITE template itself exceeds the ≤80L cap it targets. DECIDED: two-class contract (OVERWRITE: po/market-watcher ≤50-80L; APPEND: CHEF/news-scout/bctc-analyst/agents-architect ≤200L with AC-2b intra-section prune for permanent accumulator headings); L95 TODO resolved. 5 flow/skill edits scoped for agent-father (S-1 chef.md Step 8, S-2 bctc-analyst stage-log-notify, S-3 news-scout stage-log-notify, S-4 market-watcher cycle.md Step 5, S-5 notebook-write SKILL).

**Signal dropped:** `docs/data/orch/orch-state.json` `.signal_queue` row (from:agents-architect, to:po, type:brief_complete)
