/**
 * /dashboard/news — Tin Tức & Cảm Xúc Thị Trường.
 *
 * Data source: GET /api/news-sentiment (frontend proxy → mcp-server :3000).
 * The proxy route is api.news-sentiment.tsx.
 *
 * Response shape:
 *   { generated_at: ISO, stale_served: boolean, oldest_item_ts: ISO,
 *     count: number,
 *     items: [ { id, title, source, source_ts, sentiment, sentiment_score,
 *                impact_direction, confidence, affected_tickers, affected_sectors,
 *                impact_summary } ] }
 *
 * items[] may be empty — renders a friendly empty state, never an error.
 * Upstream 5xx / network failure → shows error banner, never throws.
 * stale_served=true → shows stale warning banner.
 *
 * Labels: plain Vietnamese — non-technical user.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { safeFetch } from "~/lib/api/fetchUtils";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Tin Tức — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/news-sentiment DTO
// ---------------------------------------------------------------------------

type Sentiment = "positive" | "negative" | "neutral" | null;

interface NewsSentimentItem {
  id: string;
  title: string;
  source: string;
  source_ts: string;
  sentiment: Sentiment;
  sentiment_score: number;
  impact_direction: string;
  confidence: number;
  affected_tickers: string[];
  affected_sectors: string[];
  impact_summary: string;
}

interface NewsSentimentDto {
  generated_at: string;
  stale_served: boolean;
  oldest_item_ts: string;
  count: number;
  items: NewsSentimentItem[];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

interface LoaderData {
  items: NewsSentimentItem[];
  count: number;
  generated_at: string;
  stale_served: boolean;
  error: string | null;
}

function parseNewsSentimentDto(raw: unknown): NewsSentimentDto {
  if (raw === null) {
    return {
      generated_at: new Date().toISOString(),
      stale_served: false,
      oldest_item_ts: "",
      count: 0,
      items: [],
    };
  }
  if (typeof raw !== "object" || !("items" in raw)) {
    throw new Error("Unexpected response shape from /api/news-sentiment");
  }
  const dto = raw as NewsSentimentDto;
  const items = Array.isArray(dto.items) ? dto.items : [];
  return {
    generated_at: typeof dto.generated_at === "string" ? dto.generated_at : new Date().toISOString(),
    stale_served: dto.stale_served === true,
    oldest_item_ts: typeof dto.oldest_item_ts === "string" ? dto.oldest_item_ts : "",
    count: typeof dto.count === "number" ? dto.count : items.length,
    items,
  };
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const generated_at = new Date().toISOString();

  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const { data, error } = await safeFetch<NewsSentimentDto>(
    `${origin}/api/news-sentiment`,
    parseNewsSentimentDto,
    { label: "dashboard.news" },
  );

  const dto = data ?? parseNewsSentimentDto(null);
  return json<LoaderData>({ items: dto.items, count: dto.count, generated_at, stale_served: dto.stale_served, error });
}

// ---------------------------------------------------------------------------
// Helper — extract hostname from a URL string (graceful fallback)
// ---------------------------------------------------------------------------

function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// SentimentPill — green / red / grey pill per sentiment value
// ---------------------------------------------------------------------------

function SentimentPill({ sentiment }: { sentiment: Sentiment }) {
  if (!sentiment || sentiment === "neutral") {
    return (
      <span className="inline-flex items-center rounded border border-slate-600 bg-slate-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Trung lập
      </span>
    );
  }
  if (sentiment === "positive") {
    return (
      <span className="inline-flex items-center rounded border border-green-700 bg-green-950 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-green-400">
        Tích cực
      </span>
    );
  }
  // negative
  return (
    <span className="inline-flex items-center rounded border border-red-700 bg-red-950 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-400">
      Tiêu cực
    </span>
  );
}

// ---------------------------------------------------------------------------
// Chip — small tag for ticker or sector
// ---------------------------------------------------------------------------

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded bg-slate-700 px-1.5 py-0.5 text-[11px] font-medium text-slate-300">
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// NewsCard — one news-sentiment item
// ---------------------------------------------------------------------------

function NewsCard({ item }: { item: NewsSentimentItem }) {
  const tickers = Array.isArray(item.affected_tickers)
    ? item.affected_tickers
    : [];
  const sectors = Array.isArray(item.affected_sectors)
    ? item.affected_sectors
    : [];

  return (
    <article className="rounded-lg border border-slate-700 bg-slate-800 p-4 space-y-3">
      {/* Title row: linked to source */}
      <div className="flex flex-wrap items-start gap-2">
        <a
          href={item.source}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-sm font-semibold text-slate-100 hover:text-blue-400 leading-snug min-w-0 break-words"
        >
          {item.title}
        </a>
        <SentimentPill sentiment={item.sentiment} />
      </div>

      {/* Source + timestamp row */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{sourceDomain(item.source)}</span>
        <span aria-hidden="true">·</span>
        <ClientTimestamp iso={item.source_ts} />
      </div>

      {/* Impact summary */}
      {item.impact_summary ? (
        <p className="text-xs leading-relaxed text-slate-400">
          {item.impact_summary}
        </p>
      ) : null}

      {/* Chips: affected tickers + sectors (only when present) */}
      {(tickers.length > 0 || sectors.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {tickers.map((t) => (
            <Chip key={`t-${t}`} label={t} />
          ))}
          {sectors.map((s) => (
            <Chip key={`s-${s}`} label={s} />
          ))}
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewsSentimentPage() {
  const { items, count, generated_at, stale_served, error } =
    useLoaderData<typeof loader>();

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Tin Tức & Cảm Xúc Thị Trường"
        subtitle="Phân tích cảm xúc thị trường từ các nguồn tin tài chính"
        actions={
          <span className="text-xs text-slate-500">
            <ClientTimestamp iso={generated_at} />
          </span>
        }
      />

      {/* Stale banner */}
      {stale_served && (
        <div
          role="status"
          className="rounded border border-yellow-700 bg-yellow-950 px-4 py-3 text-sm text-yellow-300"
        >
          Dữ liệu có thể chưa được cập nhật mới nhất — đang hiển thị bản tin
          cũ.
        </div>
      )}

      {/* Error banner — shown only on upstream error, not empty items */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải tin tức — {error}
        </div>
      )}

      {/* Item count subtitle (only when items present) */}
      {!error && count > 0 && (
        <p className="text-xs text-slate-500">{count} tin tức</p>
      )}

      {/* Main content: news cards or empty state */}
      {!error && items.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">Chưa có tin tức</p>
          <p className="mt-1 text-xs text-slate-600">
            Chưa có bản phân tích tin tức nào. Vui lòng quay lại sau.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
