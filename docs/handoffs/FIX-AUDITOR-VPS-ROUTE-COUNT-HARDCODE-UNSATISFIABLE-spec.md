# Fix Spec — FIX-AUDITOR-VPS-ROUTE-COUNT-HARDCODE-UNSATISFIABLE

**Task:** FIX-AUDITOR-VPS-ROUTE-COUNT-HARDCODE-UNSATISFIABLE · P2 · S · zone `cross-service/`
**Mode:** `supervised:true` + `plan_only:true` — this document is a PLAN only. No live edit was made to
`docs/agents/system-auditor/flow/main.md`, `docs/agents/orch-sentinel/flow/dim-oh3-auditor-blindspot.md`,
or `docs/agents/system-auditor/audit-dimensions.md` by this cycle.
**Produced by:** developer, 2026-08-08 (session 165f4245)
**Handoff to:** po (adjudicates the diffs below, then routes to a fix-authorized agent for landing)
**Origin:** PO-measured 2026-07-29T10:44Z, `created_by: po`
**Constraint honored:** read-only against live services throughout — all tool calls below were
`get_vps_proxy_health` / `get_vps_service_health` (no docker exec, no POST, no restarts).

---

## 0. Live re-verification (do not trust the row's own line citations — re-derive)

The row's own text cites `main.md:211`. **Stale** — the file has grown since 2026-07-29 (now 1240 lines,
size-justification header documents ~10 intervening deltas). Live-grepped 2026-08-08: the actual bullet is
at **`docs/agents/system-auditor/flow/main.md:407`**, inside `### Per-Source Fetch Freshness (B-01 through
B-07, B-11, B-12)` (heading at line 388). The two tool calls the row cites at `main.md:195-196` are now at
**lines 391-392**. Exact live text at line 407 (verified `sed -n`):

```
- VPS proxy: all 7 routes must return `status: ok` (B-06, B-07)
```

---

## 1. Root cause, re-confirmed live (three numbers, still no two agree)

| Source | Live value (2026-08-08) | Command |
|---|---|---|
| Flow doc literal | `7` | `sed -n '407p' docs/agents/system-auditor/flow/main.md` |
| SSOT | `8` | `jq '.project.infrastructure.vps.routes \| length' docs/data/system-map.json` |
| Live tool | `4` rows, none named as "routes" | `get_vps_proxy_health` (via `mcp_call`, this session) |

`jq -r '.project.infrastructure.vps.routes[].source_id' docs/data/system-map.json` (live output today):
```
ssc-iboard
bctc-discover
muasamcong
bctc-push
foreign-flow
sbv-vps
news-vps
vietstock-agm-plan
```

Live `get_vps_proxy_health` (`mcp_call`, this session, 2026-08-08):
```
Service     | Last Push           | Items | Status  | 24h Pushes | 24h Errors | Stale?
------------|---------------------|-------|---------|------------|------------|-------
prices      | 2026-08-07 08:59:24 | 110   | ok      | 0          | null       | no
news        | 2026-08-08 07:13:41 | 2     | ok      | 58         | 0          | no
sbv         | 2026-08-08 07:07:48 | 1     | ok      | 15         | 0          | no
bctc        | 2026-08-04 08:34:40 | 1     | ok      | 0          | null       | idle-no-work
```
4 rows, service labels `prices|news|sbv|bctc` — not route paths, not source_ids, not a count of 7 or 8.

**Why the tool structurally cannot ever report 8 (or 7) route statuses** — code-level, not a config
tweak: `apps/mcp-server/src/infrastructure/db/vpsPushLogStore.ts` `getVpsProxyHealth()`:
```ts
const services: VpsService[] = ["prices", "news", "sbv", "bctc"];
```
This list is a hardcoded 4-entry literal (a second, separate hardcode bug from the one this task
targets, in a different zone — `apps/mcp-server/`, `dev-mcp-server` territory, noted as an adjacent
finding in §7, not fixed here). Even the `VpsService` type union additionally allows `"foreign-flow"`,
but `getVpsProxyHealth()` never queries it — dead branch. So `get_vps_proxy_health` is a PUSH-LOG
aggregate over async push events, one row per named push-service, not a per-route reachability probe —
it cannot be placed in 1:1 correspondence with `routes[]` by any config change, only by different code.

