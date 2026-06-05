/**
 * /dashboard/db — Database data report.
 * Shows: stock price history (VNINDEX), recent news headlines with timestamps.
 * Data sources: GET /stock/price/history?code=VNINDEX, GET /news/reuters/headlines.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { fetchPriceHistory, fetchReutersHeadlines } from "~/lib/api/client";
import type { PricePoint } from "~/domain/market";
import type { Headline } from "~/domain/news";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Database Report — VN Market Intelligence" },
];

const DEFAULT_TICKER = "VNINDEX";

interface LoaderData {
  prices: PricePoint[];
  headlines: Headline[];
  ticker: string;
  errors: string[];
  fetchedAt: string;
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const errors: string[] = [];

  const [pricesResult, headlinesResult] = await Promise.allSettled([
    fetchPriceHistory(DEFAULT_TICKER),
    fetchReutersHeadlines(),
  ]);

  const prices =
    pricesResult.status === "fulfilled"
      ? pricesResult.value
      : (errors.push(`Price history: ${String(pricesResult.reason)}`), []);

  const headlines =
    headlinesResult.status === "fulfilled"
      ? headlinesResult.value
      : (errors.push(`Headlines: ${String(headlinesResult.reason)}`), []);

  return json<LoaderData>({
    prices,
    headlines,
    ticker: DEFAULT_TICKER,
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
// Components
// --------------------------------------------------------------------------

function PriceDirectionBadge({ close, open }: { close: number; open?: number }) {
  if (open == null) return null;
  const delta = ((close - open) / open) * 100;
  const isUp = delta > 0;
  const isFlat = Math.abs(delta) < 0.001;
  return (
    <span
      className={`text-xs font-medium ${
        isFlat
          ? "text-slate-400"
          : isUp
            ? "text-green-400"
            : "text-red-400"
      }`}
    >
      {isFlat ? "—" : `${isUp ? "+" : ""}${delta.toFixed(2)}%`}
    </span>
  );
}

function PriceTable({
  prices,
  ticker,
}: {
  prices: PricePoint[];
  ticker: string;
}) {
  if (prices.length === 0) {
    return (
      <p className="py-3 text-sm text-slate-500">
        No price data available for {ticker}.
      </p>
    );
  }

  // Show most recent 14 points.
  const recent = prices.slice(-14).reverse();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-800">
            <th className="px-3 py-2 text-left font-semibold text-slate-300">
              Date
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-300">
              Close
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-300">
              Open
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-300">
              High
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-300">
              Low
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-300">
              Change
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-300">
              Volume
            </th>
          </tr>
        </thead>
        <tbody>
          {recent.map((p, idx) => (
            <tr
              key={p.date + idx}
              className={`border-b border-slate-700 last:border-0 ${
                idx % 2 === 0 ? "bg-slate-900" : "bg-slate-800"
              }`}
            >
              <td className="px-3 py-2 font-mono text-slate-300">{p.date}</td>
              <td suppressHydrationWarning className="px-3 py-2 text-right font-semibold text-slate-100">
                {p.close.toLocaleString("vi-VN")}
              </td>
              <td suppressHydrationWarning className="px-3 py-2 text-right text-slate-400">
                {p.open != null ? p.open.toLocaleString("vi-VN") : "—"}
              </td>
              <td suppressHydrationWarning className="px-3 py-2 text-right text-green-400">
                {p.high != null ? p.high.toLocaleString("vi-VN") : "—"}
              </td>
              <td suppressHydrationWarning className="px-3 py-2 text-right text-red-400">
                {p.low != null ? p.low.toLocaleString("vi-VN") : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <PriceDirectionBadge close={p.close} open={p.open} />
              </td>
              <td suppressHydrationWarning className="px-3 py-2 text-right text-slate-400">
                {p.volume != null ? p.volume.toLocaleString("vi-VN") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeadlineTable({ headlines }: { headlines: Headline[] }) {
  if (headlines.length === 0) {
    return (
      <p className="py-3 text-sm text-slate-500">No headline data available.</p>
    );
  }

  return (
    <ul className="divide-y divide-slate-700">
      {headlines.slice(0, 15).map((h, idx) => (
        <li key={idx} className="flex items-start gap-3 py-3">
          <span className="mt-0.5 min-w-[1.5rem] text-xs text-slate-600">
            {idx + 1}.
          </span>
          <div className="flex-1">
            <p className="text-sm text-slate-200">
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
            <div className="mt-0.5 flex gap-3 text-xs text-slate-500">
              {h.source && <span>{h.source}</span>}
              {h.publishedAt && (
                <ClientTimestamp iso={h.publishedAt} />
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function DbDashboard() {
  const { prices, headlines, ticker, errors, fetchedAt } =
    useLoaderData<typeof loader>();

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Database Report"
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

      {/* Price history */}
      <div className="rounded-lg border border-slate-700 bg-slate-900">
        <div className="border-b border-slate-700 px-4 py-3">
          <h2 className="font-semibold text-slate-300">
            Price History —{" "}
            <span className="font-mono text-blue-400">{ticker}</span>
            <span className="ml-2 text-xs font-normal text-slate-500">
              (recent 14 sessions)
            </span>
          </h2>
        </div>
        <div className="p-4">
          <PriceTable prices={prices} ticker={ticker} />
        </div>
      </div>

      {/* News headlines */}
      <div className="rounded-lg border border-slate-700 bg-slate-900">
        <div className="border-b border-slate-700 px-4 py-3">
          <h2 className="font-semibold text-slate-300">
            Recent Headlines — Reuters
            <span className="ml-2 text-xs font-normal text-slate-500">
              ({headlines.length} items)
            </span>
          </h2>
        </div>
        <div className="p-4">
          <HeadlineTable headlines={headlines} />
        </div>
      </div>
    </div>
  );
}
