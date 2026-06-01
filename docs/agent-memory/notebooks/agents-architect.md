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

## Carry-over

- market-watcher/cycle.md Step 5 append/overwrite drift: confirm agent-father applies fix in same pass as frontmatter edit (§12c market-watcher row).
- OQ-1 through OQ-4 from §10 of 1951b brief remain open for agent-father to resolve before Phase 3 QA.
- L-1 alert-commander: verify whether 1963-MW-IDENTITY fix (agent-father 2026-05-21) already promoted mcp-tools.md to always_load — if yes, L-1 for alert-commander is a no-op.