Live `get_vps_service_health` (`mcp_call`, this session, 2026-08-08):
```
Service         | Status      | Last Poll  | Response(ms) | VPS Uptime
----------------|-------------|------------|--------------|---------------
vn-bctc-fetch   | unhealthy   | 3m ago     | 0            | 3d 8h 45m
vn-foreign-flow | idle        | 3m ago     | 0            | -
vn-news-fetch   | healthy     | 3m ago     | 0            | -
vn-price-fetch  | idle        | 3m ago     | 0            | -
vn-sbv-fetch    | healthy     | 3m ago     | 0            | -
```
5 rows — systemd-unit-level aggregates (`apps/mcp-server/src/domain/services/vpsHealthPoller.ts`,
`DEFAULT_FRESHNESS_CONFIGS`), each mapped to one DB table's freshness. Also not 1:1 with `routes[]`.

### Route → tool-plane coverage map (hand-derived, cannot be joined generically — no shared key)

| route `source_id`     | proxy-plane `service` | service-plane `serviceName` | coverage |
|------------------------|------------------------|-------------------------------|----------|
| `ssc-iboard`           | `prices`               | `vn-price-fetch`              | both |
| `bctc-discover`        | `bctc` (shared)        | `vn-bctc-fetch` (shared)      | both, shared signal w/ bctc-push |
| `bctc-push`            | `bctc` (shared)        | `vn-bctc-fetch` (shared)      | both, shared signal w/ bctc-discover |
| `sbv-vps`              | `sbv`                  | `vn-sbv-fetch`                | both |
| `news-vps`             | `news`                 | `vn-news-fetch`               | both |
| `foreign-flow`         | *(none — dead branch)* | `vn-foreign-flow`             | single-plane (service only) |
| `muasamcong`           | *(none)*               | *(none)*                      | **zero coverage** |
| `vietstock-agm-plan`   | *(none)*               | *(none)*                      | **zero coverage** |

`muasamcong` and `vietstock-agm-plan` have their own scheduler jobs (`publicContractsJob.ts`,
`agmPlanJob.ts`) and ARE covered by the generic per-source freshness pool one section up (via
`get_pipeline_health`/`get_sla_status`, B-01..B-07/B-11/B-12) — but that is an end-to-end data-arrival
signal, not a VPS-route/proxy-reachability signal, and cannot distinguish "route down" from "no new
government contract posted this period." No route-reachability signal exists for these 2 routes today.

**Conclusion for `why_the_obvious_fixes_are_wrong` item (2):** re-scoping is required, not a number
swap. 6 of 8 routes have at least one real health-tool signal (5 dual-plane, 1 single-plane); 2 of 8
have none. The fix below encodes exactly this, live-derived, never hardcoded.

---

## 2. Proposed fix — `docs/agents/system-auditor/flow/main.md:407`

### Verbatim diff

**Before:**
```
- VPS proxy: all 7 routes must return `status: ok` (B-06, B-07)
```

