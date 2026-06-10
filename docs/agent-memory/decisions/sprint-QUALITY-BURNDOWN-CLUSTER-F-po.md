# Decision Journal — Quality Burndown PHASE-4 · Cluster-F · po

**Sprint goal:** Resolve Cluster-F system-map deploy-drift (RAG-SERVICE-AVAIL-01, NEWS-FETCH-AVAIL-01) — rag-service + news-fetch containers Up 2 days but SSOT classifies them not_deployed_by_design.
**Brief:** docs/architecture-briefs/2026-06-10-quality-burndown-strategy.md (Cluster-F, Band-5)
**Agent:** po
**Started:** 2026-06-10

---

### STEP po-CLF-1 · po · 2026-06-10 · DJ-GATE-1
**task-id:** CLUSTER-F-SYSTEM-MAP-DEPLOY-DRIFT
**decision:** OPTION 2 — HONOR PANIC-GUARD. SSOT unchanged. No system-map.json edit.

**what-done:**
- Raw-verified host coping state BEFORE deciding (load-bearing per brief).
- `docker stats --no-stream`: container fleet total ≈ 4.1 GiB across all 9 containers — comfortably UNDER the Docker 8 GB cap. rag-service = 1.375 GiB (91.65% of its own 1.5 GiB sub-limit), news-fetch = 60.45 MiB.
- `sysctl vm.swapusage` (read twice, stable): total = 12288 M, **used = 10573–10637 M (≈86%), free = 1.65–1.71 GB**.
- `vm_stat` / `memory_pressure`: Pages free ≈ 20–46k (~80–180 MB), Pages stored in compressor ≈ 6.24 M, Pages occupied by compressor ≈ 727k–746k (~2.85 GB). Swapouts 1.08 B cumulative.
- VERDICT for merge-writer: RAG-SERVICE-AVAIL-01 = INFO (undeployed-by-design, correct). NEWS-FETCH-AVAIL-01 = INFO (undeployed-by-design, correct). No reclassification, no PASS-as-availability.

**what-considered:**
- OPTION 1 BLESS: move rag-service+news-fetch into host_runtime_set.services[], drop rag/news from not_deployed_short_keys, bump _last_verified → would reclassify both checks INFO→availability-PASS. Tempting because containers are healthy and the Docker-cap headroom is fine.
- OPTION 2 HONOR PANIC-GUARD: SSOT as-is, containers are accidental drift not intended state, document why.

**why-decision (root-cause, not symptom):**
- The panic guard (`project_host_memory_panic`) is about the **16 GB Mac HOST** kernel-panicking on **swap exhaustion** — NOT about the Docker 8 GB cap. The two are different ceilings. Container-cap headroom (~4.1/8 GiB) is irrelevant to the panic condition.
- The host is RIGHT NOW at swap exhaustion: 10.6 GB swap used of 12 GB, only 1.7 GB swap free, ~80–180 MB pages free, ~2.85 GB held in compressor. This is the exact panic signature from the memory.
- "Up 2 days healthy" is SURVIVORSHIP, not headroom. The host has been riding the edge, not coping with margin. Blessing the drift would institutionalize the workload (rag-service alone is 1.375 GiB resident) that pushed the host here, and lock in a permanent panic risk to win 2 audit-greens.
- Brief's explicit guard: "do NOT risk a panic for an audit-green." Near-cap → Option 2.
- The containers being Up is accidental drift (stale/manual full-fleet `docker compose up`), not an intended deployment decision. Correct root-cause remediation is to RESTORE host headroom by STOPPING rag-service + news-fetch (ops half of Cluster-F: "update system-map OR stop containers"). That is ops scope, not po SSOT scope.

**why-change:** Diverges from brief's "likely-correct Option 1 IF host memory headroom is healthy." Host memory headroom is NOT healthy — swap is 86% exhausted. The conditional for Option 1 is unmet, so Option 1 is unsafe.

**handoff:**
- po (this): NO SSOT edit. Decision recorded. No commit-mutex acquired (nothing to commit).
- ops (Cluster-F other owner): STOP `vn-market-intelligence-mcp-rag-service-1` + `vn-market-intelligence-mcp-news-fetch-1` to reclaim ≈1.44 GiB resident and relieve host swap pressure; then docker ps matches SSOT (DoD: "classification matches docker ps"). Verify host swap drops post-stop.
- merge-writer: fold both verdicts as INFO (undeployed-by-design — no code/SSOT change).
