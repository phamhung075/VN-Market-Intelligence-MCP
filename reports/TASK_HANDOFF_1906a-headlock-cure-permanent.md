# TASK HANDOFF — 1906a-headlock-cure-permanent

**Task:** 1906a | **Type:** DOC-CHORE/S | **Sprint:** c89 | **Branch:** task/c89-1906a-headlock-cure-permanent

## What changed

`docs/protocols/head-lock-self-cure.md` — +13L net:
1. Status line added to header: `PERMANENT OPERATIONAL POLICY (reclassified 2026-05-14 — was "temporary workaround"; see § f)`
2. New `§ (f) Policy Classification` section appended — reclassification rationale, 3-cycle evidence (c87/c88/c89), F1 structural cure cross-ref, `1897b-carry` tracking pointer.

## Why

Architect brief `docs/architecture-briefs/2026-05-13-headlock-recurrence-post-F2a.md` Recommendation #2: accept PREFLIGHT safe-remove as permanent production behavior. 14 occurrences cured with 100% success rate. Treating each cure as an incident was generating false escalation noise; reclassification restores correct observability.

## No other files touched

Closed-loop doc-only change per task scope.
