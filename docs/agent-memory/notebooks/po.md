# PO Notebook

## Cycle 2026-05-29T16:56Z — VNH-SECTOR-FIX triage (user-tracked code bug)

**Spawn:** direct user-tracked bug routed to PO. Triaged + authored sprint, no implementation (router rule).

**Bug:** `seedWatchlist.ts:83` seeds VNH `domain:"real_estate"`. VNH = CTCP Đầu tư Việt Việt Nhật = seafood/food import-export, HNX. Wrong label → market.db → `get_cycle_bootstrap` → ALL cowork agents mislabel VNH as real-estate (alerts/notebooks/signals/public FB draft). Fleet-wide data-integrity.

**Verified before deciding:**
- canonical union `DomainType` @ `apps/mcp-server/bctc-schema.ts:26-47` — NO `seafood`/`food`/`consumer` member. `domain` field in seed is typed `string` (no compile guard) — that's WHY the bad value slipped in.
- `SECTOR_NAME_VI` (sectorPeers.ts:190+) is `Record<DomainType,string>`; `agriculture = "Nông nghiệp & Thủy sản"` (Agriculture & Seafood); `agriculture` peers = VHC/ANV (seafood/aquaculture). → seafood's in-union home IS `agriculture`.

**PO DECISION — VNH domain → `agriculture`** (NOT a new `seafood` enum; that'd break Record<DomainType> + invent a union member — the trap the task warned of).

**Audit of rest of seed (spot-check vs real identities):** only VNH has a WRONG *value*. 3 comments factually wrong (value still defensible): TCH comment "Techcombank"→ actually Hoang Huy (TCB is the bank); DPM "Daphaco"→ Đạm Phú Mỹ; DAG "Da Nang Rubber"→ Đông Á Plastic (DRC is the rubber co). Folded comment-corrections into IMPL scope.

**Chain authored (TASKS.md → Sprint VNH-SECTOR-FIX):** ba → dev-mcp-server → ops → qa → po. Guard pattern = existing `1787-gvr-sector-fix.test.ts` (precedent: prior GVR sector bug got its own test). Critical: seed UPSERT alone WON'T fix running DB (only fires on re-insert) → ops must run explicit idempotent `UPDATE` + rebuild (memory: rebuild-after-dev-change), verify by direct in-container market.db query.

**Next:** main terminal routes BATCH[VNH-BA] to **ba** to write `docs/REQ_VNH-SECTOR-FIX.md`.

### Carry-over
- VNH fix is data-integrity HIGH; done bar = DB-verified-in-running-container, not seed-edit-alone. Don't false-green on seed commit.
- Today's FB draft / historical notebooks are artifacts — separate path fixes them; this sprint = source+DB recurrence-stop only.
- Prior-cycle backlog still open: signals.db drain dead since 22-May; TASKS.md over 80L cap.
