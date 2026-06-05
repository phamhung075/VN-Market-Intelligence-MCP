/**
 * PageHeader — shared page-level title block (SSOT).
 *
 * Renders a consistent `<h1>` title row across all dashboard pages.
 * All dashboard routes MUST use this component instead of hand-rolling
 * their own `<h1>` / title header markup.
 *
 * Props:
 *   title    — (required) The page title. Rendered as <h1>.
 *   subtitle — (optional) Muted secondary line displayed below the title.
 *   actions  — (optional) React.ReactNode rendered right-aligned (timestamps,
 *              status badges, buttons, etc.).
 */

interface PageHeaderProps {
  /** Required: the main page title shown as <h1>. */
  title: string;
  /** Optional: secondary descriptor shown in muted text below the title. */
  subtitle?: string;
  /** Optional: right-aligned slot for actions, badges, or status nodes. */
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 pb-2">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-2xl font-bold text-slate-100">{title}</h1>
        {subtitle && (
          <p className="text-sm text-slate-500">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
