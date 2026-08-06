/**
 * FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE — macroTools.ts wiring, extracted.
 *
 * Root incident: a tier-4 is_estimate macro_snapshot.vnIndex (1280.5,
 * prevFetchedAt:null) produced a bogus -526.13 "delta" that reached MARKET as
 * fact (dish 933, false ~29% crash) with no same-cycle cross-plane check
 * against apps/mcp-server's own local VN-Index reference.
 *
 * `applyVnIndexPlausibilityGate(data)` MUST be called before both downstream
 * reads of `data` in the `get_macro_snapshot` handler — buildMacroSnapshotText
 * (prose) and the raw `data` field in the returned JSON envelope — a single
 * mutation point upstream of both, so neither channel leaks the untrustworthy
 * number while the other is honest (two-channel-leak risk, architect
 * brownfield findings §C.5/§D.2).
 *
 * FIX-CI-SIZELINT-MACROTOOLS-HUMANIZE-618L precedent: this same file
 * (macroTools.ts) has an established convention of extracting self-contained
 * blocks into a sibling module once they push the file over the size-lint
 * baseline+tolerance (see macroSnapshotText.ts) — this file follows that
 * precedent for the wiring block, zero behaviour change from an inline
 * implementation.
 *
 * DDD layer: interface — orchestrates a domain guard (vnIndexPlausibilityGuard)
 * + an infrastructure read (getVnIndexCache) + an existing domain SLA check
 * (freshnessSlaChecker). Co-located with, but NOT merged into,
 * macroSnapshotGuard.ts (a distinct shape-validity guard, not a value-
 * plausibility guard — see that file's own header).
 *
 * @module interface/mcp/tools/macro/macroVnIndexGate
 */

import { logger } from "../../../../infrastructure/logger.js";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { getVnIndexCache } from "../../../../infrastructure/db/vnIndexCacheStore.js";
import { checkSignalSla } from "../../../../domain/services/freshnessSlaChecker.js";
import { evaluateVnIndexPlausibility } from "../../../../domain/services/vnIndexPlausibilityGuard.js";

/**
 * Mutates `data` in place: when the cross-plane plausibility guard fails,
 * replaces `vnIndex`/`vnIndexDelta`/`vnIndexDirection` with the gap-token
 * contract (`null`/`null`/`"unknown"`). `vnIndex_is_estimate` and
 * `vnIndex_source_tier` are left UNCHANGED — diagnostic, not the leaking
 * channel (FR-1). No-op (never throws) when `data.vnIndex` is absent/invalid
 * or when `data` itself is nullish — mirrors the price>0 convention used
 * throughout this codebase; nothing to protect in that case.
 *
 * Never fails the caller: any local-DB read error degrades to
 * `localReferenceTrustworthy=false` and is logged, exactly like
 * vnIndexRefreshJob.ts's own cache-write catch (a DB error must never 500
 * get_macro_snapshot — new DB dependency in a previously DB-free handler).
 */
export function applyVnIndexPlausibilityGate(data: Record<string, unknown> | null | undefined): void {
  const rawVnIndex = data?.vnIndex as unknown;
  if (typeof rawVnIndex !== "number" || !Number.isFinite(rawVnIndex) || rawVnIndex <= 0) {
    return;
  }

  let localReferenceTrustworthy = false;
  let localVnIndex: number | null = null;
  try {
    const row = getVnIndexCache(getDb(), "VNINDEX");
    if (row !== null && row.price > 0) {
      localVnIndex = row.price;
      const ageMinutes = (Date.now() - new Date(row.fetched_at).getTime()) / 60_000;
      // Reuses freshnessSlaChecker.ts's existing signalType:"price" SLA (10 min
      // market hours, dynamic off-hours window per getSlaThreshold) instead of
      // hand-rolling a new threshold — this is the correct EC-2 mechanism:
      // market-hours-awareness already lives here, fully generalized
      // (holidays, weekends, grace).
      localReferenceTrustworthy = checkSignalSla("price", ageMinutes).status === "ok";
    }
  } catch (dbErr) {
    logger.warn("[get_macro_snapshot] local vn_index_cache read failed (non-fatal)", {
      error: dbErr instanceof Error ? dbErr.message : String(dbErr),
    });
  }

  // FDA-7 precedent: default conservatively when the Go service omits
  // provenance (is_estimate=true, tier=4) rather than optimistically assuming
  // tier-1 live.
  const macroIsEstimate = (data?.vnIndex_is_estimate as boolean | undefined) ?? true;
  const rawTier = data?.vnIndex_source_tier as unknown;
  const macroSourceTier: 1 | 2 | 3 | 4 =
    rawTier === 1 || rawTier === 2 || rawTier === 3 || rawTier === 4 ? rawTier : 4;

  const verdict = evaluateVnIndexPlausibility({
    macroVnIndex: rawVnIndex,
    macroIsEstimate,
    macroSourceTier,
    localVnIndex,
    localReferenceTrustworthy,
  });

  if (!verdict.trustworthy && data) {
    logger.warn("[get_macro_snapshot] vnIndex plausibility gate fired", {
      reason: verdict.reason,
      divergencePct: verdict.reason === "cross_plane_divergence" ? verdict.divergencePct : null,
      macroVnIndex: rawVnIndex,
      localVnIndex,
    });
    // Gap-token contract: vnIndex/vnIndexDelta -> null, vnIndexDirection -> "unknown".
    data.vnIndex = null;
    data.vnIndexDelta = null;
    data.vnIndexDirection = "unknown";
  }
}
