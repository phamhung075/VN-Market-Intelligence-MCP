**Part of:** [Agent Creation Guide](../AGENT_CREATION_GUIDE.md)

---

## 4. Lazy-Load Protocol

Agents start with minimum context. Load more only when the current step requires it.

**Core principle: every token loaded must earn its keep.**

---

## L0-L4 Load Levels & Anti-Patterns

→ see [guide-lazy-load-levels.md](./guide-lazy-load-levels.md)
- L0-L4 load level definitions and token budgets
- Anti-Pattern 1: redundant re-fetch (biggest waste)
- Bootstrap as primary cache — NEVER re-call `get_market_context()`, `get_agent_signals()`, etc.

---

## Anti-Patterns & Trigger Rules

**Anti-Pattern 2: always_load waste** — Use `lazy_load` with triggers instead. Only `fail-loud-protocol.md` should be in `always_load`.

**Anti-Pattern 3: Over-splitting knowledge** — Each knowledge file should be self-contained. If a file is loaded every 3 cycles, consider merging.

**Anti-Pattern 4: Agent loading full agent definitions** — Agents should NOT load other agents' full `.claude/agents/*.md` files. Use notebooks instead.

**Trigger naming convention:** `trigger: event_name` — examples: `policy_updated`, `sprint_start`, `code_change`, `post_merge`.

---

## Token Economy Summary

Every knowledge file is a decision: **Is this information loaded often enough to pay for its token cost?** If not, delete or convert to notebook.

- Bootstrap (L1b) = best ROI — 1 call, 5,000 tok, replaces 3 separate calls
- Notebook (L1) = cheap insurance — 300 tok, prevents re-analysis of 200 tok data
- Knowledge (L2) = on-demand specialist info — load only when step needs it
- Cross-team (L3) = decision context — cheap but don't load >2/cycle
