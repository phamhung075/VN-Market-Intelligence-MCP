# PO Notebook

## Last updated: 2026-05-22T04:57:24Z · Cycle: c250 — Sprint 1968d Phase 4 kickoff

### c250 trigger
User direct demand (router-relayed): "continue token/tool-call economy hunt — do not idle — scope Sprint 1968d with next wave of levers". 17 minutes after c249 USER-BUG triage shipped 1971 to dev-stock-price. Fleet is NOT idle (1971 dev-team in flight, 1970/1972 queued, 9 OBSERVE gates standing), but user wants strategic parallel-track economy work. 1968d is `.claude/` agent-system scope — zero collision with active apps/* hotfix lanes.

### Survey of router's 7 candidate levers
| Lever | Verdict | Reasoning |
|---|---|---|
| L-10 handoff delta-read | **PICK** | Handoffs avg 130L+; QA/Fixer/Dev re-read full file per cycle. 50–150 KB/day saved. `.claude/skills/` zone — collision-free. |
| L-11 signal-bus batching | REJECT | Changes signal contract used by 10+ agents + dispatcher. High collision with active 1971 comms. Defer Phase 5. |
| L-12 notebook diff-write | **PICK** | Notebooks total 3349L; OVERWRITE pattern rewrites whole file each cycle. Section-overwrite saves ~10–20 KB/day write + preserves searchable history. `.claude/skills/notebook-write/` zone — collision-free. |
| L-13 TASKS.md row-level patch | REJECT | TASKS.md is now 146L (router said 250L — already trim). ROI too low. Re-evaluate if >200L. |
| L-14 per-zone caveman dict | **PICK** | Additive on base caveman; 10–15% extra zone-scoped compression. Zone field already in batch entries. `.claude/skills/caveman/` zone — collision-free. |
| L-15 pipeline-state delta-merge | REJECT | File is 11 lines. Delta overhead > rewrite cost. Skip permanently. |
| L-16 MCP gateway result cache | REJECT | Touches apps/mcp-server/ = same zone as 1970/1972 + stale-cache poisoning risk for alert verdicts. Defer to architect brief first. |

### Decision
**Sprint 1968d OPEN with 3 levers: L-10 + L-12 + L-14.** Wave 1 (parallel agent-father): P01+P02 both `.claude/skills/` siblings. Wave 2 (after P01+P02 QA APPROVED): P03 (L-14 zone dict may reference L-10 anchor pattern in examples, serial reduces rework).

### Why parallel-track is correct now
- 1971 is dev-stock-price zone (apps/stock-price/) + already shipped, in QA. Doesn't consume PO bandwidth.
- 1970/1972 are dev-mcp-server zone, WIP-gated on 1971 ship or DAILYDASH 22T16:30Z gate. Standing queue, not actionable yet.
- 1968d is agent-father .claude/ zone. NEW slot, no contention with any active dev-* lane.
- BA spec phase consumes zero dev-* WIP — purely document drafting.
- All 3 levers identical risk profile to closed Phase 1/2/3 (zero apps/* touch, zero Docker rebuild, zero schema, zero BCTC, zero cron).

### Phase 4 ROI tally
- **Combined target:** ~70–170 KB/trading-day I/O reduction + notebook history searchability + zone-aware caveman quality.
- **Cumulative with Phase 1+2+3:** ~50% cowork-cycle token efficiency already achieved + ~100 MCP-calls/day saved. Phase 4 extends to read-side/write-side bytes lane.
- **Phase 5 carry-forward inventory** (record at sprint close): L-11 signal-bus batching (needs architect brief), L-13 watchlist (re-eval at TASKS.md >200L), L-16 MCP gateway cache (needs cache-invalidation design brief).

### Actions completed this cycle
- docs/SPRINT_GOAL.md — appended Sprint 1968d block at top (preserves 1968c+1968 history).
- docs/signals/po-1968d-kickoff.json — emitted with full lever spec, wave plan, ROI summary, rejected-lever reasoning. NEXT=ba.
- docs/TASKS.md — single-row insert for 1968d-BA-SPEC at top of Backlog (above 1965d). Preserves all other rows.
- docs/pipeline-state.json — delta Edit: status → "qa-pending + ba-spec-pending", nextAgent → ba, activeTaskId expanded (1968d-BA-SPEC-PENDING + 1971-QA-PENDING + 4 others). 1971 routing preserved.
- Notebook overwritten (this file).

### Gates standing (unchanged from c249)
- `2026-05-22T16:30Z` — 1960-DAILYDASH AC-5.2 cron-fire gate (releases 1 WIP slot if PASS).
- `2026-05-22T21:00Z` — OBSERVE-1955e DEEP-HOLD unlock → 1967-06 + watchdog-4 actionable.
- `2026-05-23T03:00Z` — tasksMdJanitor cron #2 (verifies 1965d-JANITOR-PATHFIX).
- `2026-05-23T07:05Z` — OBSERVE-1957d BCTC 72h cadence.
- `2026-05-23T18:00Z` — 1965c soak ends.
- `2026-05-24T14:30Z` — OBSERVE-1907a-verify digest-predict Sunday fire.
- `2026-05-25T01:30Z` — OBSERVE-1955c vnstockFundamentalsRefresh.
- `2026-05-25Z` — 1941b signal-outcomes seed.
- BCTC NFR-3 freeze (1953-G-FAIL).
- Standing OBSERVE: 1957d, 1955c, 1955e, 1907a-verify, 1941b, 1922g, post-1945-verdict-resolution-scored-pct.

### Next PO triggers
1. **BA spec ready signal `docs/signals/ba-1968d-spec-ready.json`** → run `.claude/flows/po/review-ba-spec.md` to approve/reject 3 handoffs. ETA ~1.5h.
2. **1971 QA APPROVED signal** → PO close 1971 (separate cycle from 1968d). No PO action needed during dev-team ship phase.
3. **22T16:30Z DAILYDASH cron** → ops or system-auditor reports PASS/FAIL → if PASS, 1970 ready for dispatch.
4. **agent-father-1968d-p01-done + p02-done both received** → release Wave 2 (P03) dispatch.

### Lessons (carry-over + new)
- **L64 (NEW c250)**: Parallel-track strategic sprints are valid even with active SEV-1 hotfix IF zone-orthogonal. The WIP cap applies per zone-owner, not globally. 1971 is dev-stock-price slot; 1968d is agent-father slot; they share zero files. Explicit zone-pairing in the SPRINT_GOAL.md constraints section makes audit trivial.
- **L65 (NEW c250)**: When router proposes N candidates, the PO's job is to PRUNE — not implement everything. Each rejected lever must record reasoning IN the kickoff signal (not just the notebook) so future PO cycles + audit can trace why. L-16 in particular looked attractive (caching = "obvious win") but the cache-invalidation risk for alert verdicts is a known anti-pattern from 1945-verdict-resolution; needs architect brief first.
- **L66 (NEW c250)**: Phase 4 lever picks all live in `.claude/` agent-system scope — this is the safe lane for token-economy work because it's collision-free with apps/* dev hotfix lanes. Future Phase 5/6 hunts should default to this lane first; only cross into apps/* when explicitly required by lever semantics (e.g. L-9 server-side filter could not have lived in .claude/).
- L63 (c249): WIP-cap override criterion = "active vs passive". c250 inverse: when BA-spec workload is zero-WIP and zone-orthogonal, NO override needed — just open the parallel sprint.
- L62 (c249): SQL SELECT/Scan order mismatch in Go is silent-failure pattern.
- L61 (c249): Three-layer probe (API + DB + render) for data-render bug.
- L60 (c248): Silent degradation hides in default fallback; add self-check skill.
- L57: dispatcher NOTHING hints are SUGGESTIONS.
- L42..L56 retained.
- BCTC NFR-3 freeze; 1954c next structural unlock.
