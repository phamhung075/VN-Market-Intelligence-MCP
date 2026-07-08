# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · dev-kinh-dich

**Sprint goal:** Phase-1 containment — port no-work gate, drain parked detector fixes, wire READ->RESOLVED signal closure, stop narrative drift.
**Agent:** dev-kinh-dich
**Started:** 2026-07-08T11:35:00Z

---

### STEP dev-kinh-dich-S1 · dev-kinh-dich · 2026-07-08T11:38:00Z
**task-id:** FACTORY-KINHDICH-delete-deprecated-ts-tree
**what-done:** Deleted the 34-file ~4302 LOC `apps/kinh-dich-service/src/_deprecated/` TypeScript tree (pre-Go-reboot predecessor, fully superseded by Go pkg/).
**what-considered:**
- Preserve directory with build-ignore tag — rejected, adds ongoing review noise
- Delete entirely — chosen, git history retains if needed, pure subtraction
**why-decision:** Zero live references in Go/Dockerfile/yaml (verified via grep myself); Go build/test/vet/lint all green after deletion; task spec explicitly requested deletion.
**why-change:** No change from spec — straightforward dead-code removal.
