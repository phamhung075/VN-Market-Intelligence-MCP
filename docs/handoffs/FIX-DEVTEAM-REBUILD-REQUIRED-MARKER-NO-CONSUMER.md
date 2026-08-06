---
sprint: DEVTEAM-20260806
branch: fix/devteam-rebuild-marker-consumer
size: S
zone: docs/agents/
priority: P1
depends_on: []
blocks: []
assignee_next_agent: agent-father
---

## TLDR
dev-* agents write REBUILD_REQUIRED=true into prose notes, but qa.md never reads it. QA verifies deployed code fixes against the un-rebuilt running container image. Add a gate that compares deployed image build-time vs the fix commit's committer-date.

## [PM] Planning Context
- **Zone:** docs/agents/ (dev-team flow gate)
- **Occurrence count:** 3, escalated P2→P1 this tick
- **Acceptance Criteria:**
  - [ ] QA gate reads deployed image build-time via docker inspect (StartedAt)
  - [ ] Compare against fix commit committer-date (git log --pretty=%cI)
  - [ ] If fix commit is newer than container birth, return CHANGES_REQUESTED + rebuild advisory
  - [ ] Integration test: mock a post-deploy fix, verify gate flags it
- **Files to modify:**
  - `docs/agents/dev-team/flow/qa-drain.md` (add image-age check)
  - Possibly scripts/docker-inspect-build-time.sh (helper utility)
- **Dependencies:** none; improves QA rigor for all future sprints
- **Knowledge needed:** `docs/agents/dev-team/flow/main.md` § QA Drain

## Note
**PRECONDITION:** A-30 mem_creep breach may be stale-image FP (fix commit 0308514f5 at 2026-08-06T16:33:53Z, container StartedAt 2026-08-06T12:57:42Z; deploy lag ~3.5h). If this task or any QA verify touches `apps/rag-service/`, flag this precondition rather than issuing CHANGES_REQUESTED.
