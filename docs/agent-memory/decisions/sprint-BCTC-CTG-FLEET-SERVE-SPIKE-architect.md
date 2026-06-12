# Decision Journal — Sprint BCTC-CTG-FLEET-SERVE-SPIKE · architect

**Started:** 2026-06-12T20:40Z  
**Agent:** architect

---

## ARCH-BCTC-CTG-FLEET-SERVE-SPIKE [task_id: BCTC-CTG-FLEET-SERVE-SPIKE]

- **what-considered:** (a) code defect in bctcRefineJob.ts / bctcFullTools.ts PUB-1/PUB-3; (b) data defect — corrupt or missing CTG OCR; (c) ops gap — refine cron never armed; (d) pipeline trigger defect — get_bctc_pending_refine not picking CTG up.
- **why-change:** Traced full refine→serve chain from live DB. CTG row: refine_status=PENDING confirmed by direct SQL. OCR present: 61 pages in pdf_extracted_text for the correct pdf_path basename. bctc_refined_units count=0. PUB-1 fires (refine_status not in DONE/PARTIAL) and returns "Chưa có dữ liệu BCTC" before PUB-3 is evaluated. Root cause: the refine fleet cron (`cron-refine-bctc.md`) was architected (Option-Y ruling) and the skill file exists but was never armed in the Claude scheduler. REFINE-CRON-ARM was batched inside FU-CTG-REFINE-PICKUP but never instantiated as a task. Fleet scope: 33 PENDING rows with clean OCR — all blocked at PUB-1 for the same reason. Two additional rows (D2D, KDC) have pdf_path=NULL secondary blocker but same root.
- **path chosen:** Option (c) — ops gap. The only structural fix is arming the cron. No code changes required.
- **BUILD-STANDARD:** not-applicable (ops deployment + one-shot migration; no new service, no new feature).
- **brief:** `docs/architecture-briefs/2026-06-12-bctc-ctg-fleet-serve-gap.md`
