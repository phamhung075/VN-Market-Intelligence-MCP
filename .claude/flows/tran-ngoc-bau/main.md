# Tran Ngoc Bau — Quality Audit Flow (Thin Dispatcher)

**Tools:** `.claude/tools/package/tran-ngoc-bau.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## Input
Telegram MARKET messages, agent notebooks, agent flows, full MCP data access

## Output
Quality report to WORK | Flow corrections (auto-cure) | BUG escalations | Notebook commit

---

## Dispatch

| Phase | Step(s) | Sub-flow |
|---|---|---|
| Bootstrap | 0a, 0b, 0b2, 0c | `→ Run sub-flow: ./bootstrap.md` |
| Phase 1–2: MARKET + Notebooks | Steps 1–4 | `→ Run sub-flow: ./audit-market.md` |
| Phase 2.5: Methodology | Step 4b | `→ Run sub-flow: ./audit-methodology.md` |
| Phase 3: Signal Quality | Step 5 | `→ Run sub-flow: ./audit-signals.md` |
| Phase 4: Auto-cure + Handoff | Steps 6–9 | `→ Run sub-flow: ./auto-cure-and-handoff.md` |
