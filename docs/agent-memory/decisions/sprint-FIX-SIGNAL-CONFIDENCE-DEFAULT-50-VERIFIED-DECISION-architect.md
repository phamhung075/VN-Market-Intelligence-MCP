# Decision Journal — FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION (architect)

**task_id:** FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION
**agent:** architect
**date:** 2026-06-23T18:10Z
**sprint:** S2-DATA-HONESTY

---

## CONF-1: Severity-to-int placement

**What considered:**
- (A) Shared helper in `alertUtils.ts` — requires a new file + import in alertStore.ts; only two callers in the same file; overkill.
- (B) Import `SEVERITY_VI` from `interface/mcp/tools/sector/severityLabels.ts` and extend — DDD violation (interface imported into infrastructure); also wrong type (string→ViLabel, not int).
- (C) Inline module-private `severityToConfidence()` in `alertStore.ts` — chosen.

**Why change from default:** NFR-B (both callpaths identical) is trivially satisfied by a single function in the same file. No future callers exist. DDD golden rule preserved.

---

## CONF-2: PostSignalInput.confidence_score type

**What considered:**
- Current type: `number | undefined` (line 134), destructure default `= 50` (line 341).
- (A) Keep as `number | undefined`, only change default from `50` to `null` — TypeScript error: cannot assign `null` to `number | undefined`.
- (B) Widen to `number | null | undefined`, change default to `null` — chosen.

**Why change:** Honest absence requires null. Type widening is additive — zero callers break.

---

## CONF-3: Alert-commander cowork post path

**What considered:**
- Hypothesis: alert-commander reads `assembleBriefing().topConviction.score` and feeds it into a `post_agent_signal` verified_decision call.
- Evidence: assembleBriefing.ts grep shows `topConviction` is a `DailyBriefing` struct member (line 1063–1093), NOT a DB write. Alert-commander does not call `assembleBriefing`.
- Alert-commander fires `verified_decision` via `post_agent_signal` MCP tool — this hits Path B. Path B fix (FR-3 null pass-through) already covers it.
- Exhaustive grep: only 2 INSERT sites for `verified_decision` in production code (both in alertStore.ts). All other references are type definitions, schema, or docs.

**Why no FR-6:** Prior fix failure was not a missed producer — it was the incomplete execution of FR-1 and FR-2 (Path A untouched, DEFAULT not removed). Cowork path goes through the MCP tool handler which will correctly store NULL after FR-3 fix.

---

## CONF-4: Frontend null-render scope

**What considered:**
- (A) Same task as backend — rejected: different zone (`apps/frontend/` vs `apps/mcp-server/`), 3-file change in frontend, and depends on backend being deployed to have null rows in DB to test.
- (B) Separate dev-frontend sub-task — chosen.

**Root:** `client.ts:350` maps `null` to `0` (not `null`). `domain/market.ts:217` typed as `number` not `number|null`. Three-file change required. Not a one-liner.

---

## SQLite ADD COLUMN live status

Live named-vol DB already has the column (3316 rows prove it). DEFAULT removal in schema-news.ts:104 affects fresh DBs only. Live DB unaffected at deploy. 5 test `makeDb()` helpers carry `DEFAULT 50` and must change to avoid self-confirming test failure.

---

## Task atomization rationale

Two zones = two tasks, sequential (frontend depends on backend deploy for AC-3 verification):
- TASK-CONF-1: dev-mcp-server, 5 files + new test + update 5 existing test helpers, ~2h
- TASK-CONF-2: dev-frontend, 3 files, ~1h, BLOCKS_ON TASK-CONF-1 done_verified
