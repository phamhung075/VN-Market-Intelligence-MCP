# Decision Journal — Sprint ORCH-DASH-DECISION-DRILLDOWN · developer

**Sprint goal:** ORCH-DASH-DECISION-DRILLDOWN (active)
**Agent:** developer
**Started:** 2026-06-07T21:40:00Z

---

### STEP developer-S1 · developer · 2026-06-07T21:40:00Z
**task-id:** FIX-CI-LINT-STACK
**what-done:** Bumped golangci/golangci-lint-action from v6.1.1 to v7.0.0 at all 6 go-lint job sites in .github/workflows/ci.yml; added `version: v2.0` input; deleted stale kinh-dich-ts-lint job.
**what-considered:**
- v7.0.0 (latest stable v7 tag, supports golangci-lint v2 only per release notes)
- v9.2.1 (too aggressive a jump — higher risk of unintended behaviour changes; v7 is the minimal correct fix)
**why-decision:** v7.0.0 is the earliest tag that explicitly supports golangci-lint v2 schema only; `version: v2.0` is required by the action (README example). Minimal version bump reduces surface area.
**why-change:** no change from plan — task spec said "v7+ pinned tag with explicit version input"
