# Agent Father — Notebook

**Last updated:** 2026-05-12
**Sprint:** 1895b / maintenance cycle 4

## Last Session Summary
Keep sweep (34 agents). 0 auto-fixes applied (no safe mechanical fixes found). 7 escalations (Error Boundary missing in 7 dev-team flows — batch fix opportunity). Roster CLEAN.

## Lessons Learned
- idea-forge, market-analyst had `always_load: []` — empty list is not enough. fail-loud-protocol must be explicit entry. [from cycle 1]
- system-auditor, cowork-refactory-expert, claude-manager-helper flows were missing Error Boundary and RETURN — they existed before the pattern was standardized. [from cycle 1]
- code-janitor had KNOWLEDGE LOAD FAILURE PROTOCOL inline but not the always_load pointer — both are required (inline = runtime instructions, always_load = load trigger). [from cycle 1]
- Check #8 (permissions.channels): multiline grep on YAML indentation does not match well — use single-line `permissions:` grep instead. [from cycle 1]
- dev-team/main.md is an orchestration flow, not a sub-agent flow — it still requires Error Boundary per guide Section 6.2. [cycle 2]
- When new dev-* microservice agents are created, they must be explicitly added to agent-roster.md. The shared flow design (all use microservice-main.md) can mask missing roster entries during review. [cycle 2]
- Glob `.claude/flows/*/` returns nothing — use Bash `ls .claude/flows/` to list flow directories. [cycle 2]
- **NEW [cycle 3]:** 7 oldest dev-team flows (architect, ba, developer, fixer, pm, po, qa) all missing Error Boundary — pre-standardization debt. Single PO task can fix all 7 in batch. Pattern: if version=2026-04-26 and role=dev-team, high chance of missing Error Boundary.
- **NEW [cycle 3]:** Sessions dir contains 3 naming-convention violations: template file `YYYY-MM-DD-ops.md`, non-standard `qa-responder-session-2026-05-07.md`, and sprint artifact `PM_SPRINT_1849_BREAKDOWN.md`. Session files must follow `YYYY-MM-DD-<agent-id>.md` format.

## Cross-Team Notes
- cowork-refactory-expert handles live tool surface rewrites (grep registerTool) — do not duplicate
- claude-manager-helper handles DAG integrity and tree-map enforcement — do not duplicate
- Review flow classifies missing [PLANNED] sections (document_zone, document_registry) as LOW, not FAIL
- dev-* agents all share `.claude/flows/developer/microservice-main.md` — check that flow file, not per-agent dirs
- `docs/agent-memory/notebooks/main.md` = dev-team sprint boundary state (intentional, written by main terminal)
- `docs/agent-memory/notebooks/WORK.md` = status dump artifact (intentional, LOW orphan — do not delete)
- `dev-team` flow dir has no matching agent file — intentional (orchestration, not sub-agent)

## Carry-Over
- monitor next review: confirm idea-forge / market-analyst / code-janitor don't regress on always_load [cycle 1]
- LOW: document_zone + document_registry sections still [PLANNED] across all agents — not a blocker [cycle 1]
- LOW: semble-search in agents/ dir but classified as skill in roster — verify if it should be removed from .claude/agents/ — needs decision [cycle 2, cycle 3, cycle 4]
- dev-* microservice agents missing tool packages (9 agents) — intentional design (share developer.md package) or structural gap? Needs decision [cycle 4]
- agents-architect missing tool package — check if intentional [cycle 4]
- **ESCALATED to PO [cycle 3]:** 7 dev-team flows missing Error Boundary (architect, ba, developer, fixer, pm, po, qa) — confirm resolved
- **ESCALATED to PO [cycle 4]:** agents-architect not in roster — AUTO-FIXED. dev-* tool packages missing — needs decision.

---

## Recent session — 2026-05-09 (cycle 3)

Keep sweep (34 agents). 0 auto-fixes applied (no safe mechanical fixes found). 7 escalations (Error Boundary missing in 7 dev-team flows — batch fix opportunity). Roster CLEAN.

**Session anomalies noted:**
- `YYYY-MM-DD-ops.md` — template file left in sessions dir, wrong naming convention
- `qa-responder-session-2026-05-07.md` — non-standard naming (should be `2026-05-07-qa-responder.md`)
- `PM_SPRINT_1849_BREAKDOWN.md` — sprint artifact in sessions dir, should be in docs/handoffs/

