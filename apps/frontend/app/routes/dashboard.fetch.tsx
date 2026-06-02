/**
 * /dashboard/fetch — Fetch operations dashboard.
 * Shows: last fetched Reuters headlines, Bloomberg headlines, macro snapshot status.
 * Data sources: GET /news/reuters/headlines, /news/bloomberg/headlines, /macro/external.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  fetchReutersHeadlines,
  fetchBloombergHeadlines,
  fetchMacroExternal,
} from "~/lib/api/client";
import type { Headline } from "~/domain/news";
import type { MacroData } from "~/domain/market";
import { parseMacroSources } from "~/domain/market";
import { ClientTimestamp } from "~/components/ClientTimestamp";

export const meta: MetaFunction = () => [
  { title: "Fetch Operations — VN Market Intelligence" },
];

interface LoaderData {
  reuters: Headline[];
  bloomberg: Headline[];
  macro: MacroData | null;
  errors: string[];
  fetchedAt: string;
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const errors: string[] = [];

  const [reutersResult, bloombergResult, macroResult] =
    await Promise.allSettled([
      fetchReutersHeadlines(),
      fetchBloombergHeadlines(),
      fetchMacroExternal(),
    ]);

  const reuters =
    reutersResult.status === "fulfilled"
      ? reutersResult.value
      : (errors.push(`Reuters: ${String(reutersResult.reason)}`), []);

  const bloomberg =
    bloombergResult.status === "fulfilled"
      ? bloombergResult.value
      : (errors.push(`Bloomberg: ${String(bloombergResult.reason)}`), []);

  const macro =
    macroResult.status === "fulfilled"
      ? macroResult.value
      : (errors.push(`Macro: ${String(macroResult.reason)}`), null);

  return json<LoaderData>({
    reuters,
    bloomberg,
    macro,
    errors,
    fetchedAt: new Date().toISOString(),
  });
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/**
 * Strips raw API paths from error messages to avoid leaking internal routes.
 * "Reuters: ApiError: GET /news/reuters/headlines failed: 404 Not Found"
 * → "Reuters: data temporarily unavailable"
 */
function toUserFriendlyError(raw: string): string {
  if (raw.includes("ApiError") || raw.includes("404") || raw.includes("failed")) {
    const source = raw.split(":")[0]?.trim() ?? "Source";
    return `${source}: data temporarily unavailable`;
  }
  return raw;
}

// --------------------------------------------------------------------------
// Components
// --------------------------------------------------------------------------

function HeadlineList({
  headlines,
  source,
}: {
  headlines: Headline[];
  source: string;
}) {
  if (headlines.length === 0) {
    return (
      <div className="py-3 space-y-1">
        <p className="text-sm text-slate-500">No headlines available for {source}.</p>
        <p className="text-xs text-slate-600">
          Source not deployed on this host — news-fetch microservice is not running
          (expected state, tracked FU-FE-NEWS-SOURCE).
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-700">
      {headlines.slice(0, 10).map((h, idx) => (
        <li key={idx} className="py-3">
          <p className="text-sm font-medium text-slate-200">
            {h.url ? (
              <a
                href={h.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-400"
              >
                {h.title}
              </a>
            ) : (
              h.title
            )}
          </p>
          {h.publishedAt && (
            <ClientTimestamp
              iso={h.publishedAt}
              className="mt-0.5 block text-xs text-slate-500"
            />
          )}
        </li>
      ))}
    </ul>
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

      {/* Summary counts */}
      {summary && (
        <div className="flex gap-4 text-xs">
          <span className="text-green-400">{summary.ok} ok</span>
          <span className={summary.failed > 0 ? "text-red-400" : "text-slate-500"}>
            {summary.failed} failed
          </span>
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
              <th className="py-1 text-right font-medium text-slate-400">Latency</th>
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
                <td className="py-1.5 text-right text-slate-400">
                  {row.latencyMs !== undefined
                    ? `${row.latencyMs}ms`
                    : "—"}
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
  const { reuters, bloomberg, macro, errors, fetchedAt } =
    useLoaderData<typeof loader>();

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Fetch Operations</h1>
        <span className="text-xs text-slate-500">
          Last updated:{" "}
          <ClientTimestamp iso={fetchedAt} />
        </span>
      </div>

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

      {/* Three columns on wide screens */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Reuters */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <h2 className="mb-3 font-semibold text-slate-300">
            Reuters Headlines{" "}
            <span aria-hidden="true" className="ml-1 text-xs font-normal text-slate-500">
              ({reuters.length})
            </span>
          </h2>
          <HeadlineList headlines={reuters} source="Reuters" />
        </div>

        {/* Bloomberg */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <h2 className="mb-3 font-semibold text-slate-300">
            Bloomberg Headlines{" "}
            <span aria-hidden="true" className="ml-1 text-xs font-normal text-slate-500">
              ({bloomberg.length})
            </span>
          </h2>
          <HeadlineList headlines={bloomberg} source="Bloomberg" />
        </div>

        {/* Macro */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <h2 className="mb-3 font-semibold text-slate-300">
            Macro Snapshot
          </h2>
          <MacroPanel macro={macro} />
        </div>
      </div>
    </div>
  );
}
