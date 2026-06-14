/**
 * QueName — SSOT factory component for Kinh Dịch hexagram name rendering.
 *
 * OPERATOR MANDATE: This is the ONLY place in the codebase where hexagram name
 * + tooltip logic may live. Every render site MUST use this component.
 * Zero duplicated name/tooltip rendering elsewhere.
 *
 * Props:
 *   hexagram        — numeric id (1–64)
 *   name            — Vietnamese name string from the API
 *   className       — optional CSS class for the trigger span
 *   withDetailLink  — when true, renders a deep-link anchor inside the tooltip
 */
import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { QUE_DESCRIPTIONS } from "~/lib/que-descriptions.generated";
import { QUE_DETAIL } from "~/lib/que-descriptions-detail.generated";

export interface QueNameProps {
  /** Hexagram id (1–64). */
  hexagram: number;
  /** Vietnamese name string returned by the API (e.g. "Kiền"). */
  name: string;
  /** Optional CSS class for the trigger span. */
  className?: string;
  /**
   * When true, renders an anchor inside the TooltipContent pointing to the
   * kinh-dich-reference page section for this hexagram.
   * Default: false/undefined — no link rendered (byte-identical to prior behaviour).
   */
  withDetailLink?: boolean;
}

/**
 * Renders a hexagram name as `#{hexagram} — {name}` with a hover + keyboard-focus
 * tooltip showing the description from QUE_DESCRIPTIONS.
 * Gracefully falls back to a plain span if the hexagram id has no description entry.
 */
export function QueName({ hexagram, name, className, withDetailLink }: QueNameProps): ReactNode {
  const desc = QUE_DESCRIPTIONS[hexagram];
  const detail = QUE_DETAIL[hexagram];

  // Graceful no-op: no description found for this id
  if (!desc) {
    return (
      <span className={className}>
        #{hexagram}{name ? ` — ${name}` : ""}
      </span>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* tabIndex={0} makes the trigger keyboard-focusable.
              Radix Tooltip auto-wires aria-describedby → TooltipContent.
              Escape dismisses the tooltip (Radix default). */}
          <span
            className={`cursor-help underline decoration-dotted decoration-slate-500${className ? ` ${className}` : ""}`}
            tabIndex={0}
          >
            #{hexagram} — {name}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-sm text-xs leading-relaxed"
          aria-label={`Quẻ ${name} — ý nghĩa`}
        >
          <p className="font-semibold text-slate-100 mb-1">{name}</p>
          {detail ? (
            <>
              <p className="text-slate-300">{detail.coreMeaning}</p>
              {detail.stateInterpretation && (
                <p className="mt-1 text-slate-300">
                  <span className="text-slate-400">Trạng thái: </span>
                  {detail.stateInterpretation}
                </p>
              )}
              {detail.favorable && (
                <p className="mt-1 text-slate-300">
                  <span className="text-slate-400">Thuận: </span>
                  {detail.favorable}
                </p>
              )}
              {detail.warning && (
                <p className="mt-1 text-slate-300">
                  <span className="text-slate-400">Cảnh báo: </span>
                  {detail.warning}
                </p>
              )}
              {detail.marketTrendLabel && (
                <p className="mt-1 text-slate-400">{detail.marketTrendLabel}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-slate-300">{desc.hoverSummary ?? desc.coreMeaning}</p>
              {desc.marketTrendLabel && (
                <p className="mt-1 text-slate-400">{desc.marketTrendLabel}</p>
              )}
            </>
          )}
          {withDetailLink && (
            <a
              href={`/dashboard/kinh-dich-reference#que-${hexagram}`}
              className="mt-1 block text-slate-400 underline hover:text-slate-200"
            >
              Xem chi tiết →
            </a>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
