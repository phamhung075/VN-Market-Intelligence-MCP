---
sprint: FIX-DEVTEAM-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-DESTINATION
branch: task/FIX-DRS-SWEEP-006-bounded1-regression
size: XS
zone: cross-service/
depends_on: [FIX-DRS-SWEEP-003-BOARD-DRAIN]
blocks: [FIX-DRS-SWEEP-008-DEV-STANDARDS]
---

## TLDR
Extend `scripts/audits/bounded1-supervised-lane-report.sh` (DRS-STRANDED-OFF-ALLOWLIST section) with a ratified regression gate: WARN ceiling=15, FAIL ceiling=25. Baseline today is 43 rows; projection after mechanisms ship is comfortably under 15 (brief §2.6/§3.3). Adds automated monitoring so the defect cannot silently regrow undetected.

## [PM] Planning Context

- **Zone:** cross-service/
- **Acceptance Criteria:**
  - [ ] DRS-STRANDED-OFF-ALLOWLIST section of the script now computes STRANDED_COUNT
  - [ ] After count output line, add bash conditional:
    - If STRANDED_COUNT > 25 → exit 1 with FAIL message (something broke, regrowth detected)
    - If STRANDED_COUNT > 15 → exit 0 with WARN message (above ratified residual ceiling)
    - Otherwise → exit 0 silent
  - [ ] WARN_CEILING=15 and FAIL_CEILING=25 are defined as script variables at the top (retunable, documented)
  - [ ] Messages include `[bounded1-supervised-lane-report]` prefix and explain the ceiling context (ratified residual, regrowth alarm)
  - [ ] Script's exit code = 0 on WARN (does not block CI), exit code = 1 on FAIL (blocks CI)
  - [ ] Rationale comment in script cites brief §4 (ceilings are data-driven, retunable, not permanent)
  - [ ] Test: manually verify script exits 0 on baseline 43 (today's count), then verify exit-code logic with synthetic counts (0, 15, 16, 25, 26)

- **Files to read first:**
  - `docs/architecture-briefs/2026-08-09-agent-father-board-drain-and-ops-batch-widen.md` §4 (regression instrument spec, ceiling rationale, §2.6/§3.3 throughput math)
  - `scripts/audits/bounded1-supervised-lane-report.sh` (current structure; understand how STRANDED_COUNT is computed today)
  - Similar audit scripts with exit-code gates (e.g., other scripts in `scripts/audits/` that have fail ceilings)

- **Files to create:** None

- **Files to modify:**
  - `scripts/audits/bounded1-supervised-lane-report.sh` — add WARN/FAIL gates after DRS-STRANDED-OFF-ALLOWLIST count

- **Dependencies:** FIX-DRS-SWEEP-003-BOARD-DRAIN (conceptually — this regression gate monitors whether board-drain is working)

- **Knowledge needed:**
  - Brief §4: regression instrument design, ceiling rationale (baseline 43 → residual ~15 in steady state)
  - Bash exit codes and CI gate semantics
  - The actual current STRANDED_COUNT computation in the existing script

---

## RETURN
Task specification ready for developer. This adds automated monitoring. Blocking: FIX-DRS-SWEEP-008-DEV-STANDARDS (which cites this script as a CANONICAL pointer).
