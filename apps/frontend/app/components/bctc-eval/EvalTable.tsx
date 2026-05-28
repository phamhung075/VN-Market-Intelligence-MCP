/**
 * EvalTable — list view table for BCTC eval scorecard.
 * Renders all reports with per-stage status badges and a Recompute button
 * for stale rows. Server sort order (trust-ascending) is preserved — no
 * client-side re-sort.
 */
import * as React from "react";
import { Link, useFetcher, useRevalidator } from "@remix-run/react";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "~/components/ui/table";
import { Card, CardContent } from "~/components/ui/card";
import { StatusBadge } from "~/components/bctc-eval/StatusBadge";
import { Button } from "~/components/ui/button";
import type { EvalReportSummary, EvalStatus } from "~/domain/bctc-eval";

export const STAGE_KEYS = [
  "1_RASTERIZE",
  "2_LAYOUT_DETECT",
  "3_OCR",
  "4_TABLE_RECONSTRUCT",
  "5_MARKDOWN_RENDER",
  "6_STRUCTURED_EXTRACT",
] as const;

const STAGE_SHORT = ["S1", "S2", "S3", "S4", "S5", "S6"] as const;

function RecomputeCell({ reportId }: { reportId: string }) {
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
      {fetcher.state !== "idle" ? "…" : "Recompute"}
    </Button>
  );
}

export function EvalTable({ reports }: { reports: EvalReportSummary[] }) {
  if (reports.length === 0) {
    return (
      <Card className="border-slate-700 bg-slate-800">
        <CardContent className="pt-6 text-slate-400">
          No eval records found. Run the backfill script to populate.
        </CardContent>
      </Card>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ticker</TableHead>
          <TableHead>Period</TableHead>
          <TableHead>Overall</TableHead>
          {STAGE_SHORT.map((s) => (
            <TableHead key={s}>{s}</TableHead>
          ))}
          <TableHead>Computed</TableHead>
          <TableHead>Stale</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((r) => (
          <TableRow key={r.report_id}>
            <TableCell>
              <Link
                to={`/dashboard/bctc-eval/${r.report_id}`}
                className="font-mono font-semibold text-blue-400 hover:underline"
              >
                {r.ticker}
              </Link>
            </TableCell>
            <TableCell className="font-mono text-xs">{r.period}</TableCell>
            <TableCell>
              <StatusBadge status={r.overall_status} />
            </TableCell>
            {STAGE_KEYS.map((key) => (
              <TableCell key={key}>
                <StatusBadge
                  status={r.stage_statuses[key] as EvalStatus}
                  showIcon={false}
                />
              </TableCell>
            ))}
            <TableCell className="text-xs text-slate-400">
              {new Date(r.computed_at).toLocaleString("en-GB", {
                timeZone: "UTC",
                dateStyle: "short",
                timeStyle: "short",
              })}
            </TableCell>
            <TableCell>
              {r.is_stale ? (
                <span className="text-xs text-yellow-400">Stale</span>
              ) : (
                <span className="text-xs text-slate-500">—</span>
              )}
            </TableCell>
            <TableCell>
              {r.is_stale && <RecomputeCell reportId={r.report_id} />}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
