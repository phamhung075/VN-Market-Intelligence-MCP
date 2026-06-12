/**
 * /dashboard/fetch — Fetch operations dashboard.
 * Shows: per-source freshness (13 VN sources), VPS proxy health, BCTC pipeline,
 * macro snapshot status. All source names come from the API response.
 * Sprint: FETCH-OPS-PAGE-TRUTH (F-3)
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  fetchFetchStatus,
  fetchMacroExternal,
} from "~/lib/api/client";
import type { MacroData, FetchStatus, FetchSourceStatus, VpsProxyServiceStatus } from "~/domain/market";
import { parseMacroSources, formatSourceAge, sourceStatusColor, sourceStatusLabel } from "~/domain/market";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Fetch Operations — VN Market Intelligence" },
];

interface LoaderData {
  fetchStatus: FetchStatus | null;
  macro: MacroData | null;
  errors: string[];
  fetchedAt: string;
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const errors: string[] = [];

  const [fetchStatusResult, macroResult] =
    await Promise.allSettled([
      fetchFetchStatus(),
      fetchMacroExternal(),
    ]);

  const fetchStatus =
    fetchStatusResult.status === "fulfilled"
      ? fetchStatusResult.value
      : (errors.push(`Fetch status: ${String(fetchStatusResult.reason)}`), null);

  const macro =
    macroResult.status === "fulfilled"
      ? macroResult.value
      : (errors.push(`Macro: ${String(macroResult.reason)}`), null);

  return json<LoaderData>({
    fetchStatus,
    macro,
    errors,
    fetchedAt: new Date().toISOString(),
  });
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function toUserFriendlyError(raw: string): string {
  if (raw.includes("ApiError") || raw.includes("404") || raw.includes("failed")) {
    const source = raw.split(":")[0]?.trim() ?? "Source";
    return `${source}: data temporarily unavailable`;
  }
  return raw;
}

// --------------------------------------------------------------------------
// Sub-components
// --------------------------------------------------------------------------

const STATUS_DOT_CLASS: Record<string, string> = {
  green: "bg-green-400",
  amber: "bg-amber-400",
  red: "bg-red-400",
  grey: "bg-slate-500",
};

function SourceFreshnessTable({ sources }: { sources: FetchSourceStatus[] }) {
  if (sources.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No source data available. The fetch-status endpoint may be unreachable.
      </p>
    );
  }

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b border-slate-700">
          <th className="py-1.5 text-left font-medium text-slate-400">Source</th>
          <th className="py-1.5 text-left font-medium text-slate-400">Age</th>
          <th className="py-1.5 text-center font-medium text-slate-400">Status</th>
          <th className="py-1.5 text-right font-medium text-slate-400">24h articles</th>
        </tr>
      </thead>
      <tbody>
        {sources.map((src) => {
          const color = sourceStatusColor(src);
          const dotClass = STATUS_DOT_CLASS[color] ?? STATUS_DOT_CLASS["grey"];
          const age = formatSourceAge(src.ageMs);
          const label = sourceStatusLabel(src);
          return (
            <tr key={src.id} className="border-b border-slate-800">
              <td className="py-1.5 text-slate-300 font-medium">{src.id}</td>
              <td className="py-1.5 text-slate-400">{age}</td>
              <td className="py-1.5">
                <div className="flex items-center justify-center gap-1.5">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${dotClass}`}
                    aria-hidden="true"
                  />
                  <span
                    className={
                      color === "green"
                        ? "text-green-400"
                        : color === "amber"
                          ? "text-amber-400"
                          : color === "red"
                            ? "text-red-400"
                            : "text-slate-500"
                    }
                  >
                    {label}
                  </span>
                </div>
              </td>
              <td className="py-1.5 text-right text-slate-400">
                {src.count24h}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const VPS_SERVICE_LABELS: Record<string, string> = {
  news: "News",
  prices: "Prices",
  bctc: "BCTC",
  sbv: "SBV",
  "foreign-flow": "Foreign Flow",
};

function VpsProxyPanel({ vpsProxy }: { vpsProxy: FetchStatus["vpsProxy"] | undefined }) {
  if (!vpsProxy) {
    return <p className="text-sm text-slate-500">VPS proxy data unavailable.</p>;
  }

  const entries = Object.entries(vpsProxy) as [string, VpsProxyServiceStatus][];

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b border-slate-700">
          <th className="py-1.5 text-left font-medium text-slate-400">Service</th>
          <th className="py-1.5 text-left font-medium text-slate-400">Last Push</th>
          <th className="py-1.5 text-center font-medium text-slate-400">Status</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([key, svc]) => (
          <tr key={key} className="border-b border-slate-800">
            <td className="py-1.5 text-slate-300 font-medium">
              {VPS_SERVICE_LABELS[key] ?? key}
            </td>
            <td className="py-1.5 text-slate-400">
              {svc.last_push ? (
                <ClientTimestamp iso={svc.last_push} className="text-slate-400" />
              ) : (
                "—"
              )}
            </td>
            <td className="py-1.5 text-center">
              {svc.stale ? (
                <span className="text-red-400">stale</span>
              ) : (
                <span className="text-green-400">live</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BctcPipelinePanel({ bctcPipeline }: { bctcPipeline: FetchStatus["bctcPipeline"] | undefined }) {
  if (!bctcPipeline) {
    return <p className="text-sm text-slate-500">BCTC pipeline data unavailable.</p>;
  }

  return (
    <div className="flex gap-6 text-sm">
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-2xl font-bold text-amber-400">{bctcPipeline.pending}</span>
        <span className="text-xs text-slate-500">pending</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-2xl font-bold text-green-400">{bctcPipeline.done}</span>
        <span className="text-xs text-slate-500">done</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-2xl font-bold text-red-400">{bctcPipeline.failed}</span>
        <span className="text-xs text-slate-500">failed</span>
      </div>
    </div>
  );
}

function MacroPanel({ macro }: { macro: MacroData | null }) {
  if (!macro) {
    return (
      <p className="text-sm text-slate-500">No macro data available.</p>
    );
  }

  const rows = parseMacroSources(macro);
  const summary = macro.summary;

  return (
    <div className="space-y-3 text-sm">
      {/* Timestamp */}
      {macro.fetchedAt && (
        <div className="flex gap-2 text-xs">
          <span className="text-slate-500">Last updated:</span>
          <ClientTimestamp
            iso={String(macro.fetchedAt)}
            className="text-slate-400"
          />
        </div>
      )}

      {/* Summary counts — totalLatencyMs is intentionally absent (removed in F-2) */}
      {summary && (
        <div className="flex gap-4 text-xs">
          <span className="text-green-400">{summary.ok} ok</span>
          <span className={summary.failed > 0 ? "text-red-400" : "text-slate-500"}>
            {summary.failed} failed
          </span>
          {/* totalLatencyMs guard: only render if present (F-2 removed it from server) */}
          {summary.totalLatencyMs !== undefined && (
            <span className="text-slate-500">
              {(summary.totalLatencyMs / 1000).toFixed(1)}s total
            </span>
          )}
        </div>
      )}

      {/* Per-source table */}
      {rows.length > 0 ? (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="py-1 text-left font-medium text-slate-400">Source</th>
              <th className="py-1 text-left font-medium text-slate-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-slate-800">
                <td className="py-1.5 text-slate-300 capitalize">
                  {row.name}
                </td>
                <td className="py-1.5">
                  {row.status === "ok" ? (
                    <span className="text-green-400">ok</span>
                  ) : (
                    <span className="text-red-400" title={row.error ?? "failed"}>
                      {row.error ? `failed: ${row.error}` : "failed"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-slate-500">No source details available.</p>
      )}
    </div>
  );
}

export default function FetchDashboard() {
  const { fetchStatus, macro, errors, fetchedAt } =
    useLoaderData<typeof loader>();

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Fetch Operations"
        actions={
          <span className="text-xs text-slate-500">
            Last updated: <ClientTimestamp iso={fetchedAt} />
          </span>
        }
      />

      {errors.length > 0 && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300 space-y-1"
        >
          {errors.map((e, idx) => (
            <p key={idx}>{toUserFriendlyError(e)}</p>
          ))}
        </div>
      )}

      {/* Top row: Sources freshness + VPS proxy */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Source freshness table */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <h2 className="mb-3 font-semibold text-slate-300">
            Source Freshness
            {fetchStatus && (
              <span aria-hidden="true" className="ml-1 text-xs font-normal text-slate-500">
                ({fetchStatus.sources.length} sources)
              </span>
            )}
          </h2>
          <SourceFreshnessTable sources={fetchStatus?.sources ?? []} />
        </div>

        {/* VPS proxy + BCTC pipeline */}
        <div className="space-y-4">
          {/* VPS Proxy */}
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
            <h2 className="mb-3 font-semibold text-slate-300">
              Upstream Data Feeds
            </h2>
            <VpsProxyPanel vpsProxy={fetchStatus?.vpsProxy} />
          </div>

          {/* BCTC Pipeline */}
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
            <h2 className="mb-3 font-semibold text-slate-300">
              PDF Extraction Queue
            </h2>
            <BctcPipelinePanel bctcPipeline={fetchStatus?.bctcPipeline} />
          </div>
        </div>
      </div>

      {/* Macro snapshot */}
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h2 className="mb-3 font-semibold text-slate-300">
          Macro Snapshot
        </h2>
        <MacroPanel macro={macro} />
      </div>
    </div>
  );
}
