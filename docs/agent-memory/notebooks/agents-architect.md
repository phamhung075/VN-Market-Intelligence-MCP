# agents-architect — Notebook

## 2026-05-10

### Session: git-log-as-review-surface

**Brief authored:** `docs/architecture-briefs/2026-05-10-git-log-as-review-surface.md`

**Signal dropped:** `docs/signals/agents-architect-2026-05-10T0000-phase-a.json` → agent-father

**Key decisions recorded:**
- User scrapped prior TASKS.md drift reconciler plan. New direction: git log as canonical review surface.
- Phase A (convention) must ship before Phase B (delete) — strict sequencing enforced.
- No git alias work (user did not request, not included).
- Enforcement hook noted as Phase A.2 future work only, not specced.

**Phase B gate:** User must sign off after >=1 week conforming commits. Phase B signal held by agents-architect.

**Files agent-father must touch (Phase A):**
- CREATE: `.claude/knowledge/commit-convention.md`
- EDIT: `CLAUDE.md`, `dev-standards.md`, `developer/main.md`, `developer/microservice-main.md`, `qa/main.md`, `pm/main.md`, `tree-map.md`

**Flows confirmed as needing update (grepped):**
- `developer/main.md` line 45: `git add -p && git commit — format per dev-standards.md`
- `developer/microservice-main.md` lines 50+55: same pattern
- `qa/main.md` line 58: merge commit `merge(NNN): <title>` — needs convention pointer
- `pm/main.md` step 3b: no commit step but handoff AC should note trailer relationship

---

## Recent session — 2026-05-10

**Task:** git-log-as-review-surface architecture brief — COMPLETE

- Mapped 10 current tracking surfaces; identified 3 redundant for in-flight (TASKS.md Done, handoffs, session logs) and 1 redundant for memory (sessions vs notebooks).
- 2-phase plan: Phase A (commit convention SSOT — 8 file edits/creates), Phase B (factory delete — gated on user sign-off after ≥1 week conforming commits).
- Phase B C4 collapse (sessions→notebooks) activated early per user approval — lowest-risk collapse.
- Reuse audit: git-native trailers, existing `.claude/knowledge/` pattern, existing signals bus, existing notebooks — zero new infrastructure.
- Signal dropped: `docs/signals/agents-architect-2026-05-10T0000-phase-a.json` (Phase A, now complete).
- Phase B C4 signal: `docs/signals/agents-architect-2026-05-10T2202-phase-b-c4.json` → agent-father executing B11+B8+B9.
