/**
 * /dashboard/bctc-eval/:reportId — per-PDF BCTC extraction quality detail view.
 *
 * Loader: GET /api/bctc-eval/{reportId}
 *   200 → render 6-stage scorecard
 *   404 → throw Response (Remix error boundary)
 *   409 → render "Eval not yet computed" Card
 * Schema version check: if schema_version !== "1" render mismatch error Card.
 * "Recompute" button shown when is_stale: true — POSTs then revalidates.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { fetchBctcEvalDetail } from "~/lib/api/bctc-eval-client";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { StatusBadge } from "~/components/bctc-eval/StatusBadge";
import { StageCard } from "~/components/bctc-eval/StageCard";
import { Button } from "~/components/ui/button";
import type { EvalDetailResponse } from "~/domain/bctc-eval";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data || data.state === "not_computed" || data.state === "error") {
    return [{ title: "BCTC Eval Detail — VN Market Intelligence" }];
  }
  const d = data as LoaderOk;
  return [{ title: `BCTC Eval — ${d.detail.ticker} ${d.detail.period}` }];
};

// --------------------------------------------------------------------------
// Loader
// --------------------------------------------------------------------------

type LoaderOk = {
  state: "ok";
  detail: EvalDetailResponse;
};

type LoaderNotComputed = {
  state: "not_computed";
  reportId: string;
};

type LoaderSchemaError = {
  state: "error";
  error: string;
};

type LoaderData = LoaderOk | LoaderNotComputed | LoaderSchemaError;

export async function loader({ params }: LoaderFunctionArgs) {
  const reportId = params["reportId"] ?? "";

  const { data, status } = await fetchBctcEvalDetail(reportId);

  if (status === 404) {
    throw new Response("Report not found", { status: 404 });
  }

  if (status === 409 || data === null) {
    return json<LoaderData>({ state: "not_computed", reportId });
  }

  if (data.schema_version !== "1") {
    return json<LoaderData>({
      state: "error",
      error: `Schema version mismatch: expected "1", got "${data.schema_version}".`,
    });
  }

  return json<LoaderData>({ state: "ok", detail: data });
}

// --------------------------------------------------------------------------
// Components
// --------------------------------------------------------------------------

function RecomputeHeader({ reportId }: { reportId: string }) {
  const fetcher = useFetcher();
  const revalidator = useRevalidator();

  function handleRecompute() {
    fetcher.submit(null, {
      method: "POST",
      action: `/api/bctc-eval/recompute/${reportId}`,
    });
    setTimeout(() => revalidator.revalidate(), 800);
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={fetcher.state !== "idle"}
      onClick={handleRecompute}
    >
      {fetcher.state !== "idle" ? "Recomputing…" : "Recompute"}
    </Button>
  );
}

function NotComputedCard({ reportId }: { reportId: string }) {
  return (
    <Card className="border-yellow-800 bg-slate-800">
      <CardHeader>
        <CardTitle className="text-yellow-400">Eval Not Yet Computed</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-slate-300">
        <p>
          Report <span className="font-mono">{reportId}</span> exists but no eval
          rows have been written yet.
        </p>
        <p>
          Eval rows are written at extraction time. If this report was ingested
          before the BCTC-EVAL-SUBSTRATE deployment, run the one-shot backfill
          script:
        </p>
        <pre className="rounded bg-slate-900 p-2 text-xs">
          docker exec &lt;mcp-server&gt; bun run src/interface/mcp/routes/bctcEvalBackfillRunner.ts
        </pre>
        <p className="text-xs text-slate-400">
          Or wait for the nightly recompute cron (22:02 UTC).
        </p>
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export default function BctcEvalDetailPage() {
  const data = useLoaderData<typeof loader>();

  if (data.state === "not_computed") {
    return <NotComputedCard reportId={data.reportId} />;
  }

  if (data.state === "error") {
    return (
      <Card className="border-red-800 bg-slate-800">
        <CardHeader>
          <CardTitle className="text-red-400">Schema Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-300">{data.error}</p>
        </CardContent>
      </Card>
    );
  }

  const { detail } = data;

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title={`${detail.ticker} ${detail.period}`}
        subtitle={`Detector: ${detail.detector_version} · Report ID: ${detail.report_id}`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={detail.overall_status} />
            {detail.has_pek && (
              <span className="rounded bg-blue-900 px-2 py-0.5 text-xs text-blue-300">
                PEK
              </span>
            )}
            {detail.is_stale && (
              <RecomputeHeader reportId={detail.report_id} />
            )}
          </div>
        }
      />

      {/* 6 stage cards */}
      <div className="space-y-3">
        {detail.stages.map((stage) => (
          <StageCard key={stage.stage_no} stage={stage} />
        ))}
      </div>
    </div>
  );
}
