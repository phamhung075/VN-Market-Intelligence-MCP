/**
 * /dashboard/bctc-eval — BCTC extraction quality scorecard list view.
 *
 * Loader: GET /api/bctc-eval (mcp-server, MCP_SERVER_BASE_URL env)
 * Table: Ticker | Period | Overall | S1..S6 | Computed | Stale + Recompute
 * Sort: trust-ascending (red → yellow → green), as returned by server — no client re-sort.
 * Schema version check: if schema_version !== "1" render mismatch error card.
 * Error state: show Card with API error, do NOT throw (keeps UX recoverable).
 *
 * loadBctcEvalListData() is exported separately from loader() so it can be
 * unit-tested directly — Remix's vite plugin strips the `loader` export in
 * jsdom test runs (server-only tree-shaking), so tests must import a plain
 * named function instead (see dashboard.alerts.tsx fetchAlertsData for the
 * established pattern).
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { fetchBctcEvalList, BctcEvalApiError } from "~/lib/api/bctc-eval-client";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { EvalTable } from "~/components/bctc-eval/EvalTable";
import type { EvalReportSummary } from "~/domain/bctc-eval";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "BCTC Eval — VN Market Intelligence" },
];

// --------------------------------------------------------------------------
// Loader
// --------------------------------------------------------------------------

type LoaderOk = {
  ok: true;
  reports: EvalReportSummary[];
  sort: string;
  thresholds_version: string;
};

type LoaderError = {
  ok: false;
  error: string;
};

type LoaderData = LoaderOk | LoaderError;

/**
 * Fetches + shapes the eval list. NEVER throws — any upstream failure
 * (non-2xx, network error, schema mismatch) resolves to { ok: false, error }
 * so the page always renders (200), never bubbles to the root error boundary.
 */
export async function loadBctcEvalListData(): Promise<LoaderData> {
  try {
    const list = await fetchBctcEvalList();
    if (list.schema_version !== "1") {
      return {
        ok: false,
        error: `Schema version mismatch: expected "1", got "${list.schema_version}". Deploy the latest frontend build.`,
      };
    }
    return {
      ok: true,
      reports: list.reports,
      sort: list.sort,
      thresholds_version: list.thresholds_version,
    };
  } catch (err) {
    const message =
      err instanceof BctcEvalApiError
        ? `API error ${err.status}: ${err.message}`
        : err instanceof Error
          ? err.message
          : "Unknown error fetching BCTC eval list";
    return { ok: false, error: message };
  }
}

export async function loader(_args: LoaderFunctionArgs) {
  const data = await loadBctcEvalListData();
  return json<LoaderData>(data);
}

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export default function BctcEvalListPage() {
  const data = useLoaderData<typeof loader>();

  if (!data.ok) {
    return (
      <Card className="border-red-800 bg-slate-800">
        <CardHeader>
          <CardTitle className="text-red-400">BCTC Eval — Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-300">{data.error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="BCTC Eval Scorecard"
        actions={
          <span className="text-xs text-slate-400">
            Thresholds: {data.thresholds_version} &middot; Sort: {data.sort}
          </span>
        }
      />
      <EvalTable reports={data.reports} />
    </div>
  );
}
