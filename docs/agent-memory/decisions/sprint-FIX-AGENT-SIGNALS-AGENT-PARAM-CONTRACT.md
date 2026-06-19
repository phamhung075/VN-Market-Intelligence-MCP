# Decision Journal — FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT

**task_id:** FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT
**date:** 2026-06-19T00:00Z
**agent:** architect
**mode:** BUG-FIX (schema contract alignment)

---

## What was considered

**Option A — make `agent` optional-when-not-inbox-mode (schema relaxation):**
- `agent` becomes `z.string().optional()`
- Handler gets an early-return guard: if `from_agent===undefined && !agent` → return user-readable error
- Callers that already pass `agent` (alert-commander, tran-ngoc-bau) are unaffected
- Three live flow callers that omit `agent` (news-scout ×2, market-watcher ×1) start working correctly without any flow doc change
- Matches the existing `getSignals()` DB layer which already ignores the `agent` param when `fromAgent` is set (L877)
- One schema file change + one-line handler guard + 4 doc updates

**Option B — keep `agent` required, fix all callers:**
- Add `agent` to 3 flow doc call sites (news-scout stage-bootstrap.md ×2, market-watcher main.md ×1)
- Those callers pass `agent` as their own name (e.g. `"news-scout"`) even in sender-history mode where it is silently ignored by the DB layer
- Risk: future maintainer reads the flow call and assumes `agent` is the inbox receiver being filtered — misleads logic
- Doc remains misleading (says required, but in Path B the value is thrown away)
- More files touched, more merge surface, no correctness benefit

## Why Option A

- **Caller intent is correct today in the flow docs** — the 3 omitting callers are right; the schema is wrong relative to them
- **`agent` is dead in Path B at the DB layer** — making it required is a schema lie
- **Path A never touches `agent` at all** — requiring it is pure noise
- **Less merge surface** — A changes 1 TypeScript file + 4 doc files; B changes 3 flow files + 4 doc files
- **Additive change** — relaxing optional never breaks existing required callers

## what-considered

- Option A (chosen): schema relaxation + handler guard
- Option B (rejected): enforce at all callers, keep schema required

## why-change

- Schema required on `agent` is a contract lie for Paths A and B; only Path C (inbox) genuinely needs it; relaxing to optional and guarding Path C is the minimal correct fix