**After** (replaces the single bullet; the following `Rate limits:` bullet at :408 is unchanged and stays
immediately after):
```markdown
- **VPS route status (B-06, B-07)** — derive the expected route set from SSOT every cycle, never
  restate its size as a literal:
  ```bash
  jq -r '.project.infrastructure.vps.routes[].source_id' docs/data/system-map.json
  ```
  (Live output today: `ssc-iboard`, `bctc-discover`, `muasamcong`, `bctc-push`, `foreign-flow`,
  `sbv-vps`, `news-vps`, `vietstock-agm-plan` — read the array live each cycle, do not hardcode
  either the count or this list; FIX-AUDITOR-VPS-ROUTE-COUNT-HARDCODE-UNSATISFIABLE: a prior literal
  count here disagreed with both this SSOT array and the tool below, and was unsatisfiable by
  construction.)

  Neither tool called above (L391-392) reports true per-route status. `get_vps_proxy_health` returns
  PUSH-SERVICE aggregates (`prices`/`news`/`sbv`/`bctc`) — `apps/mcp-server/.../vpsPushLogStore.ts`
  `getVpsProxyHealth()` hardcodes that fixed service list, structurally incapable of a 1:1 route
  match. `get_vps_service_health` returns systemd-unit aggregates (`vn-price-fetch`/`vn-bctc-fetch`/
  `vn-news-fetch`/`vn-sbv-fetch`/`vn-foreign-flow`). Resolve each route's coverage via this
  hand-authored mapping (the 3 naming schemes — SSOT `source_id`, push-log `service`, systemd
  `serviceName` — are independent enums with no shared key, cannot be joined generically):

  | route `source_id`     | proxy-plane `service`         | service-plane `serviceName` |
  |------------------------|--------------------------------|------------------------------|
  | `ssc-iboard`           | `prices`                       | `vn-price-fetch`             |
  | `bctc-discover`        | `bctc` (shared w/ bctc-push)   | `vn-bctc-fetch` (shared)     |
  | `bctc-push`            | `bctc` (shared w/ bctc-discover)| `vn-bctc-fetch` (shared)   |
  | `sbv-vps`              | `sbv`                          | `vn-sbv-fetch`               |
  | `news-vps`             | `news`                         | `vn-news-fetch`              |
  | `foreign-flow`         | *(none — see note)*            | `vn-foreign-flow`            |
  | `muasamcong`           | *(none)*                       | *(none)*                     |
  | `vietstock-agm-plan`   | *(none)*                       | *(none)*                     |

  Note on `foreign-flow`: `VpsService` type union in `vpsPushLogStore.ts` includes it, but
  `getVpsProxyHealth()`'s hardcoded services array never queries it — dead branch, not fixed here
  (out of zone; flag as its own follow-up if desired).

  **Verdict per route, every cycle:**
  1. No mapping in either plane (`muasamcong`, `vietstock-agm-plan` today) → FLAG WARN, never PASS —
     `dedup_key: vps_route_no_coverage:<source_id>:B-06`, same 7-day dedup as every other check. This
     is a standing tracked gap, not a fresh finding each cycle.
  2. Mapped in the service-plane only (`foreign-flow`) → route status = that plane's status verbatim;
     log `"[B-06/B-07] foreign-flow: single-plane coverage (service-health only)"` so the weaker
     corroboration is visible, not silently treated as equal to the dual-plane routes.
  3. Mapped in both planes (the remaining 5) →
     - Both planes agree ok/healthy → route PASS.
     - Exactly one plane disagrees → route WARN (single-plane disagreement; corroborate before
       CRITICAL, same philosophy as the BCTC Healthy-Idle Gate below).
     - BOTH planes disagree for the same route (proxy-plane non-`ok` AND service-plane `unhealthy`
       for the mapped pair) → route CRITICAL.

  **Cycle verdict:** B-06/B-07 is PASS only if every dual-plane and single-plane route above resolves
  PASS/healthy AND `get_vps_service_health`'s result set contains zero `unhealthy` entries — an
  unhealthy entry there ALWAYS blocks a bare PASS, even when `get_vps_proxy_health` reads all-`ok`
  (closes the cross-plane gap: a cycle must never declare B-06/B-07 PASS from the proxy/freshness
  plane alone while the service plane disagrees). The no-coverage routes never count toward PASS or
  FAIL; they always emit their own standing WARN line, so a clean cycle reads e.g. "B-06/B-07: all
  observable routes ok — `muasamcong`/`vietstock-agm-plan` have no live health-tool coverage, tracked
  gap" rather than a bare, misleading "PASS".
```

