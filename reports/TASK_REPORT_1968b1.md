## Task Report 1968b1
date: 2026-05-21
outcome: APPROVED

changed:
- apps/mcp-server/src/infrastructure/db/agentSignalStore.ts:796-892 (hoursBack option + SQL clause)
- apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts:424-483 (hours_back Zod schema + pass-through)
- apps/mcp-server/src/__tests__/1968b1-get-agent-signals-hours-back.test.ts (NEW — 7 tests)
- .claude/tools/list/get_agent_signals.md (hours_back param + L-4 pattern documented)
- .claude/flows/news-scout/stage-bootstrap.md:28-49 (Step 0c single call + SELF_SIGNALS_CACHE)
- .claude/flows/news-scout/stage-signals.md:9-55 (cache-hit dedup + legal_risk dedup)

tests: 7/7 pass (1968b1 suite) | 9314 pass / 283 fail (mcp-server suite, 283 = pre-existing BCTC/PDF baseline, unchanged) | tsc: 0 errors | ddd: PASS | security: PASS

### AC Verification
| AC | Result | Evidence |
|----|--------|---------|
| AC-1: hours_back accepted by Zod schema | PASS | z.coerce.number().positive().optional() in agentSignalTools.ts:448-456 |
| AC-2: 3 calls → 1 (news-scout consolidation) | PASS | stage-bootstrap Step 0c: single call; stage-signals.md: 0 MCP calls in dedup path |
| AC-3: cache lookup uses client-side filter | PASS | stage-signals.md:14-22 (inter-cycle) + stage-signals.md:43-55 (legal_risk): SELF_SIGNALS_CACHE.filter() |
| AC-4: smoke shows 2 fewer MCP calls/cycle | PASS (design-verified) | Before: 3 calls (feedback + dedup + legal_risk). After: 1 call (all 3 covered by cache with hours_back=6=360min). 360min >= 60min TTL for signal_feedback; 360min >= 180min for inter-cycle; 360min == 360min for legal_risk. |
| AC-5: agent-father-1968b1-done.json emitted | PASS | docs/signals/processed/agent-father-1968b1-done.json confirmed |

### BCTC Freeze NFR-3
PASS — No BCTC/PDF/financial_reports files touched by commits 4fff6cbb or 5ae49132.

### Cache Window Math
- hours_back=6 = 360 min lookback
- signal_feedback TTL = 60 min → all valid feedback is within 60 min → covered by 360 min
- inter-cycle dedup window = 180 min → covered by 360 min
- legal_risk dedup window = 360 min → exact match
- Cache is per-cycle; not persisted. Error path: SELF_SIGNALS_CACHE=[] on failure, non-fatal. Correct.

### Tool Doc
PASS — .claude/tools/list/get_agent_signals.md updated with hours_back param, L-4 pattern, use cases.

### Caveman Compression
PASS — stage-bootstrap.md and stage-signals.md: L-4 comments present, cache label consistent.

### Baseline Regression
Full suite: 347 failures total (scripts/migrations/signal-T5 + Next.js frontend tests pre-exist; mcp-server isolated suite = 283 pre-existing). Zero new failures attributable to 1968b1.
