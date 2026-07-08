/**
 * vnstock Python template — Corporate Events.
 *
 * vnstock v4.0.3 broke the Vnstock().stock() path: importing
 * vnstock.common.viz raises ImportError when neither vnstock_chart nor
 * vnstock_ezchart is installed. The fix bypasses the Vnstock wrapper by
 * importing vnstock.explorer.vci.company.Company directly — after
 * pre-mocking the viz module so the import chain does not raise.
 *
 * Column name changes in v4 (vs v3):
 *   v3: event_date, event_name, event_type, description/content
 *   v4: public_date, event_name_en / event_title_en, event_code / category
 *
 * Strategy: try v4 columns first (public_date), fall back to v3 names so
 * the script survives a future vnstock downgrade.
 *
 * Bespoke control flow (not built through wrapVnstockScript — does not call
 * Vnstock().stock() at all). FACTORY-INFRA-split-vnstockBridge: extracted
 * verbatim from vnstockBridge.ts's EVENTS_SCRIPT.
 *
 * Layer: infrastructure/fetchers
 */
export function buildEventsScript(symbol: string): string {
  return `
import json, sys, io, types

# ── viz mock: prevents ImportError when charting libs are absent ──────────
_viz = types.ModuleType('vnstock.common.viz')
_viz.Chart = None  # type: ignore
sys.modules.setdefault('vnstock.common.viz', _viz)

try:
    from vnstock.explorer.vci.company import Company

    # ── stdout capture: vnstock v4 events() prints a box-drawing banner to
    # stdout (not stderr), which runPython detects as a RATE_LIMITED signal.
    # Capture + discard it so only our JSON reaches the caller.
    _real_stdout = sys.stdout
    _buf = io.StringIO()
    sys.stdout = _buf
    try:
        comp = Company(symbol='${symbol}', show_log=False)
        df = comp.events()
    finally:
        sys.stdout = _real_stdout  # always restore, even on error

    if df is None or len(df) == 0:
        print('[]')
        sys.exit(0)
    results = []
    for _, r in df.iterrows():
        # Date: v4 uses public_date; fall back to v3 names
        event_date = str(r.get('public_date',
                     r.get('display_date1',
                     r.get('event_date',
                     r.get('exrights_date',
                     r.get('date', '')))))).strip()
        if event_date and len(event_date) >= 10:
            event_date = event_date[:10]
        else:
            continue
        # Name: prefer English title (descriptive) → English name → vi name → fallback
        event_name = str(r.get('event_title_en',
                     r.get('event_name_en',
                     r.get('event_title_vi',
                     r.get('event_name',
                     r.get('title', ''))))))
        # Type: prefer event_code (short code like ISS/DIV) → category → old names
        event_type = str(r.get('event_code',
                     r.get('category',
                     r.get('event_type',
                     r.get('type', 'Other')))))
        description = str(r.get('event_title_vi',
                      r.get('description',
                      r.get('content', ''))))
        results.append({
            'code': '${symbol}',
            'eventName': event_name,
            'eventDate': event_date,
            'eventType': event_type,
            'description': description
        })
    print(json.dumps(results))
except Exception as e:
    sys.stderr.write(f'vnstock events error: {e}\\n')
    print('[]')
`;
}
