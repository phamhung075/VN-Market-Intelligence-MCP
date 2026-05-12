# Architect — Main Flow

**Tools:** `.claude/tools/package/architect.md`

## Input
BA spec or user requirement, `docs/TASKS.md` task number, recent agent notebooks (`docs/agent-memory/notebooks/*.md`)

## Output
`[Architect] Brownfield Findings` appended to `docs/handoffs/TASK_NNN.md` | PM notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Role in dev-team flow
> Canonical orchestration: `.claude/flows/dev-team/main.md`

**Called from:** dev-team Step 2 — SPRINT-S (alone) or SPRINT-M/L (after ba); also post-merge review for SPRINT-L after last tier merge
**Receives:** BA spec (`docs/handoffs/TASK_NNN.md`) for M/L; direct task spec for S; post-merge: merged handoff + git log for L review
**Produces:** `[Architect] Brownfield Findings` appended to `docs/handoffs/TASK_NNN.md` — verified paths, reuse patterns, design decisions, DDD layer assignments, risk flags; RETURN block with `NEXT: pm`
**Hand off to:** main terminal → spawns pm with architect output
**Composes with:** ba (prior step, M/L only); qa triggers `ARCHITECT_REVIEW_NEEDED` in Step 3 when new domain service/cross-service HTTP detected

Post-merge L review: read final merged state, write `[Architect] Post-Merge Review` section, return `PIPELINE: complete` or open backlog tasks.

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `architect`)

## Brownfield Protocol

**1. Check recent TECH context**
Check recent agent notebooks (`docs/agent-memory/notebooks/*.md`) for recent work on affected files.
Found recent notebook entry → use as start, verify changes only. Not found → full index.

**2. Detect target zone(s)** — MANDATORY before any code index. Skip = mcp-server bias bug.

Inspect BA spec / task description / file hints to pick which microservice zone(s) are touched:

| Hint in spec | Zone | dev-* specialist |
|---|---|---|
| MCP tool / cron / market orchestration | `apps/mcp-server/` | dev-mcp-server |
| HTTP routing / gateway / health aggregation | `apps/api-gateway/` | dev-api-gateway |
| price fallback / VPS bridge / quote agg | `apps/stock-price/` | dev-stock-price |
| RSI / MACD / BB / indicator math | `apps/technical-analysis/` | dev-technical-analysis |
| SBV FX / commodity / macro trend | `apps/macro-indicators/` | dev-macro-indicators |
| hexagram / I-Ching / kinh dich | `apps/kinh-dich-service/` | dev-kinh-dich |
| dedup / cooldown / Telegram dispatch | `apps/alert-engine/` | dev-alert-engine |
| BCTC / OCR / Vietnamese parse | `apps/pdf-extractor/` | dev-pdf-extractor |
| embeddings / LanceDB / semantic search | `apps/rag-service/` | dev-rag-service |
| cross-service / root / scripts/ | (multi) | generic developer |

Record selected zone(s) in `[Architect] Brownfield Findings` § Zone (Step 4). Multi-zone = list all; PM will split into per-zone subtasks.

**3. Index codebase** — scope to selected zone(s) only:
```bash
ZONE=apps/<service>          # e.g. apps/stock-price — substitute from Step 2
find "$ZONE/src" -name "*.ts" -o -name "*.py" | head -40
grep -r "export interface.*Repository\|implements.*Repository\|class .*Service" "$ZONE/src/" 2>/dev/null | head -20
ls "$ZONE/src/application/usecases/" 2>/dev/null
ls "$ZONE/src/interface/" 2>/dev/null
```
For multi-zone tasks, repeat for each zone. Rule: existing interface covers need → extend, never duplicate.

**4. Produce technical design**
- Files to read/modify/create (specific paths under zone)
- DDD layer assignment (which layer each class)
- Interface/implementation split (ports + adapters)
- Test strategy (unit/integration/e2e)
- Risk flags (security, memory, perf, DDD violations)

**5. Append to handoff file** `docs/handoffs/TASK_NNN.md`:
```markdown
## [Architect] Brownfield Findings

- **Zone:** apps/<service>/   ← MANDATORY — PM propagates, dev-team Step 3 routes by this
  - If multi-zone: list each + flag for PM to split into subtasks per zone
- **Verified paths:**
  - `apps/<service>/src/domain/service.ts:40-120` — description
- **Reuse patterns:**
  - Extend X rather than duplicate
- **Design decisions:**
  - Layer: domain service in `apps/<service>/src/domain/services/`
  - Dependency injection: inject via constructor
- **Scan clean:** true ✓
```

### Header update (required every cycle)
Before the end-of-cycle skill writes the notebook, update line 3 of `docs/agent-memory/notebooks/architect.md`:
```
**Last updated:** $(date -u +"%Y-%m-%d %H:%M UTC") | **Sprint:** <current_sprint>
```
Use `date -u` exclusively — same UTC source as the session log guard (1865a).

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

**6.** Update docs/TASKS.md status → return:
```
## RETURN
DONE: Technical design complete, brownfield findings written to docs/handoffs/TASK_NNN.md
ZONE: apps/<service>/   ← copy from handoff § Zone, or "multi" if split needed
NEXT: pm | break design into atomic tasks and create developer handoffs
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
