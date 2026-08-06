---
sprint: DEVTEAM-20260806
branch: fix/active-readpath-detector
size: M
zone: cross-service/
priority: P1
depends_on: []
blocks: ["FIX-NEWSVPS-OVERNIGHT-PUSH-OUTAGE-663M-SILENT"]
---

## TLDR
A detector must exercise each service's actual data-serving read path (not just DB file presence) to catch silent service failures. Current health checks probe file/DB structure but not whether reads return data. Add a detector that performs an active read on each service's primary data query.

## [PM] Planning Context
- **Zone:** cross-service/ (coordinate multi-service detector architecture)
- **Root causes:** kinh-dich dark 6 days (all health checks green), news transport silent 663min (B-01 fired ~1 min before recovery)
- **Acceptance Criteria (AC-3):**
  - [ ] Detector goes RED against kinh-dich pre-fix state (e.g., 2026-07-XX dark period)
  - [ ] Detector goes RED against news transport pre-fix state (2026-08-04 ~19:00-04:00 UTC silent hang)
  - [ ] Does NOT go RED on docker ps GREEN (ruling out false infra-only failures)
- **Files to create/modify:**
  - `docs/agents/auditor/probes/active-readpath-detector.md` (new detector spec)
  - Multi-service probe implementations (kinh-dich, news-transport, bctc, etc.)
- **Dependencies:** none initially; unblocks FIX-NEWSVPS-OVERNIGHT-PUSH-OUTAGE-663M-SILENT
- **Knowledge needed:** `docs/analysis-briefs/auditor-detector-contract.md`

## Note
This unblocks item 5 (news VPS hardening) — detection architecture fix lands first.
