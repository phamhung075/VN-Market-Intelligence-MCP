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
      <p className="py-3 text-sm text-slate-500">No data available for {source}.</p>
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
            <p className="mt-0.5 text-xs text-slate-500">
              {new Date(h.publishedAt).toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
              })}
            </p>
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
  return (
    <div className="space-y-2 text-sm">
      {macro.source && (
        <div className="flex gap-2">
          <span className="text-slate-500">Source:</span>
          <span className="text-slate-200">{String(macro.source)}</span>
        </div>
      )}
      {macro.fetchedAt && (
        <div className="flex gap-2">
          <span className="text-slate-500">Fetched:</span>
          <span className="text-slate-200">
            {new Date(String(macro.fetchedAt)).toLocaleString("vi-VN", {
              timeZone: "Asia/Ho_Chi_Minh",
            })}
          </span>
        </div>
      )}
      {macro.status && (
        <div className="flex gap-2">
          <span className="text-slate-500">Status:</span>
          <span
            className={
              macro.status === "ok" ? "text-green-400" : "text-yellow-400"
            }
          >
            {String(macro.status)}
          </span>
        </div>
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
          Loaded{" "}
          {new Date(fetchedAt).toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
          })}
        </span>
      </div>

      {errors.length > 0 && (
        <div className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300 space-y-1">
          {errors.map((e, idx) => (
            <p key={idx}>{e}</p>
          ))}
        </div>
      )}

      {/* Three columns on wide screens */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Reuters */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <h2 className="mb-3 font-semibold text-slate-300">
            Reuters Headlines
            <span className="ml-2 text-xs font-normal text-slate-500">
              ({reuters.length})
            </span>
          </h2>
          <HeadlineList headlines={reuters} source="Reuters" />
        </div>

        {/* Bloomberg */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <h2 className="mb-3 font-semibold text-slate-300">
            Bloomberg Headlines
            <span className="ml-2 text-xs font-normal text-slate-500">
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