Emit any FLAG/WARN/CRITICAL above via the existing `scripts/emit-audit-signal.sh` template at
§Emit per stale source (`main.md:534-541`, unchanged) — no new emit mechanism needed, only new call
sites with `--check-id "B-06"` or `"B-07"` and the `dedup_key`s named above.

**Self-check — this replacement introduces zero new hardcoded route-count literals.** Verified by
running the OH-3.2 Leg-2 regression regex (§4 below) against this exact After-text: zero matches.

---

## 3. Second arm — cross-plane PASS-masking, demonstrated

### Verdict-logic reproduction (live-verified, both scenarios)

A small reference implementation of §2's verdict table (`verdict_demo.py`, not wired into any live
flow — pure demonstration) was run against two inputs: today's live tool output (§1 above) and the
2026-07-29T10:44Z fixture already recorded in this row's own `evidence` field.

**RUN A — today, 2026-08-08 (live-called this session):**
```
ssc-iboard             -> PASS (proxy=ok, service=idle)
bctc-discover          -> WARN (proxy=ok, service=unhealthy)
muasamcong             -> FLAG (no plane coverage; dedup_key vps_route_no_coverage:muasamcong:B-06)
bctc-push              -> WARN (proxy=ok, service=unhealthy)
foreign-flow           -> PASS (single-plane service=idle)
sbv-vps                -> PASS (proxy=ok, service=healthy)
news-vps               -> PASS (proxy=ok, service=healthy)
vietstock-agm-plan     -> FLAG (no plane coverage; dedup_key vps_route_no_coverage:vietstock-agm-plan:B-06)
CYCLE VERDICT: B-06/B-07 CANNOT be a bare PASS -- get_vps_service_health has >=1 unhealthy entry
```

**RUN B — 2026-07-29T10:44Z fixture (vn-sbv-fetch AND vn-bctc-fetch both unhealthy, per this row's own
`evidence`):**
```
ssc-iboard             -> PASS (proxy=ok, service=idle)
bctc-discover          -> WARN (proxy=ok, service=unhealthy)
muasamcong             -> FLAG (no plane coverage; dedup_key vps_route_no_coverage:muasamcong:B-06)
bctc-push              -> WARN (proxy=ok, service=unhealthy)
foreign-flow           -> PASS (single-plane service=idle)
sbv-vps                -> WARN (proxy=ok, service=unhealthy)
news-vps               -> PASS (proxy=ok, service=healthy)
vietstock-agm-plan     -> FLAG (no plane coverage; dedup_key vps_route_no_coverage:vietstock-agm-plan:B-06)
CYCLE VERDICT: B-06/B-07 CANNOT be a bare PASS -- get_vps_service_health has >=1 unhealthy entry
```

RUN B is the exact 2026-07-29 incident shape (proxy plane all-`ok`, service plane 2 unhealthy) that
the live cycle that cycle wrongly marked B-06/B-07 PASS from. Under the proposed logic it cannot: the
`get_vps_service_health` unhealthy entries block a bare PASS outright, satisfying acceptance (3)
directly against the cited fixture.

---

## 4. Acceptance criteria — explicit disposition

| # | Criterion | Disposition |
|---|---|---|
| 1 | No literal route count remains in main.md; show the jq expression and its live output | §1/§2 — jq expression + live 8-entry output shown; §2's After-text contains zero bare integers followed by "routes" (self-tested, see §2 footer and §4-Leg-2 below) |
| 2 | Route present in `routes[]` but absent from the health tool's response → FLAGGED, never silent PASS | §3 RUN A/B — `muasamcong`/`vietstock-agm-plan` FLAG in both runs, never counted toward PASS |
| 3 | `get_vps_service_health` unhealthy service blocks B-06/B-07 PASS, demonstrated against the 2026-07-29 fixture | §3 RUN B — CYCLE VERDICT explicitly "CANNOT be a bare PASS" on the exact fixture |
| 4 | OH-3.2 counts `routes[]` rather than `geo_blocked` data_sources, or states explicitly why not | §5 below — Leg 1 now reads `routes \| length` directly; the retired `geo_blocked` leg's rationale is stated explicitly (§5) |
| 5 | Report whether unhealthy `vn-sbv-fetch` caused the `sbv_fx` B-12 staleness; if so, note it on `FIX-AUDITOR-B12-DOUBLE-INVOKE-EMIT-MARKER-LOSS` too | §6 below |

