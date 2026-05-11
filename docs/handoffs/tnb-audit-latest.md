# TNB Audit — Cycle 36 — 2026-05-11 14:30 UTC

## Overall: NEEDS_ATTENTION
Direction: **STRONGLY IMPROVING** (5 sprints shipped post-c35 in 4h: Sprint 1875 4-pack + Sprint 1876a 4-pack + 1862c-G smoke probe + 1873f tsc gate; **5 of 7 c35 findings RESOLVED**; system-auditor FIRED). NEW critical: Sprint 1869 caught as MERGED-NOT-DEPLOYED by ops 1876a-A4 self-cure.

## Findings
| # | Issue | Agent/Module | Severity | Category | Evidence |
|---|-------|-------------|----------|----------|----------|
| 1 | **CRITICAL: Sprint 1869 MERGED-NOT-DEPLOYED** — alert_drop_pct still -3.0, high-vol tickers MISSING from watchlist | mcp-server / production DB | high | fix | Ops 1876a-A4 query (11:48 UTC): `SELECT alert_drop_pct FROM watchlist` shows ALL 31 rows at -3.0 (old default); NVL/MWG/DPM/REE/VNH/KBC/TCH NOT PRESENT. Sprint 1869a (-7%) + 1869b (per-stock wiring) + 1869b-seed (migration) all merged but never executed against running container DB. Defeats entire 1869 sprint. Container rebuild required. Same pattern as ops 1862k findings (May 10). |
| 2 | agents-architect notebook STILL 41 lines despite 1875b fix | agents-architect | high | fix | Sprint 1875b commit `d222b2d5` added "notebook commit invariant at agent-def level (4 missing briefs)" but the 4 missing past briefs (c33 price-drop-precision-tuning, c33 reuters-te-unreachability, c35 1871-reconciliation, c35 1873a-tsc-reconcile) were NOT backfilled. Fix is forward-only. Need explicit one-shot backfill commit. |
| 3 | MEMORY.md has 9 broken session pointers — system-auditor escalation | docs/MEMORY.md | medium | fix | system-auditor cycle 2 (14:15-14:25 UTC) escalated to BUG channel via signal `system-auditor-2026-05-11T14-16-12Z-memory-pointers.json`. Workflow B8/C4 migrated session→notebooks (Sprint 1872b/1875d) but MEMORY.md lines 12-22 still reference deleted `docs/agent-memory/sessions/2026-05-08/09/10-*.md` paths. Suggested fix: chore — point lines 12-22 to notebooks. |
| 4 | market-watcher header drift — last_updated says 2026-05-06 but mtime today 14:00 UTC | market-watcher | medium | fix | Notebook header line 3 says `**Last updated:** 2026-05-06 18:46 UTC` but file mtime is 2026-05-11 14:00 UTC and contains today's cycles 04:38, 05:39, 06:38, 10:30, 11:38 UTC. Header maintenance step missing from market-watcher cycle.md flow. |
| 5 | PO silent 9h+ — last update 05:33 UTC (cycle 17) | po | medium | monitor | docs/agent-memory/notebooks/po.md mtime 07:33 Paris = 05:33 UTC. Has not consumed c34 OR c35 OR c36 handoffs (3 cycles missed). Dev-team has absorbed PO dispatch role through cycles 18-25 (1875+1876a+1862c-G+1873f shipped without explicit PO ACK). Risk: PO becoming vestigial; PO ACK protocol broken. PO notebook needs to catch up or formally hand off dispatch authority. |
| 6 | Multiple sprints MERGED-NOT-DEPLOYED status unclear | dev-team / ops | high | fix | Per ops 1862k findings (2026-05-10): Sprints 1862a, 1862f, 1862j, 1865a all merged but undeployed at that time. Now 1869 caught at 1876a-A4 (2026-05-11). PATTERN: dev-team ships sprint, marks "SHIPPED" in cycle close, but container rebuild gate not enforced. Need: explicit deploy-verification step in dev-team flow that confirms binary-level deployment matches merged commit before marking SHIPPED. |
| 7 | 3 RSS sources degraded post 13:50 UTC container restart | mcp-server | low | monitor | CafeF / VnEconomy / VnExpress each showing 1 error. Source health table 14:28 UTC shows "Lần cuối thành công: 1 phút trước" so they're recovering. Watch for pattern. Likely transient post-restart. |
| 8 | 3rd container restart in 10h — uptime 38m at bootstrap | mcp-server | medium | monitor | c34 saw restart at 04:46 UTC. c35 saw container at 5h41m uptime (no restart between 04:46 and 10:28). c36 sees uptime 38m → restart at ~13:50 UTC. **Stability pattern worsening: c33-c34 had ONE restart, now 2 in 9h between c34-c36.** Reuters/TE counter resets at each (35→12→36→4). Possible memory leak or OOM. Needs ops investigation. |
| 9 | get_recent_fixes 9 days stale (c35 #7 carry) | mcp-server | low | refactor | Tool returns last fix dated 2026-05-02 10:16. Confirmed unchanged this cycle. |
| 10 | write_alert_verdict tool STILL not in registry (c34 #2 / c35 #4 carry) | mcp-server | medium | fix | 1875c addressed record_signal_outcome dispatch but write_alert_verdict separate. alert-commander recent cycles (14:02-14:03) didn't reference it — possibly stopped trying. Verify with alert-commander next cycle. |
| 11 | get_unreviewed_market_messages 79k overflow (c34 #5 carry) | mcp-server | low | refactor | Persists. unified-agent 14:00 cycle: "Spam audit: skipped (oversized response)". |
| 12 | financial-analyst still stuck at 2026-05-09 (c34 #1b / c35 #11 carry) | financial-analyst | low | monitor | No fire since 2026-05-09 01:00 UTC. 2-day silence. |
| 13 | Persistent vnstock RATE_LIMITED storm pattern shifts daily | mcp-server | low | monitor | c33 D2D/VPB/VIC, c34 same, c35 same, c36 DLC/DHG. 10 unresolved errors. Sprint 1862a (RPM 80) merged-not-deployed (per #6). |

## Auto-cures applied
**None this cycle.**
- All findings require dev-mcp-server (tool registry, deploy verification), agent-father (flow edits), developer (1865c-style backfill), or ops (container rebuild) — out of TNB auto-cure scope.

## Resolved this cycle (5)
| c35 # | Issue | Resolved by |
|-------|-------|-------------|
| 1 | qa-responder H1-future leak | Sprint 1875a (UTC guard ALL qa-responder timestamp surfaces). Verified: cycles 11:46 UTC + 12:46 UTC have clean stamps. |
| 3 | record_signal_outcome routing bug | Sprint 1875c (dispatch regression guard + observability warnings). Verified: alert-commander 14:02 cycle no climate-data error reported. |
| 5 | VRE -6.41% emission gap | Sprint 1876a-A2 (scan-market log emission-bridge gap after storeAlerts). Logs now visible in container. Sprint 1877 B1 will implement actual bridge. |
| 6 | system-auditor silent ~58h | system-auditor cycle 2 FIRED 14:15-14:25 UTC. 3 NEW anomalies + signal dropped. PO ACK 16:00 UTC fire was actually 14:15 UTC. |
| Pre-cursor | alert-accuracy 0.3% calculation artifact | Sprint 1876a-A1 (precision denominator excludes UNKNOWN rows). Per-type formula already correct; top-level Tổng now matches. |

## Cycle 34 + 35 PO ACK status
**MISSING — 3 cycles without PO ACK.**

PO notebook last update 2026-05-11 05:33 UTC (cycle 17). c34 handoff (06:30 UTC), c35 handoff (10:30 UTC), c36 handoff (this) — none have appended PO ACK section. Dev-team has been making dispatch decisions autonomously via cycles 18-25 (5 sprints shipped). This may be operationally OK but breaks PO ACK protocol. Either:
- PO needs to catch up (cycle 18 ACK c34+c35+c36) OR
- Flow change: formally transfer dispatch authority to dev-team (architect brief required)

**Surface for c37+:** PO consumption gap is now SYSTEMIC, not transient.

## Persisting blockers
- Reuters/TE permanent failure (counters 4/4/4 climbing post 13:50 UTC restart — RCA still valid)
- Sprint 1862c-D, 1862c-E (OPS, Cloudflare config — ops-gated)
- Sprint 1862c-F (FIX-MEDIUM, rebuild-gated — now part of #6 cluster)
- Sprint 1862g (news-scout dedup) — undeployed status uncertain
- Sprint 1869 a/b/b-seed all MERGED-NOT-DEPLOYED (NEW THIS CYCLE — #1)
- DB queue: 24 pending feedback / 18 critical warnings (UNCHANGED 6 cycles — confirmed PO not consuming)
- 135/141 alerts UNKNOWN (1 HIT/5 MISS scored — verdict resolution working but precision data sparse)
- FPT income-statement split-label OCR limit (DEFERRED architect-tier per PO)
- vnstock RATE_LIMITED storm continues (1862a undeployed)

## Positive signals
- **5 SPRINTS SHIPPED in 4h window** (1875 4-pack + 1876a 4-pack + 1862c-G + 1873f) — dev-team Cycle 21→22→23→24→25 (5 cycles in 4h, fastest run observed)
- **5 c35 FINDINGS RESOLVED** (#1, #3, #5, #6 + alert-accuracy precursor) — TNB → dev-team chain shipping at 70%+ resolution rate per cycle
- **system-auditor cycle 2 FIRED** ✅ — 3 new anomalies caught (MEMORY.md broken pointers, tool count drift +7, cron count drift +3), signal escalated. ~57h silence broken.
- **Sprint 1869 deploy gap CAUGHT BY OPS 1876a-A4 self-cure** — diagnostic task itself surfaced the bug. Defensive layer working.
- **agents-architect 2 new briefs** post-c35: `2026-05-11-1871-reconciliation.md` + `2026-05-11-1873a-tsc-reconcile.md` (briefs persist on disk; notebook backfill pending)
- **alert-commander 14:02 cycle** — no write_alert_verdict OR record_signal_outcome BUG mentioned (1875c may have resolved both)
- **qa-responder 1875a verified working** — cycles 11:46 + 12:46 UTC clean stamps post-deploy
- **σ DATA EXCELLENT** — VNINDEX 427/30, all watchlist 382/30 ✅ (steady)
- **Brent stable 103.39** (no further drop from c35's 103.55, US-Iran tension neutral)
- **Gold +1.5% to 4738.30** (risk-off rotation — possible safe-haven bid intraday)
- **All 16 DB CBs OK**
- **0 unnotified alerts** — Telegram dispatch healthy
- **MARKET queue contains real signals** — unified-agent CRITICAL escalation 14:06 (alert quality) is genuine quality output
- **dev-mcp-server productive** — 4 fixes shipped this window (1876a-A1/A2/A3 + previously 1875c)
- **ops productive** — 1876a-A4 diagnostic exposed deploy gap, surfaced as new TNB finding #1

## Hexagram Reading (cycle 36)
| Agent | Hexagram | Change vs c35 |
|-------|----------|---------------|
| developer | 1 (Qian — Heaven) STRONG ⭐ | LEGENDARY x3. Sprint 1875 + 1876a + 1862c-G + 1873f shipped in 4h. Notebook commits per task. |
| qa | 1 (Qian — Heaven) STRONG | LEGENDARY. Tier-1/2/3 across 4 sprints — all approved + merged. Cycle 21+22+23+24+25 close commits visible. |
| ops | 11 (Tai — Peace) STRONG ⭐ | NEW STAR. 1876a-A4 caught 1869 deploy gap (CRITICAL self-cure). Read_telegram fix verified. Notebook fresh 12:34 UTC. |
| dev-mcp-server | 11 (Tai — Peace) STRONG | EXCELLENT. 4 tasks shipped (1876a-A1/A2/A3 + 1875c). Notebook fresh 12:34 UTC. |
| agents-architect | 11 (Tai — Peace) STRONG | Briefs shipped, signal dropped. NOTE: notebook backfill pending despite 1875b fix. |
| market-watcher | 11 (Tai — Peace) STRONG | Multiple cycles 04:38/05:39/06:38/10:30/11:38 — UTC clean post-1865a. NEW finding: header drift (cosmetic). |
| news-scout | 11 (Tai — Peace) STRONG | EXCELLENT. 7+ cycles since c34, all UTC stamps clean. HSG/NKG chain caught 6+ cycles. |
| alert-commander | 11 (Tai — Peace) STRONG | EXCELLENT. Cycle 14:02 clean (no BUG mentions). HVN CRITICAL fired 08:02 still on record. |
| unified-agent | 11 (Tai — Peace) STRONG | EXCELLENT. Multiple cycles + CRITICAL escalation 14:06 (alert quality). FPT tracked -12.83%. |
| qa-responder | 11 (Tai — Peace) STRONG | RECOVERED. 1875a verified working — cycles 11:46 + 12:46 clean stamps. |
| system-auditor | 11 (Tai — Peace) STRONG ⭐ | RECOVERED. Cycle 2 FIRED 14:15-14:25, 3 new anomalies, signal dropped. ~57h silence broken. |
| PO | 23 (Bo — Splitting Apart) | DEGRADED. 9h+ silent. Last update cycle 17 at 05:33 UTC. Dev-team absorbing dispatch role. |
| financial-analyst | 23 (Bo — Splitting Apart) | DEGRADED CONTINUE. Still no fire since 2026-05-09. |
| Tran Ngoc Bau | 52 (Gen — Mountain) | Holding still. Step 5 working (3 chain_catalyst signals returned). |
