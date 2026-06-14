# agents-architect — Notebook

## 2026-06-14T12:18:16Z

**Brief:** `docs/architecture-briefs/2026-06-14-dev-team-tool-contract-cron-overlap.md`

DEV-TEAM-TOOL-CONTRACT-CRON-OVERLAP: two-finding brief from 10-session cron audit. F1: six recurring tool-call error classes (server string, meta-tool misrouting, name guessing, task_id type, send_telegram enum/field, stale-read) burning turns every session — fix by creating `docs/standards/gateway-call-contract.md` (~60L canonical contract) and adding a GCC-PREFLIGHT read directive at top of dev-team/flow/main.md Step 0-PREFLIGHT. F2: cron fires every 60min but ticks run up to 3h28m → concurrent sessions; TTL-scoped orphaned locks cause SKIP failures on restart — fix by adding SF-1 single-flight session lock (task_claim key="dev-team-cron-singleton" TTL=5400s) at PREFLIGHT entry with heartbeat at Step 3 and release at session exit. Cron schedule unchanged. Doc/flow only — no production code. 3 agent-father tasks; F1-B + F2-A serialize on same file.

**Signal dropped:** `docs/signals/dev-team-tool-contract-cron-overlap-20260614T121816Z.json` → agent-father

---

## 2026-06-14T14:19:52Z

**Brief:** `docs/architecture-briefs/2026-06-14-workflow-protocol-coherence-audit.md`

WORKFLOW-PROTOCOL-COHERENCE-AUDIT: post-implementation coherence check on SF-1 + gateway-call-contract.md. (A) SF-1 CLEAN at runtime — 6 lock namespaces verified disjoint; one doc gap: task-lock-protocol.md missing session-singleton subclass row + TTL-only release semantic. (B) Cowork-team already protected by leader-lock (SF-1 equivalent); system-auditor/health-recheck LOW exposure — generalize as named pattern in task-lock-protocol.md, defer implementation. (C) gateway-call-contract.md confirmed DAG orphan: absent from tree-map.md and CLAUDE.md; only linked from dev-team flow. (D) stale-read ×22 has no structural protocol mandate; fix: add re-Read invariant section to agent-chaining-protocol.md. 6 agent-father tasks: P1×2 (tree-map + task-lock-protocol), P2×2 (agent-chaining + CLAUDE.md pointer), P3×2 (leader-lock comment + mcp-tools cross-link). All doc-only.

**Signal dropped:** `docs/signals/workflow-protocol-coherence-audit-20260614T141952Z.json` → agent-father

---

## 2026-06-14T18:06:57Z

**Brief:** `docs/architecture-briefs/2026-06-14-07-06-methodology-upgrade.md`

07-06-METHODOLOGY-UPGRADE: full macro/top-down layer implementation from 07-06 expert roundtable (T-15..T-45). Created 2 new cowork skills: macro-health-read (Báu "two trucks → six tracks" — 6-track JSON, degraded→live upgrade path) and trade-fx-pressure-decomp (Thành BOP anatomy — FX-incidence verdict, NEGATIVE-MARGIN-TRAP flag, duration prior). Extended 2 existing skills: regime-extraction (PMI MA3 T-16) and four-factor-synthesis (decompose-before-conclude 3-question gate T-44). Upgraded 6 agent flows: market-watcher (T-20/21/27/28/32/41/43), unified-agent/CHEF (T-31 fiscal-trap, T-39 BOP walk, macro-health-read as Layer-1 source), digest-predict (T-23 bank-survey, T-42 duration prior), bctc-analyst (T-19 price_driven, T-37 intercompany-loss), news-scout (T-41 fake-FDI), tran-ngoc-bau (T-45 adversarial gate). Tree-map updated with both new skills + TNB skill backfill. All files implemented directly. PO owns the 5 new MCP tools in parallel lane.

**Signal dropped:** `docs/signals/07-06-methodology-upgrade-20260614T180657Z.json` → agent-father