---

## 5. Proposed fix — OH-3.2, `docs/agents/orch-sentinel/flow/dim-oh3-auditor-blindspot.md:24-31`

The task's own `why_the_obvious_fixes_are_wrong` (4) is correct: OH-3.2's current 3 legs never counted
`routes[]` at all. Live-tested this session, all 3 legs of the *current* text:
- `grep -c "geo.block\|route" docs/references/vps-setup*.md` → prints **4 separate per-file counts**
  (`vps-setup-services.md:1`, `vps-setup-deployment.md:0`, `vps-setup.md:1`,
  `vps-setup-endpoints.md:0`) — not a single "doc-declared" number at all, and those 4 docs describe
  the PUSH-SERVICE/systemd plane and the local push-RECEIVER endpoints, never the 8 geo-blocked
  `/proxy/*` routes — this leg was structurally incapable of ever producing a route count.
- `jq '[.project.data_sources[] | select(.geo_blocked == true)] | length'` → `8`, numerically equal to
  `routes[]` length today, but a different SSOT set (see below).
- `get_vps_proxy_health` → 4 rows, same structural mismatch as §1.

### Verbatim diff

**Before:**
```
## OH-3.2 — VPS Route Count Drift (3-way compare)

​```bash
grep -c "geo.block\|route" docs/references/vps-setup*.md
jq '[.project.data_sources[] | select(.geo_blocked == true)] | length' docs/data/system-map.json
call_tool(server="vn-market", tool="get_vps_proxy_health", arguments={})
​```
**Flag:** `MED` on any mismatch across the 3 counts (doc-declared vs system-map vs live).
```

**After:**
```
## OH-3.2 — VPS Route Count Drift (SSOT-internal hardcode regression guard)

​```bash
# Leg 1 — SSOT authoritative count (never hardcode elsewhere; this line IS the source of truth):
ROUTE_COUNT=$(jq '.project.infrastructure.vps.routes | length' docs/data/system-map.json)

# Leg 2 — sweep system-auditor's OWN docs for a literal hardcoded route-count phrase that could
# silently drift from Leg 1 (the exact defect class of FIX-AUDITOR-VPS-ROUTE-COUNT-HARDCODE-
# UNSATISFIABLE — main.md previously hardcoded a stale count against an 8-entry SSOT array):
grep -noE '[Aa]ll [0-9]+ routes|[0-9]+ (geo-blocked )?routes' \
  docs/agents/system-auditor/flow/main.md docs/agents/system-auditor/audit-dimensions.md
​```
**Flag:** `MED` if any Leg-2 hit's captured integer != `$ROUTE_COUNT`.

**Retired, do not reintroduce:**
- `data_sources[] | select(.geo_blocked==true)` — numerically coincides with `routes[]` length today
  (both currently the same count) but is a DIFFERENT SSOT set (asks "is this source geo-blocked", not
  "does this source have a VPS route") with no structural invariant tying the two together; it could
  silently diverge (a geo-blocked source added with no route, or vice versa) without ever being
  caught by comparing itself to itself under a different filter. Count `routes[]` directly (Leg 1)
  instead — this is acceptance criterion (4) of FIX-AUDITOR-VPS-ROUTE-COUNT-HARDCODE-UNSATISFIABLE.
- a `get_vps_proxy_health` live-tool leg — that tool returns push-service aggregates, not routes, and
  is structurally incapable of ever equaling `routes[]` length (would either permanently false-flag
  or duplicate main.md's own B-06/B-07 per-route coverage table here; that table is the correct owner
  of live per-route health — this check stays a cheap doc/SSOT hardcode sweep, not a coverage
  re-implementation). Full 3-plane analysis: §1 above / root_cause of this task.
```

