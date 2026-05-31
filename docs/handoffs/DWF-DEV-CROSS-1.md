---
sprint: DYN-WF-FOUNDATION
task: DWF-DEV-CROSS-1
branch: task/dwf-dev-cross-1-prune-schedule
size: S
zone: developer
depends_on: []
blocks: [DWF-DEV-CROSS-2]
---

# DWF-DEV-CROSS-1 — Cowork-Schedule.json Prune

## TLDR

Remove 13 permanently-disabled dead slots from `docs/data/cowork-schedule.json`, leaving exactly 12 enabled slots. Zero behavior change (Phase 0 deliverable). Unblocks DWF-DEV-CROSS-2 (routing-policy creation).

## [PM] Planning Context

**Zone:** `developer` (cross-service)

**Acceptance Criteria:**

- [ ] **AC-P0-1-1:** After pruning, `jq '[.slots[] | select(.enabled == false)] | length' docs/data/cowork-schedule.json` returns 0.
- [ ] **AC-P0-1-2:** After pruning, `jq '[.slots[] | select(.enabled)] | length' docs/data/cowork-schedule.json` returns exactly 12.
- [ ] **AC-P0-1-3 (BLOCKING DV):** No slot removed has `enabled: true`. Cherry-pick one known-enabled slot (e.g., `chef-morning`) and assert it is still present after prune (test must go RED if a live slot is accidentally deleted).
- [ ] **AC-P0-1-4:** JSON file parses without error (`jq . docs/data/cowork-schedule.json > /dev/null`).

**Files to read first:**

- `docs/REQ_DYN-WF-FOUNDATION.md` § FR-P0-1 (dead slots list + AC)
- Current `docs/data/cowork-schedule.json` (baseline, 25+ slots including dead ones)

**Files to modify:**

- `docs/data/cowork-schedule.json` — Remove these 13 slots (all have `enabled: false` with permanent-disable reasons):
  - `digest-monday-predict` (Sprint 1950-T5 — Monday window removed, permanent)
  - `financial-analyst-morning` (bctc-analyst-merge H-18 — superseded)
  - `financial-analyst-midday` (bctc-analyst-merge H-18 — superseded)
  - `news-scout-market` (API_MIN_INTERVAL — sub-hourly unsupported)
  - `market-watcher-market` (API_MIN_INTERVAL — sub-hourly unsupported)
  - `market-watcher-prepost` (API_MIN_INTERVAL — sub-hourly unsupported)
  - `alert-commander-market` (API_MIN_INTERVAL — sub-hourly unsupported)
  - `daily-seed` (Phase 1 stub — not in this sprint scope)
  - `delivery-cron-danger` (Phase 1 stub)
  - `delivery-cron-normal` (Phase 1 stub)
  - `monthly-recap` (Phase 1 stub)
  - `yearly-recap` (Phase 1 stub)
  - (1 more to be identified from current file)

**Remaining enabled slots (12 total, verify all present after prune):**
- `chef-morning`, `chef-intraday`, `chef-eod`, `chef-evening`
- `digest-sunday`, `tnb-audit`
- `bctc-analyst-slot-1`, `bctc-analyst-slot-2`, `bctc-analyst-slot-3`, `bctc-analyst-slot-4`
- `news-scout-offhours`, `news-scout-sentiment`
- `market-watcher-offhours`, `market-watcher-eod`

(Total = 14 listed; verify exact count in current file and adjust this list.)

**Files NOT to modify:**

- Do NOT remove `_notes` or `_open_questions` metadata from JSON root
- Only remove slot objects from the `slots` array

**Dependencies:**

None. This task is Phase 0 parallel-dispatchable with DWF-DEV-MCP-1.

**Knowledge needed:**

- `docs/policies/dev-standards.md` — File manipulation, git
- `docs/REQ_DYN-WF-FOUNDATION.md` § FR-P0-1 (dead slots list and rationale)

**Implementation notes:**

1. **Prune strategy:**
   - Open `docs/data/cowork-schedule.json` in editor
   - Locate each dead slot in the `slots` array by `slot_id`
   - Delete the entire slot object (not just set `enabled: false`)
   - Verify JSON syntax remains valid after deletion (commas, brackets)

2. **Verification:**
   ```bash
   jq '[.slots[] | select(.enabled == false)] | length' docs/data/cowork-schedule.json
   # Should return 0
   
   jq '[.slots[] | select(.enabled)] | length' docs/data/cowork-schedule.json
   # Should return 12
   
   jq '.slots[].slot_id' docs/data/cowork-schedule.json
   # Verify all 12 expected slots are listed
   
   jq . docs/data/cowork-schedule.json > /dev/null
   # Should exit 0 (valid JSON)
   ```

3. **Spot-check (AC-P0-1-3 DV):**
   - Before commit, manually verify `chef-morning` is still in the file:
   ```bash
   jq '.slots[] | select(.slot_id == "chef-morning")' docs/data/cowork-schedule.json
   # Should output the entire slot object
   ```

4. **Why Phase 1 stubs are removed now:**
   - Phase 1 is explicitly out of scope for this sprint (DWF-PHASE1 is a blocked follow-up task)
   - Keeping dead code paths in the dispatcher causes confusion and maintenance burden
   - When/if Phase 1 ships, those slots will be added back with correct design
   - This prune is a clean break, not a deprecation

**Test/verification:**

No test file needed for this task. ACs are verified via bash jq commands. AC-P0-1-3 (DV) is a manual spot-check.

---

## RETURN

Upon completion, developer will commit with trailers:

```
chore(cowork-schedule): prune 13 dead slots, retain 12 enabled

Remove permanently-disabled slots (API_MIN_INTERVAL, Phase 1 stubs, superseded).
Retain 12 enabled: chef-*, digest-sunday, tnb-audit, bctc-analyst-slot-*, news-scout-*,
market-watcher-*. No behavior change; cowork dispatcher still fires all enabled slots
at their scheduled times.

Task: DWF-DEV-CROSS-1
AC: AC-P0-1-1, AC-P0-1-2, AC-P0-1-3, AC-P0-1-4
```

Then PM will unblock DWF-DEV-CROSS-2 (routing-policy.json creation).
