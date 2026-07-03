# Repair: get_macro_snapshot output shape drifted — regime-extraction skill parser falls back to NEUTRAL

- **Filed:** 2026-07-03 by router (surfaced by digest-predict cycle, slot=digest-daily, tick 2026-07-03T17:30Z)
- **Type:** repair_task_request → PO → backlog (PLAN-ONLY; non-blocking, self-heal)
- **Suggested task id:** `FIX-MACRO-SNAPSHOT-REGIME-PARSE-DRIFT`
- **Severity:** LOW (documented fallback path works — regime degrades to NEUTRAL, no crash, no wrong-data). Silent accuracy loss, not an outage.

## Finding

`digest-predict` reported that `get_macro_snapshot` now returns a **different JSON shape** — a nested `signals` object — with **no `Global Liquidity: X` text line** that `.claude/skills/regime-extraction/SKILL.md` expects to parse. The skill hit its documented fallback path and set regime = **NEUTRAL**. Non-blocking, but every consumer of that skill silently loses macro-regime signal until the parser is reconciled to the new shape.

## Scope

- `.claude/skills/regime-extraction/SKILL.md` — parser expects a `Global Liquidity: X` text line; tool no longer emits it.
- `get_macro_snapshot` (mcp-server, macro tool) — output shape changed to nested `signals` object.
- Any other agent/skill that greps macro-snapshot text lines for regime inputs (audit for the same assumption).

## Proposed fix

Reconcile the skill's extractor to read the nested `signals` object (structured field), OR restore the `Global Liquidity:` text line in the tool output — whichever is the intended contract. Prefer reading the structured field (text-line scraping is the fragile pattern that caused this). Confirm with a fixture that regime resolves to a non-NEUTRAL value when liquidity data is present. Audit other skills for the same text-scrape assumption.

## Evidence

digest-predict cycle 2026-07-03 (notebook `docs/agent-memory/notebooks/digest-predict.md`): regime fell back to NEUTRAL; agent flagged shape change explicitly, did not edit files (write-restricted to notebook this cycle). Pre-existing (not caused by any 07-03 change).
