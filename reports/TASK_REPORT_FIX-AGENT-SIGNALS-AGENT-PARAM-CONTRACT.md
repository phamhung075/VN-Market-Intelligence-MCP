## Task Report FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT
date: 2026-06-19
outcome: APPROVED

changed:
- apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts (schema optional + Path-C guard + ?? "")
- apps/mcp-server/src/__tests__/FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT.test.ts (NEW, 5 ACs)
- docs/agents/tools/list/get_agent_signals.md (Required→Conditional)
- docs/agents/tools/package/news-scout.md (conditional-required note)
- docs/agents/tools/package/alert-commander.md (conditional-required note)
- docs/agents/tools/package/tran-ngoc-bau.md (conditional-required note)

tests: 5 pass / 0 fail | tsc: 0 errors | ddd: PASS (pre-existing infra imports unchanged) | security: PASS

### RAW-Verify
- schema: `agent: z.string().optional()` at L461-463 — CONFIRMED
- Path-C guard: `if (args.from_agent === undefined && !args.agent)` at L527 → user-readable error, no DB query — CONFIRMED
- fallback: `args.agent ?? ""` at L535, L543 — CONFIRMED
- doc get_agent_signals.md: Required → Conditional, mode notes present — CONFIRMED
- doc news-scout.md: conditional-required — CONFIRMED
- doc alert-commander.md: conditional-required — CONFIRMED
- doc tran-ngoc-bau.md: conditional-required — CONFIRMED

### ACs (5/5)
- AC-1: inbox no agent → user-readable error, no DB query — PASS
- AC-2: sender-history (from_agent="news-scout") no agent → signals, no error — PASS
- AC-3: all-producers (from_agent=null, hours_back=0.25) no agent → all-producer signals — PASS
- AC-4: inbox agent="alert-commander" → backward-compat preserved — PASS
- AC-5: Zod safeParse x4 (sender-history, inbox, all-producers, both-omitted) — all .success true — PASS

### DDD Note
Infrastructure imports in agentSignalTools.ts (lines 21,32,34,35) are pre-existing from sprint-038 feat commit 70736fb3. This fix touched only schema lines 461-468 and handler guard lines 527-543. Not introduced by this change.

verdict: APPROVED
