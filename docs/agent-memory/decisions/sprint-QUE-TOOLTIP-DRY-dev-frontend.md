# Decision Journal — Sprint QUE-TOOLTIP-DRY · dev-frontend

**Sprint goal:** Hexagram Tooltip DRY + Single SSOT — wire hover tooltips to every frontend quẻ render site, enforcing ONE source of truth for hexagram description text
**Agent:** dev-frontend
**Started:** 2026-06-12T13:38:00Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-06-12T13:42:00Z
**task-id:** QUE-TOOLTIP-DRY-1b
**what-done:** Migrated SnapshotRow hexagram cell in dashboard.kinh-dich-signals.tsx from plain `<span>` pair to `<QueName hexagram={item.hexagramNumber} name={item.hexagramName} />` + verified NFR-1/2/3 grep gates.
**what-considered:**
- only path: AC is a 3-change op (import + cell swap + AC verification); no design ambiguity — QueName interface exactly matches KinhDichSnapshotItem fields (hexagramNumber:number, hexagramName:string)
**why-decision:** Interface match confirmed from L64-L77 (KinhDichSnapshotItem); QueName fallback (hexagram=0 → plain span) covers edge cases; no structural change needed
**why-change:** no change from plan
