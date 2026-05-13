# HEAD.lock Recurrence Post-F2a — Spike Brief

<!-- size-justification: 90L — spike investigation brief: F2a verification, why-not-fixed analysis, ranked options, recommendation -->

**Brief:** SPIKE_F2a_RECURRENCE_14 | **Date:** 2026-05-13 | **Author:** architect
**Status:** ANALYSIS-COMPLETE — symptomatic cure recommended as permanent; F1 remains best structural fix
**Cross-links:** [headlock-and-worktree-root-cause](./2026-05-12-headlock-and-worktree-root-cause.md) | [head-lock-self-cure](../protocols/head-lock-self-cure.md)

---

## 1. F2a Deployment Verification

**F2a Option A shipped c60, commit `d127fb18`.** Confirmed deployed in current `docker-compose.yml`:

| Mount (before F2a) | Mount (after F2a — current) |
|---|---|
| `- ./docs/data:/app/docs/data:ro` (dir bind-mount) | 3 per-file `:ro` mounts (project-stats, stock-classification, alert-verdicts) |

**Remaining bind-mounts in mcp-server (all still present):**

| Path | Type | VirtioFS scan risk |
|---|---|---|
| `./mcp.config.json` | single-file `:ro` | Low — single file, static |
| `./reports` | dir rw bind-mount | **HIGH** — writable dir, active host writers |
| `./docs/agent-memory` | dir rw bind-mount | **HIGH** — writable dir, active host writers |

F2a **never targeted** `./reports` or `./docs/agent-memory`. These were explicitly deferred (c59 verify-first audit found host-writer conflicts; F2b-reports and F2b-agent-memory not yet shipped).

**Named volume** `market_data:` is fully deployed for all DB paths. That was the original Sprint 1336 fix for SQLite corruption — not the headlock fix.

---

## 2. Why F2a Did Not Fix the Recurrence

**F2a was scoped to one problem dir (`./docs/data/`). VirtioFS scans the entire project root, not individual subdirs.**

The VirtioFS mechanism (H4 CONFIRMED c57): Docker Desktop VirtioFS/GRPCFUSE shares the project root with the VM because ANY bind-mount under the project tree causes the VM to track the parent. `com.apple.Virtualization.VirtualMachine.xpc` (PID 51247) opens fd on `.git/HEAD.lock` during git's atomic create→write→rename→unlink sequence, racing git's cleanup.

Evidence confirms identical fingerprint across all 14 occurrences:
- Same PID: 51247
- Same command: `com.apple.Virtualization.VirtualMachine.xpc`
- Same pattern: 0-byte lock, `:r` fd, no live git pid, age 90-120s
- c62 lsof (T033610Z): `*080r REG … .git/HEAD.lock` — identical to c63 lsof (T050521Z): `*583r REG … .git/HEAD.lock`

**F2a reduced the VirtioFS dir-scan surface from 4 dirs to 3.** It did not eliminate the VM's awareness of the project root. As long as `./reports` or `./docs/agent-memory` remain as dir bind-mounts, Docker Desktop continues to watch the full project tree including `.git/`.

F2a was a partial necessary step, not a sufficient fix. The original F2 spec (named volumes replacing bind-mounts) would cut Docker's project root awareness, but the verify-first audit showed both remaining dirs have active host writers that cannot reach named volumes.

---

## 3. Next Options Ranked

| Rank | Option | Mechanism | Effort | Expected outcome |
|---|---|---|---|---|
| 1 | **F1 — Docker file-sharing exclusion** | Add project `.git/` to Docker Desktop → Settings → Resources → File Sharing exclusion list. macOS user action only, no code change. | USER — 2 min | Eliminates VirtioFS fd race at root. VM no longer opens `.git/` fds. **Highest probability of permanent fix.** |
| 2 | **Symptomatic PREFLIGHT cure — permanent** | Keep current PREFLIGHT safe-remove guard as permanent production behavior, not temporary mitigation. Rename signal from "workaround" to "operational policy". Update `head-lock-self-cure.md` to reflect permanent status. | Dev — 15 min (doc-only) | Zero occurrences blocked (cured in ≤1s at cycle start). Observability restored: 14 occurrences = 14 PREFLIGHT cures = 100% success rate. Recurrence rate unchanged but impact = zero. |
| 3 | **F4 retry wrapper** | Shipped c59 (`fb3093ae`). Already active. Defense-in-depth for mid-cycle races. | Done | Handles intra-cycle races; does not prevent PREFLIGHT-era lock accumulation. |
| 4 | **F2b-reports + F2b-agent-memory** | Redesign host-writer workflows so `./reports` and `./docs/agent-memory` writes go through container or a non-project-root path; then migrate to named volumes | L-size — workflow redesign required | Would eliminate remaining 2 high-risk dirs. Complex. No guarantee VirtioFS stops watching project root (Docker may scan regardless of mount count). Risk: breaks QA report generation, cowork notebooks. |

---

## 4. Recommended Decision for PO/USER

**Adopt option 2 (symptomatic cure permanent) immediately. Queue option 1 (F1) as a USER 2-minute action.**

Rationale:

1. **F1 is the only fix that addresses root cause at the OS layer.** It requires no code change, no workflow redesign, no risk. It is blocked solely by it being a user action in Docker Desktop UI. If the user does this once, the lock recurrence stops permanently.

2. **PREFLIGHT safe-remove has zero failures across 14 occurrences.** It is already working as a production safety net. Formally accepting it as permanent (updating `head-lock-self-cure.md` status) restores observability — the PO can track "N PREFLIGHT cures this sprint" as a health metric rather than treating each occurrence as an open incident.

3. **F2b is disproportionate.** The architectural cost (redesigning QA report paths + cowork notebook write paths) exceeds the benefit when F1 is a 2-minute user action. F2b should remain in backlog but not be prioritized while F1 is unblocked.

4. **F2a observability assessment:** F2a is deployed and correct. It eliminated one dir scan vector. It simply was never sufficient on its own, per the original brief's own scoping note. F2a = closed, not failed.

**USER action required (queue item):** Docker Desktop → Settings → Resources → File Sharing → Add exclusion: `<project-root>/.git`. Takes 2 minutes. No restart required. Eliminates H4 root cause permanently.

**Dev action (doc-only, SPRINT-S):** Update `docs/protocols/head-lock-self-cure.md` — change status from "temporary workaround" to "permanent operational policy"; add note that F1 user action is the structural cure. Closes the open incident count.
