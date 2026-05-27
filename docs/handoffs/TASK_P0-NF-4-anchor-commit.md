---
task_id: "P0-NF-4"
pilot: "news-fetch"
phase: "0"
title: "Set anchor commit (news-fetch-pre-refactor) + update pilot-status SSOT deliverable flags"
estimate: "0.5h"
owner: "pm"
status: "READY"
date: "2026-05-24"
---

# TASK P0-NF-4 — Phase 0 Anchor Commit + SSOT Reconcile

## Summary

PM sets the frozen pre-refactor anchor tag and reconciles the pilot-status SSOT once the three independent Phase 0 deliverables (P0-NF-1 brownfield, P0-NF-2 bug-inventory, P0-NF-3 flow) have landed. Sequential-last in Phase 0 (depends on all prior deliverables).

## Acceptance Criteria

### AC-1: Anchor tag (frozen)
- [ ] Create lightweight tag `news-fetch-pre-refactor` at the current main HEAD (pre-Phase-1 baseline)
- [ ] No retag, no force, no push (user owns push). Anchor discipline per pilot-status `constraints_binding_day_0`.

### AC-2: Deliverable flags reconciled
- [ ] Verify `phase0.deliverables` for brownfield_inventory / bug_inventory_entry / dev_agent_flow_file all read DONE with commit SHAs
- [ ] Confirm `dev_agent_file` reads N/A (PO decision) — do NOT flip to DONE/PENDING
- [ ] Record the anchor tag name + SHA in pilot-status (e.g. in phase0.exit_gate or an anchor field)

### AC-3: WORK channel notify
- [ ] `send_telegram(work, "[news-fetch pilot] Phase 0 anchor set: news-fetch-pre-refactor @ <sha>; 3 deliverables landed; awaiting P0-NF-5 phase-1 plan + exit gate")`

## Boundary
- L84 explicit-file staging (git add <path> per file; NEVER -A or .). No --force/--no-verify/--no-gpg-sign. All on main.
- pilot-status SSOT + tag only. No service code.

## Blocked by
P0-NF-1, P0-NF-2, P0-NF-3 (all deliverables before anchor).

## References
- pilot-status SSOT: `docs/data/pilot-status-news-fetch.json`
