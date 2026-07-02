/**
 * /dashboard/money-radar — REDIRECT-ONLY (superseded by MERGE-MONEY-RADAR-INTO-MOMENTUM).
 *
 * Money Radar P0's cards, DTO/parser/formatter/fetcher family, and default
 * component have all relocated into apps/frontend/app/routes/dashboard.momentum.tsx
 * (Section B — "Radar Dòng Tiền") per docs/handoffs/BA-MERGE-MONEY-RADAR-INTO-MOMENTUM.md
 * FR-2.3. This file is kept (not deleted) solely so bookmarks/deep-links to
 * /dashboard/money-radar do not 404 — it 302-redirects to /dashboard/momentum.
 *
 * api.money-radar.tsx (the JSON resource-route proxy) is UNCHANGED and still
 * feeds the merged loader in dashboard.momentum.tsx.
 *
 * Sprint: MERGE-MONEY-RADAR-INTO-MOMENTUM
 * Task:   WU-1-MERGE-PAGES FR-2.3 / FR-4 / AC4
 */

import { redirect } from "@remix-run/node";

export async function loader() {
  return redirect("/dashboard/momentum", 302);
}