**Check results:** KLFL pass x30, Error Boundary fail x7 (architect, ba, developer, fixer, pm, po, qa — pre-standardization debt), Roster CLEAN x34.

---

## Recent session — 2026-05-12 (cycle 4)

Keep sweep (35 agents). 1 auto-fix applied. 3 escalations. 0 orphan flows. 0 orphan notebooks (main.md + WORK.md intentional). 0 orphan packages.

**Key findings:**
- agents-architect was UNREGISTERED in roster — AUTO-FIXED (added to Dev Team table)
- semble-search.md in agents/ has no fail-loud, no boundary_rules, no version — it's a thin skill-proxy, not a real agent. Low severity but structural inconsistency persists [cycle 4 carry-over]
- agents-architect has inline flow (intentional, no dedicated .md file)
- Error Boundary: ALL flow files now pass (0 fails vs 7 last cycle — cycle 3 PO task was effective)
- 10 agents missing tool packages: agents-architect + all 9 dev-* microservice agents. These may use developer.md shared package but no explicit reference. Needs architecture decision.
- 10 notebooks with NO_DATE (cowork-refactory-expert, dev-api-gateway, dev-kinh-dich, dev-macro-indicators, dev-rag-service, dev-stock-price, dev-technical-analysis, idea-forge, market-analyst, semble-search) — empty or undated, not stale; no dates to parse
- main.md flow does not exist in .claude/flows/agent-father/ — cron call to "main.md" should route to keep.md per agent definition flow catalog

**Session log — Keep 14:23**
- Trigger: scheduled (daily cron 14:23)
- Agents scanned: 35
- Auto-fixes: 1 (agents-architect roster registration)
- Escalations: 3 (semble-search structural, dev-* missing packages, main.md missing flow)
- Orphans: 0 structural (main.md + WORK.md notebooks intentional)
- Lesson: Error Boundary fix from cycle 3 fully resolved — 7→0 failures. Confirms batch PO task pattern is effective for systemic issues.

---

## c49 — 2026-05-12 (task 1895b-worktree-merge-protocol-impl)

**Task:** Phase 5 Structural Sequential Merge Gate — implement Option 2 from architect brief `docs/architecture-briefs/2026-05-12-worktree-merge-protocol.md`.

**Files written:**
- `scripts/audits/index-check.sh` — Control 1: pre-merge staged-index guard. `git diff --cached --quiet`; exit 1 + stderr if dirty.
- `scripts/audits/tree-verify.sh` — Control 3: post-merge tree-hash verification. Compares `git diff-tree --name-only` HEAD vs cherry-pick SHA; exit 1 + diff on mismatch.
- `scripts/audits/c2-alert.sh` — Control 4: C2 atomicity rule check. Parses type/scope from subject, detects docs+code or feat+md-only mixed commits; exit 0 always (detective, non-blocking).
- `scripts/audits/recovery-snapshot.sh` — Control 5: soft-reset rollback aid. `git reset --soft HEAD~1 && git stash push -m "recovery-<ts>-polluted-<sha>"`. Operator-explicit only.

**Docs edited:**
- `.claude/flows/dev-team/main.md` — replaced "After each tier: spawn pm" with explicit 5-step Merge Gate block (Controls 1-3-4-5) + developer spawn constraint banner (`git commit -am` ban).
- `.claude/flows/developer/main.md` — added `git commit -am` ban to step 4 with c47 reference.
- `docs/policies/commit-convention.md` — added mandatory rule block after Shell Pattern section.
- `docs/TASKS.md` — 1895b moved Todo → In Progress on start, Done at end.

**Script tests:** index-check correctly detected dirty index (staged workspace files); tree-verify printed usage error on no args; c2-alert passed HEAD commit as C2 OK; recovery-snapshot not run (operator-explicit).

**Lessons:**
- `git diff --cached --quiet` exits 1 even when dirty from ambient workspace state (other agents' staged commits) — confirms the script is live-testing correctly.
- c47 incident root cause fully codified in 3 enforcing docs + 4 runnable controls. Structural gate eliminates the race by construction (no main-terminal git write until all tier agents returned + gate entered).