### Proof — Leg 2 catches the exact defect today, and is silent after landing

Live-run this session:
```
$ grep -noE '[Aa]ll [0-9]+ routes|[0-9]+ (geo-blocked )?routes' \
    docs/agents/system-auditor/flow/main.md docs/agents/system-auditor/audit-dimensions.md
docs/agents/system-auditor/flow/main.md:407:all 7 routes
docs/agents/system-auditor/audit-dimensions.md:26:7 geo-blocked routes
```
Both hits: `7 != 8` (Leg 1 live value) → MED, correctly, today, on both pre-fix files.

After simulating BOTH this fix's main.md diff (§2) AND the trivial audit-dimensions.md line 26 fix
below (§7, bundle recommended in the same landing commit), the identical Leg-2 command returns **zero
matches** — clean, live-verified this session (scratch copies, not the tracked files).

---

## 6. Acceptance (5) — was unhealthy `vn-sbv-fetch` the cause of the `sbv_fx` B-12 staleness?

**Yes — same underlying data-staleness condition, not an independent coincidence.** Both consumers
read the identical source column:

- `get_vps_service_health`'s `vn-sbv-fetch` check: `sbv_rates.fetched_at`, threshold **35 min**
  (`apps/mcp-server/src/domain/services/vpsHealthPoller.ts` comment + `DEFAULT_FRESHNESS_CONFIGS`
  `serviceName: "vn-sbv-fetch"` entry).
