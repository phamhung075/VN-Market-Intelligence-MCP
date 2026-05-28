/**
 * /dashboard/bctc-eval — BCTC extraction quality scorecard list view.
 *
 * Loader: GET /api/bctc-eval (mcp-server, MCP_SERVER_BASE_URL env)
 * Table: Ticker | Period | Overall | S1..S6 | Computed | Stale + Recompute
 * Sort: trust-ascending (red → yellow → green), as returned by server — no client re-sort.
 * Schema version check: if schema_version !== "1" render mismatch error card.
 * Error state: show Card with API error, do NOT throw (keeps UX recoverable).
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { fetchBctcEvalList, BctcEvalApiError } from "~/lib/api/bctc-eval-client";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { EvalTable } from "~/components/bctc-eval/EvalTable";
import type { EvalReportSummary } from "~/domain/bctc-eval";

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

export async function loader(_args: LoaderFunctionArgs) {
  try {
    const list = await fetchBctcEvalList();
    if (list.schema_version !== "1") {
      return json<LoaderData>({
        ok: false,
        error: `Schema version mismatch: expected "1", got "${list.schema_version}". Deploy the latest frontend build.`,
      });
    }
    return json<LoaderData>({
      ok: true,
      reports: list.reports,
      sort: list.sort,
      thresholds_version: list.thresholds_version,
    });
  } catch (err) {
    const message =
      err instanceof BctcEvalApiError
        ? `API error ${err.status}: ${err.message}`
        : err instanceof Error
          ? err.message
          : "Unknown error fetching BCTC eval list";
    return json<LoaderData>({ ok: false, error: message });
  }
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">BCTC Eval Scorecard</h1>
        <span className="text-xs text-slate-400">
          Thresholds: {data.thresholds_version} &middot; Sort: {data.sort}
        </span>
      </div>
      <EvalTable reports={data.reports} />
    </div>
  );
}
