## Post-Merge Review: SPRINT 1298 / 2026-04-24

### TASK 1298 — IMF Sentiment Classifier (test-only sprint)

**Modules analyzed**: 1298a-imf-domain, 1298b-imf-infra, 1298c-imf-signal-integration test files

**Pattern discoveries**: no new patterns. AC label re-use (AC-5 appears in both 1298b and 1298c headers) — harmless labeling drift, content non-overlapping.

**Risks identified**:
- Minor: actual file `1298c-imf-signal-integration.test.ts` diverges from TECH doc spec `1298c-imf-signal.test.ts` — doc artifact only, no runtime impact.
- AC-5 label claimed by both 1298b (cron) and 1298c (cascade rules) — different content, no duplication, cosmetic inconsistency only.

**Production code changes**: ZERO confirmed via git diff.

**Status**: APPROVED. All 8 FRs covered, 3 test files pass review, DDD clean, no `any` casts, import paths verified.

---

### Bug Fix: Telegram Channel Routing Violation / 2026-04-24

**Trigger**: news-scout sent ops diagnostic ("Data pipeline issue detected — vn-price-fetch stopped sending fresh data") to MARKET channel, violating Alert Commander exclusivity rule.

**Root cause**: Step 5 (System Health) in `01-news-scout.md` called `get_system_status` with no explicit routing rule for VPS/pipeline findings. RULES section said `NEVER send Telegram — Alert Commander does that` — too vague; agent interpreted it as "no market alerts" rather than "no send_telegram at all."

**Modules analyzed**: `.claude/agents/01-news-scout.md`, `.claude/agents/04-market-watcher.md`, `.claude/agents/02-financial-analyst.md`

**Systemic check**:
- `02-financial-analyst.md` Step 5: clean — only `submit_feedback`, no Telegram calls
- `04-market-watcher.md` Step 0-c: path was correct (submit_feedback) but summary line said "escalate to BUG channel" without explicit channel= value — ambiguous
- `01-news-scout.md`: gap confirmed in both Step 5 and RULES section

**Files modified**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/01-news-scout.md` — Step 5 + RULES (both duplicated copies)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/04-market-watcher.md` — Step 0-c summary (both duplicated copies)

**Pattern discoveries**: New pattern documented — see `docs/agent-memory/patterns/telegram-channel-routing.md`

**Status**: FIXED. No `channel="market"` exists in any analysis agent post-fix.

---

### SPRINT 1311 Design Verification / 2026-04-24

**Trigger**: PO requested TECH design for Sprint 1311 (5 tasks: 1311a, 1307a, 1308a, 1310a, 1309a).

**Finding**: All 5 tasks ALREADY COMPLETE. Implementations shipped before design call.

**Verification per task**:

| Task | File confirmed | Lines | Test file | Tests |
|------|---------------|-------|-----------|-------|
| 1311a | `schema-news.ts` | 148-156 (ALTER TABLE guards) | `1311a-schema-migration.test.ts` | 17 assertions, pass |
| 1310a | `vnstockStore.ts` | 60-120 (UNIQUE index + dedup) | `1310a-foreign-flow-dedup.test.ts` | 21 assertions, pass |
| 1307a | `intelligenceCycleJob.ts` | 629-634 (cooldown, no notified filter) | `1307a-macro-thresholds.test.ts` | 24 assertions, pass |
| 1308a | `sentimentClassifier.ts` | 205-214 (bán ra + hạ dự báo) | `1308a-sentiment-patterns.test.ts` | 35 assertions, pass |
| 1309a | `cascadeEngine.ts` | 1150-1167, 2824-2826 (agri exclusion) | `1309a-cascade-gaps.test.ts` | 40 assertions, pass |

**Suite total**: 6710 pass, 11 fail (pre-existing failures unrelated to sprint 1311).

**Pattern discoveries**: none new.

**Risks identified**: none — all fixes confirmed in production code, tests substantive.

**Status**: ALREADY_COMPLETE. TASKS.md updated to Done. No TECH doc required.
