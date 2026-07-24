# Decision Journal — Sprint FACTORY-KINHDICH-split-sandbox · dev-kinh-dich

**Sprint goal:** FACTORY-KINHDICH-split-sandbox — split sandbox main.go by seam
**Agent:** dev-kinh-dich
**Started:** 2026-07-24T08:00:00Z

---

### STEP dev-kinh-dich-S1 · dev-kinh-dich · 2026-07-24T08:15:00Z
**task-id:** FACTORY-KINHDICH-split-sandbox
**what-done:** Split apps/kinh-dich-service/cmd/sandbox/main.go (752L) into 4 sibling files per task spec seams.
**what-considered:**
- Split exactly per task spec: main.go (entry), runners.go (dispatch+5 runners), emit.go (emit functions), discovery.go (find/git-hash)
- OPTIONAL: factor repeated []interface{} coercion into helper — skipped, adds complexity for minimal benefit
**why-decision:** Task spec defines exact seams; followed verbatim. Optional coercion helper would add indirection without reducing complexity.
**why-change:** no change

### STEP dev-kinh-dich-S2 · dev-kinh-dich · 2026-07-24T08:20:00Z
**task-id:** FACTORY-KINHDICH-split-sandbox
**what-done:** Added size-justification headers to main.go (183L) and runners.go (400L) per DoD (>120L requires honest header).
**what-considered:**
- main.go: types ScenarioTrace/TraceOutput MUST stay shared (emit.go uses them via package main namespace); tier loop cannot split
- runners.go: 6 runners + stubMarkovPort tightly coupled; 6 separate files would fragment without benefit
**why-decision:** Both files exceed 120L cap but carry honest size-justification headers per DoD exception clause.
**why-change:** no change