- `sbv_fx` (the B-12 finding's dedup subject): `SELECT MAX(fetched_at) FROM sbv_rates`
  (`apps/mcp-server/src/interface/mcp/tools/system/dataFreshnessTools.ts` `SIGNAL_QUERIES.sbv_fx`),
  SLA threshold **30 min on VN business days**
  (`apps/mcp-server/src/domain/services/freshnessSlaChecker.ts`
  `SBV_BUSINESS_DAY_ONLY_SOURCES`, confirmed 30-min tight SLA in
  `apps/mcp-server/src/__tests__/FIX-SLA-EXEMPT-NEWS-SBVFX.test.ts` S-2/S-7).

Both are derived from `sbv_rates.fetched_at`. Because 30 min < 35 min, ANY staleness age that trips
`vn-sbv-fetch` unhealthy (age > 35 min) has, by construction, already exceeded the tighter `sbv_fx`
30-min SLA threshold first. The two findings are two different consumers/thresholds reading the SAME
underlying staleness — not merely correlated, but mechanically guaranteed to co-occur whenever the
underlying push genuinely lags past 35 minutes. This corroborates (does not merely repeat) the row's
own framing ("most plausible cause") with a stronger, code-cited mechanical link.

**Caveat, not this task's scope:** `FIX-VPS-SBV-HEALTH-SHARED-TABLE-IS-ESTIMATE` (BACKLOG) notes
`vn-sbv-fetch`'s health read is itself potentially confounded by a local `is_estimate=1` fallback
sharing the same `sbv_rates` table — that row's scope is unaffected by this fix (this task consumes
`get_vps_service_health`'s verdict as-is per its own read-only constraint) but the same blind spot
would carry into the new B-06/B-07 logic in §2 (the `vn-sbv-fetch` mapping cell). Not fixed here;
cross-referenced only.

**Action taken:** cross-reference note appended (via `orch-apply.sh`, additive field, does not alter
that row's own already-REVIEW-status root cause/fix) to
`FIX-AUDITOR-B12-DOUBLE-INVOKE-EMIT-MARKER-LOSS` per acceptance (5)'s explicit instruction. See
closeout note at the end of this document for the exact field written.

---

## 7. Adjacent findings (NOT this task's scope as literally written — flagged for PO)

1. **`docs/agents/system-auditor/audit-dimensions.md:26`** — `"VPS proxy health (7 geo-blocked
   routes)"` is the SAME hardcode-class defect, in the canonical dimension registry cross-referenced
   by check-ID from `main.md`. Task scope names only `main.md` and `dim-oh3-auditor-blindspot.md`, but
   this file is read-only prose (not executed flow logic) and the fix is a trivial 1-line swap
   (proposed below) with zero behavioral risk. **Recommend bundling into the same landing commit** —
   if it ships separately or later, the new OH-3.2 Leg-2 guard (§5) will correctly (not spuriously)
   MED-flag it in the interim; that is expected, not a bug in the new guard.

   Proposed line-26 diff:
   ```diff
   -VPS proxy health (7 geo-blocked routes)
   +VPS route status (`.project.infrastructure.vps.routes[]` in system-map.json — see main.md B-06/B-07 for the live per-route coverage table)
   ```
   Self-tested against the OH-3.2 Leg-2 regex: zero matches after this change (§5 proof).

2. **`apps/mcp-server/src/infrastructure/db/vpsPushLogStore.ts` `getVpsProxyHealth()`** — hardcodes
   `services = ["prices","news","sbv","bctc"]`, silently excluding `foreign-flow` even though the
   `VpsService` type union already includes it (dead branch, §1/§2). Zone `apps/mcp-server/`
   (`dev-mcp-server`), TypeScript — outside this row's `cross-service/` doc-zone and outside developer's
   direct-write remit per the zone dispatch table. Worth a follow-up FIX row if PO wants `foreign-flow`
   promoted from single-plane to dual-plane coverage in §2's table; not required for this task's
   acceptance criteria (single-plane coverage is explicitly handled, not silently dropped).

3. **The old OH-3.2 Leg-1 `grep -c` was never producing a "doc-declared route count" at all** — it
   returns 4 per-file line-match counts against docs (`vps-setup-*.md`) that describe the PUSH/
   systemd plane, never the 8 `/proxy/*` routes. No living doc anywhere lists the 8 geo-blocked proxy
   routes by name except `system-map.json` itself (repo-wide grep for 4 route-literal path strings
   turns up only historical spikes/handoffs/archives, no current reference doc). §5's redesign drops
   this leg entirely rather than trying to repair it into something meaningful, since no such
   reference doc exists to grep.

---

## 8. Implementation notes for whoever ships this

- Two files to edit for the core fix: `docs/agents/system-auditor/flow/main.md` (§2, replaces line
  407 only, following `Rate limits:` bullet at :408 unaffected) and
  `docs/agents/orch-sentinel/flow/dim-oh3-auditor-blindspot.md` (§5, replaces lines 24-31).
  Recommended (not required) same-commit bundle: `docs/agents/system-auditor/audit-dimensions.md`
  line 26 (§7 item 1), trivial 1-line prose swap.
- No script/code changes required — both core edits are Tier-2-interpreted flow-doc prose (main.md)
  and orch-sentinel MODE=FULL prose (dim-oh3), same class as the existing surrounding checks; the
  emit mechanics reuse `scripts/emit-audit-signal.sh` unchanged (§2).
- `verdict_demo.py` (this session's scratchpad, not committed — a throwaway reproduction, not a
  reusable script per `docs/policies/dev-standards.md` § Script Persistence, since nothing in the
  live flow calls it) proved §2's table against both live 2026-08-08 data and the 2026-07-29 fixture;
  re-derivable from §3's tables if a future re-verification is needed.
- Verification after landing: next live OH-1/OH-3 orch-sentinel MODE=FULL cycle should show zero
  OH-3.2 Leg-2 hits (§5 proof); next live Tier-2 system-auditor cycle's B-06/B-07 line should read a
  qualified pass/flag per §2's cycle-verdict template, never a bare unqualified "PASS", and should
  show the 2 no-coverage routes' standing WARN even on an otherwise-clean day.
