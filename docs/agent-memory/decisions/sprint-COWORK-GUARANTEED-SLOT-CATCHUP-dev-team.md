# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-team

**Sprint goal:** Cowork guaranteed-slot catch-up (active sprint per orch-state.json .sprint_goal.entries[]).
**Agent:** dev-team
**Started:** 2026-07-30T21:36:00Z

---

### STEP dev-team-S1 · dev-team · 2026-07-30T21:36:00Z
**task-id:** FIX-SIGNALQUALITYAUDIT-WRITE-GATE-UNREACHABLE-BY-EMITTER-CONTRACT
**what-done:** RAW-verify (not self-report trust) of dev-mcp-server's REVIEW-flip return. Diffs (signalValidator.ts, agentSignalTools.ts, signalQualityAuditStore.ts, signalTypes.ts) content-match claims exactly. Host-side `tsc --noEmit` clean (0 errors, ran via local bun+node_modules to avoid re-touching the live container after an unrelated `docker exec bun run tsc` OOM'd and auto-restarted mcp-server mid-probe — container came back healthy on its own restart policy, no data loss). New test file re-run independently: 13/13 pass.
**what-considered:**
- Trust commit's stated live-DB probe numbers vs re-derive them myself — re-derived: queried `data/live/market.db` directly (bind-mount, confirmed `Type=bind` via `docker inspect`, NOT the stale-decoy named-volume case a prior memory warned about — that memory is now stale for this deployment and needs correcting separately).
- **Found a real discrepancy**: commit message claims "urgent_news 9/9 rows since 2026-06-05 carry regime_adjusted_score." Live query (any scope: signal_type=urgent_news, from_agent=news-scout, or unfiltered) finds a MAX of 3 rows with `regime_adjusted_score` ever, not 9 — 6 of the 10 "urgent_news"-typed rows since 2026-06-05 are actually `freshness-sla-monitor`'s own self-generated SLA-breach alerts (finding_data='{}', not real news), and 1 real news-scout row (id 8716) carries NEITHER `confidence` nor `regime_adjusted_score`. The AC's own decisive question ("signals posted but confidence absent?") is still independently confirmed TRUE (0/10 carry confidence) — that finding is correct — but the extra "9/9 regime_adjusted_score" elaboration beyond the AC's ask is a confabulated/miscounted figure, not grounded in the query it claims to be.
**why-decision:** the CODE fix is sound regardless (deriveAuditConfidence only fires when the field is actually present; returns null otherwise — verified via diff + independently-run test, not dependent on the wrong count), so this does not block REVIEW->QA. Recording the inaccuracy here (RAW-verify token, satisfies push-gate escape (ii)) so QA does not inherit the wrong "9/9" figure as ground truth.
**why-change:** none to the fix itself — pushing dev-mcp-server's commit as-is (43e0d7ddc) plus PO's own commit (ba6306e9a) under commit-mutex; not amending peer-authored commit messages.
