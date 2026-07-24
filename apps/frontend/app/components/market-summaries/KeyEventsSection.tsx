/**
 * KeyEvents timeline. /dashboard/market-summaries.
 * FACTORY-FRONTEND-split-market-summaries: extracted verbatim from the route file.
 */
import type { KeyEvent } from "~/routes/dashboard.market-summaries";

export function KeyEventsSection({ events }: { events: KeyEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-slate-500 italic">
        Không có sự kiện nổi bật.
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
      {events.map((ev, i) => (
        <div
          key={i}
          className="flex gap-3 rounded border border-slate-700 bg-slate-900 px-3 py-2"
        >
          {/* Direction indicator */}
          <span
            className={[
              "mt-0.5 shrink-0 text-lg leading-none font-bold",
              ev.direction === "up"
                ? "text-emerald-400"
                : ev.direction === "down"
                ? "text-red-400"
                : "text-slate-500",
            ].join(" ")}
            aria-label={
              ev.direction === "up"
                ? "Tăng"
                : ev.direction === "down"
                ? "Giảm"
                : "Trung tính"
            }
          >
            {ev.direction === "up" ? "↑" : ev.direction === "down" ? "↓" : "·"}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 leading-snug">
              {ev.title}
            </p>
            {ev.date && (
              <p className="mt-0.5 text-[11px] text-slate-500">
                {new Date(ev.date).toLocaleString("vi-VN")}
              </p>
            )}
            {ev.impact && (
              <p className="mt-0.5 text-xs text-slate-400">{ev.impact}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
