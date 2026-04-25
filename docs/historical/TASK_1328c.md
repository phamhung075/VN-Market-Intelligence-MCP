# TASK 1328c — DB migration: add 3 columns to agent_signals

**Sprint:** 1328 | **Phase:** 1 | **Layer:** infrastructure/db | **Size:** S
**Status:** Todo | **Depends on:** 1328a merged | **Blocks:** nothing

---

## Files to change

1. `apps/mcp-server/src/infrastructure/db/schema-news.ts`
2. `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts`

---

## Change 1 — schema-news.ts

**Injection point:** After the last `ALTER TABLE agent_signals` block (line 93, after `signal_class` column).

Add three idempotent ALTER TABLE blocks following the existing `try/catch` pattern:
```typescript
// Task 1328c — new signal context columns
try { db.exec(`ALTER TABLE agent_signals ADD COLUMN news_sentiment REAL`); } catch {}
try { db.exec(`ALTER TABLE agent_signals ADD COLUMN kinh_dich_confidence REAL`); } catch {}
try { db.exec(`ALTER TABLE agent_signals ADD COLUMN agent_signals_majority TEXT`); } catch {}
```

---

## Change 2 — agentSignalStore.ts

### 2a — Extend PostSignalInput interface (after `validated_at` field, ~line 126)

```typescript
/** Task 1328c — From ChainCatalystFindingData.newsSentiment [-1.0, 1.0] */
newsSentiment?: number | null;
/** Task 1328c — From ChainCatalystFindingData.kinhDichConfidence [0, 100] */
kinhDichConfidence?: number | null;
/** Task 1328c — From ChainCatalystFindingData.agentSignalsMajority */
agentSignalsMajority?: "BUY" | "SELL" | "NEUTRAL" | null;
```

### 2b — Update postSignal() INSERT

Find the INSERT statement in `postSignal()`. Add the 3 new columns to the column list and bind the values as parameterized `?` placeholders:
- `news_sentiment` ← `input.newsSentiment ?? null`
- `kinh_dich_confidence` ← `input.kinhDichConfidence ?? null`
- `agent_signals_majority` ← `input.agentSignalsMajority ?? null`

**Security:** Use parameterized binding only. Never string-interpolate these values into SQL.

---

## Migration safety

- `try/catch` pattern is idempotent — safe on production DB with existing rows
- New columns default to NULL — no backfill needed
- `finding_data` JSON also stores these values (from 1328a) — dual storage for backward compat

---

## Test file

`apps/mcp-server/src/__tests__/1328c-db-migration.test.ts`

- `initDatabase()` on fresh DB → `agent_signals` has 3 new columns
- `initDatabase()` on existing DB (existing schema) → no error, columns added
- Insert signal with all 3 new fields → query back → values match
- Insert signal without new fields → query back → new columns are NULL

---

## Acceptance criteria

- [ ] 3 ALTER TABLE blocks added after line 93 in schema-news.ts
- [ ] `PostSignalInput` has 3 new optional fields
- [ ] `postSignal()` INSERT binds the 3 new columns with parameterized `?`
- [ ] `bun test --grep "1328c"` passes
- [ ] `bun tsc --noEmit` clean
