---
sprint: 1967
branch: task/1967-12-notebook-trim
size: S
zone: .claude/agents/
depends_on: []
blocks: []
---

## TLDR

Audit (TASK_1967-04 side_finding) revealed 6 agent notebooks exceed 150L cap baseline. Trim each to ≤150L by archiving carry-over items and stale working notes per 1968a pattern. Preserves semantic content; improves signal-window latency (smaller context load per cycle).

---

## [PM] Planning Context

- **Zone:** `.claude/agents/notebooks/`
- **Notebooks to trim (targets > 150L):**
  1. dev-mainserver-crawls.md (262L → ≤150L)
  2. code-janitor.md (183L → ≤150L)
  3. dev-alert-engine.md (163L → ≤150L)
  4. news-scout.md (158L → ≤150L)
  5. dev-vps-crawls.md (157L → ≤150L)
  6. alert-commander.md (153L → ≤150L)

- **Out of scope:** market-watcher.md (already trimmed to 65L post-1968a)

- **Acceptance Criteria:**
  - [ ] All 6 notebooks ≤150L post-trim (measure with `wc -l`)
  - [ ] Each notebook preserves `## Carry-over` section (if present)
  - [ ] Each notebook has archive pointer at line 3 (e.g., `> Archive: docs/archive/notebooks/<id>-2026-05-21.md (pre-trim history)`)
  - [ ] Archived notebook files written to `docs/archive/notebooks/` with timestamp (format: `<notebook-id>-2026-05-21.md`)
  - [ ] Carry-over items (open loops, deferred work) appear ONLY in Carry-over section or archive, not scattered in body
  - [ ] Commit message links to TASK_1967-04 side_finding report
  - [ ] No semantic content loss (all tasks/decisions preserved in archive)

- **Files to read first:**
  - `/docs/agent-memory/notebooks/dev-mainserver-crawls.md`
  - `/docs/agent-memory/notebooks/code-janitor.md`
  - `/docs/agent-memory/notebooks/dev-alert-engine.md`
  - `/docs/agent-memory/notebooks/news-scout.md`
  - `/docs/agent-memory/notebooks/dev-vps-crawls.md`
  - `/docs/agent-memory/notebooks/alert-commander.md`
  - Reference: `/docs/agent-memory/notebooks/market-watcher.md` (post-1968a trim example)

- **Files to create:**
  - `docs/archive/notebooks/dev-mainserver-crawls-2026-05-21.md`
  - `docs/archive/notebooks/code-janitor-2026-05-21.md`
  - `docs/archive/notebooks/dev-alert-engine-2026-05-21.md`
  - `docs/archive/notebooks/news-scout-2026-05-21.md`
  - `docs/archive/notebooks/dev-vps-crawls-2026-05-21.md`
  - `docs/archive/notebooks/alert-commander-2026-05-21.md`

- **Files to modify:**
  - `docs/agent-memory/notebooks/dev-mainserver-crawls.md` (trim to ≤150L, add archive pointer)
  - `docs/agent-memory/notebooks/code-janitor.md` (trim to ≤150L, add archive pointer)
  - `docs/agent-memory/notebooks/dev-alert-engine.md` (trim to ≤150L, add archive pointer)
  - `docs/agent-memory/notebooks/news-scout.md` (trim to ≤150L, add archive pointer)
  - `docs/agent-memory/notebooks/dev-vps-crawls.md` (trim to ≤150L, add archive pointer)
  - `docs/agent-memory/notebooks/alert-commander.md` (trim to ≤150L, add archive pointer)

- **Dependencies:** None (can run immediately; improves signal window latency for agent cycles)

- **Knowledge needed:**
  - `docs/policies/dev-standards.md` (commit convention)
  - Reference: TASK_1968a Phase 1 (L-2 notebook archival pattern)
  - System-auditor D5 dimension (notebook-size guard): prevents future overruns

---

## Context

TASK_1967-04 QA approved (static ACs only). Side-finding: D5 guard logic is correct and will alert at next Tier-2 cycle if notebooks exceed 160L. However, audit discovered 7 notebooks currently exceed 150L baseline:

- dev-mainserver-crawls.md 262L
- code-janitor.md 183L
- dev-alert-engine.md 163L
- news-scout.md 158L
- dev-vps-crawls.md 157L
- alert-commander.md 153L
- (market-watcher.md was 158L, post-1968a trim is now 65L)

**Why trim now?**
1. Proactive: D5 alert will fire at next audit cycle; trim before then prevents false escalation
2. Signal window: Smaller notebooks = lower token load per agent signal drain (measured by Cowork snapshot I/O)
3. Precedent: market-watcher.md trim (1968a) proved pattern works; 6 others follow same rhythm

---

## Implementation Notes

**Pattern (from TASK_1968a Phase 1 — L-2):**

1. Read full notebook
2. Identify stale/completed carry-over items (> 2 months old, or resolution status reached)
3. Move stale items + any historical working notes to archive file (`docs/archive/notebooks/<id>-YYYY-MM-DD.md`)
4. Keep only:
   - Line 1: title and metadata (Last updated, Status, WIP, carry-over reference)
   - Active cycle notes (current/recent sessions)
   - `## Carry-over` section (active blockers/next-steps)
5. Add archive pointer at line 3: `> Archive: docs/archive/notebooks/<id>-YYYY-MM-DD.md (pre-trim history)`
6. Verify `wc -l` ≤ 150

**Semantic preservation:** Archive file is immutable; agents never read it. Archives exist for human audit only (project historian role). Live notebook ≤150L is the agent's working memory.

---

## Testing

No unit tests required (markdown trim + file ops only).

**Verification:**
```bash
for nb in dev-mainserver-crawls code-janitor dev-alert-engine news-scout dev-vps-crawls alert-commander; do
  wc -l docs/agent-memory/notebooks/$nb.md
  grep -c "Archive:" docs/agent-memory/notebooks/$nb.md
done
# All should show ≤ 150 and exactly 1 Archive: line
```

---

## Commit Convention

```
chore(agents/notebooks): trim 6 notebooks >150L baseline

Targets: dev-mainserver-crawls, code-janitor, dev-alert-engine,
news-scout, dev-vps-crawls, alert-commander. Preserve Carry-over
sections; archive stale notes per 1968a pattern. Closes side_finding
from TASK_1967-04 QA report.

Size: S | Zone: .claude/agents/ | Task: 1967-12
```

---

## Acceptance Criteria (Recap)

- [ ] AC-1: All 6 notebooks ≤150L
- [ ] AC-2: Archive pointer at line 3 of each live notebook
- [ ] AC-3: `## Carry-over` section preserved (if present)
- [ ] AC-4: Archive files created + moved to `docs/archive/notebooks/`
- [ ] AC-5: Commit message references TASK_1967-04 side_finding
- [ ] AC-6: No semantic content loss (verification by reading archive files)

---

## Owner

**claude-manager-helper** (notebook hygiene specialist)

**Model:** claude-haiku-4-5-20251001

---

## Related

- TASK_1968a Phase 1 (L-2 notebook archival precedent)
- TASK_1967-04 QA report (side_finding: 7 notebooks >150L)
- System-auditor D5 dimension (notebook-size guard: alerts if >160L)
- Waterfall lazy-load memory/CLAUDE.md (waterfall audit 2026-05-12 documented 120L notebook soft-cap theory; this task hardens it)
