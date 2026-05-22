/**
 * TA Dashboard — app.ts (P1-E1)
 *
 * Build: cd apps/technical-analysis && ./dashboard/build.sh
 * Output: dashboard/dist/app.js  (loaded by index.html)
 *
 * Loads scenario JSON files from docs/scenarios/technical-analysis/ via
 * <script type="application/json"> tags embedded in the HTML (works in file://
 * without a server — no fetch() required, no backend, no credentials).
 *
 * Status values:
 *   "static"  — scenarios loaded from JSON, no sandbox runner attached yet (P1-E2)
 *   "green"   — sandbox confirmed all assertions passed
 *   "red"     — sandbox detected assertion failure
 *
 * P1-E1 scope: static display of all 30 scenarios across 3 panels.
 * P1-E2 scope: "Edit & Rerun" button wires the sandbox runner.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScenarioStatus = "static" | "green" | "red";
export type ScenarioCategory = "golden" | "edge" | "failure";
export type MAType = "bullish" | "bearish";

export interface CrossEvent {
  index: number;
  direction: MAType;
}

/** A single scenario entry as embedded in the HTML window globals. */
export interface ScenarioData {
  /** Set for primitive-tier scenarios. */
  primitive?: string;
  /** Set for module-tier scenarios. */
  module?: string;
  category?: ScenarioCategory;
  description?: string;
  /** Injected by index.html (filename without path, e.g. "rsi-golden.json"). */
  filename?: string;
  status?: ScenarioStatus;
  // SAFETY: input / expectedOutput are free-form JSON blobs — typed as unknown
  // because each scenario has a different shape. Callers narrow before use.
  input?: unknown;
  expectedOutput?: unknown;
  /** Module-level: which primitives are exercised. */
  primitives?: string[];
  /** Set by rerun-handler after a sandbox run. */
  _sandboxActual?: unknown;
  _sandboxDiffs?: string[];
}

export interface PrimitiveConfig {
  key: string;
  label: string;
  color: string;
  bg: string;
  desc: string;
}

// ---------------------------------------------------------------------------
// Window globals declared by index.html <script> tags
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __PRIMITIVES_DATA__: ScenarioData[];
    __MODULE_DATA__: ScenarioData[];
    /** Exported by rerun-handler — called from the rerun-btn click handler. */
    showRerunPane?: (scenario: ScenarioData) => void;
    /** Exported for rerun-handler to call after a result is applied. */
    renderPrimitivesPanel: () => void;
    renderModulePanel: () => void;
    /** Current scenario open in the modal (accessed by rerun-handler). */
    currentScenario: ScenarioData | null;
    openModal: (scenario: ScenarioData) => void;
  }
}

// ---------------------------------------------------------------------------
// 1. Parse embedded scenario data (injected by index.html <script> tags)
// ---------------------------------------------------------------------------

const PRIMITIVES: ScenarioData[] = window.__PRIMITIVES_DATA__ || [];
const MODULE_SCENARIOS: ScenarioData[] = window.__MODULE_DATA__ || [];

// ---------------------------------------------------------------------------
// 2. Primitive grouping config
// ---------------------------------------------------------------------------

const PRIMITIVE_CONFIG: PrimitiveConfig[] = [
  {
    key: "CalculateRSI",
    label: "RSI — Relative Strength Index",
    color: "#075985",
    bg: "#e0f2fe",
    desc: "Wilder's 14-period RSI measures momentum. Range: [0, 100]. Overbought > 70, oversold < 30.",
  },
  {
    key: "CalculateMACD",
    label: "MACD — Moving Avg Convergence/Divergence",
    color: "#7c3aed",
    bg: "#ede9fe",
    desc: "MACD line = fast EMA(12) − slow EMA(26). Signal = 9-period EMA of MACD. Histogram = MACD − Signal.",
  },
  {
    key: "CalculateBollingerBands",
    label: "Bollinger Bands",
    color: "#065f46",
    bg: "#d1fae5",
    desc: "Middle = SMA(20). Upper/Lower = SMA ± 2 × population std dev. Squeeze signals low volatility.",
  },
  {
    key: "CalculateMovingAverage",
    label: "Moving Averages (SMA + EMA)",
    color: "#92400e",
    bg: "#fef3c7",
    desc: "SMA(n) = mean of last n closes. EMA uses alpha = 2/(n+1). CalculateMovingAverage dispatches by type.",
  },
  {
    key: "DetectCross",
    label: "Detect Cross — Signal Crossover",
    color: "#9d174d",
    bg: "#fce7f3",
    desc: 'Detects sign changes of (fast[i] − slow[i]). Returns [{index, direction: "bullish"|"bearish"}].',
  },
];

// ---------------------------------------------------------------------------
// 3. Helpers
// ---------------------------------------------------------------------------

/** Narrow input to an object shape for summary extraction. */
function asInputObj(s: ScenarioData): Record<string, unknown> {
  if (s.input && typeof s.input === "object" && !Array.isArray(s.input)) {
    return s.input as Record<string, unknown>;
  }
  return {};
}

function asOutputObj(s: ScenarioData): Record<string, unknown> {
  if (
    s.expectedOutput &&
    typeof s.expectedOutput === "object" &&
    !Array.isArray(s.expectedOutput)
  ) {
    return s.expectedOutput as Record<string, unknown>;
  }
  return {};
}

/** Return a short, human-readable input summary for a scenario */
function inputSummary(s: ScenarioData): string {
  const input = asInputObj(s);
  if (s.primitive === "CalculateRSI") {
    const closes = input["closes"];
    const len = Array.isArray(closes)
      ? closes.length
      : (input["closes_length"] ?? "?");
    return `${len} closes, period ${input["period"] ?? 14}`;
  }
  if (s.primitive === "CalculateMACD") {
    const closes = input["closes"];
    const len =
      input["closes_count"] ??
      (Array.isArray(closes) ? closes.length : "?");
    return `${len} closes, ${input["fast"] ?? 12}/${input["slow"] ?? 26}/${
      input["signalPeriod"] ?? 9
    }`;
  }
  if (s.primitive === "CalculateBollingerBands") {
    const closes = input["closes"];
    const len = Array.isArray(closes) ? closes.length : "?";
    return `${len} closes, period ${input["period"]}, mult ${input["multiplier"]}`;
  }
  if (s.primitive === "CalculateMovingAverage") {
    const closes = input["closes"];
    const len = Array.isArray(closes) ? closes.length : "?";
    return `${len} closes, period ${input["period"]}`;
  }
  if (s.primitive === "DetectCross") {
    const fastLine = input["fastLine"];
    const len = Array.isArray(fastLine) ? fastLine.length : "?";
    return `${len}-element series`;
  }
  if (s.module) {
    const len = input["closes_length"] ?? "?";
    return `${len} candles`;
  }
  return JSON.stringify(input).slice(0, 60) + "…";
}

/** Return a short, human-readable expected-output summary */
function outputSummary(s: ScenarioData): string {
  const out = asOutputObj(s);
  if (s.primitive === "CalculateRSI") {
    const rsi = out["rsi"];
    if (rsi) {
      const len = out["length"] ?? (Array.isArray(rsi) ? rsi.length : "?");
      return `RSI[${len}], range [${out["rangeMin"] ?? 0}, ${
        out["rangeMax"] ?? 100
      }]`;
    }
    if (out["error"] !== undefined) return "expects error";
    return `length ${out["length"] ?? "?"}`;
  }
  if (s.primitive === "CalculateMACD") {
    if (out["outputLength"] !== undefined)
      return `${out["outputLength"]} triples`;
    if (out["error"] !== undefined) return "expects error / null";
    return JSON.stringify(out).slice(0, 50);
  }
  if (s.primitive === "CalculateBollingerBands") {
    const upper = out["upper"];
    if (upper) {
      const len =
        out["length"] ?? (Array.isArray(upper) ? upper.length : "?");
      return `${len} windows`;
    }
    if (out["error"] !== undefined) return "expects error / empty";
    return JSON.stringify(out).slice(0, 50);
  }
  if (s.primitive === "CalculateMovingAverage") {
    if (out["sma"]) return `SMA+EMA, ${out["length"]} values`;
    if (out["error"] !== undefined) return "expects error";
    return JSON.stringify(out).slice(0, 50);
  }
  if (s.primitive === "DetectCross") {
    if (out["events"]) return `${out["eventCount"]} cross event(s)`;
    if (out["eventCount"] === 0) return "0 cross events (no cross)";
    if (out["error"] !== undefined) return "expects error";
    return JSON.stringify(out).slice(0, 50);
  }
  if (s.module) {
    const keys = Object.keys(out);
    return keys.slice(0, 4).join(", ") + (keys.length > 4 ? "…" : "");
  }
  return JSON.stringify(out).slice(0, 60);
}

/** Syntax-highlight JSON for display in the modal */
function highlightJSON(obj: unknown): string {
  let json = JSON.stringify(obj, null, 2);
  json = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "json-num";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "json-key" : "json-str";
      } else if (/true|false/.test(match)) {
        cls = "json-bool";
      } else if (/null/.test(match)) {
        cls = "json-null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

/** Returns css category class for a scenario category string */
function catClass(cat: ScenarioCategory | undefined): string {
  if (cat === "golden") return "cat-golden";
  if (cat === "edge") return "cat-edge";
  return "cat-failure";
}

/** Returns css category label */
function catLabel(cat: ScenarioCategory | undefined): string {
  if (cat === "golden") return "golden";
  if (cat === "edge") return "edge";
  return "failure";
}

// ---------------------------------------------------------------------------
// 4. Modal logic
// ---------------------------------------------------------------------------

let currentScenario: ScenarioData | null = null;

function openModal(scenario: ScenarioData): void {
  currentScenario = scenario;
  const overlay = document.getElementById("modal-overlay")!;
  const title = document.getElementById("modal-title")!;
  const catBadge = document.getElementById("modal-cat")!;
  const desc = document.getElementById("modal-desc")!;
  const inputJson = document.getElementById("modal-input-json")!;
  const outputJson = document.getElementById("modal-output-json")!;
  const statusBar = document.getElementById("modal-status-bar")!;
  const statusText = document.getElementById("modal-status-text")!;
  const statusNote = document.getElementById("modal-status-note")!;

  const label = scenario.primitive
    ? (PRIMITIVE_CONFIG.find((p) => p.key === scenario.primitive) ?? {
        label: scenario.primitive,
      }).label
    : `Module: ${scenario.module}`;

  title.textContent = scenario.filename
    ? `${label} — ${scenario.filename}`
    : (label ?? "");

  catBadge.className = `modal-category category-chip ${catClass(
    scenario.category
  )}`;
  catBadge.textContent = catLabel(scenario.category);

  desc.textContent = scenario.description ?? "(no description)";

  inputJson.innerHTML = highlightJSON(scenario.input ?? {});
  outputJson.innerHTML = highlightJSON(scenario.expectedOutput ?? {});

  // Status bar
  const st: ScenarioStatus = scenario.status ?? "static";
  statusBar.className = "modal-status-bar";
  if (st === "green") {
    statusText.className = "status-indicator green";
    statusText.innerHTML =
      '<span class="status-dot-lg dot-green"></span> PASSED';
    statusNote.textContent =
      "Sandbox runner confirmed all assertions passed.";
  } else if (st === "red") {
    statusText.className = "status-indicator red";
    statusText.innerHTML =
      '<span class="status-dot-lg dot-red"></span> FAILED';
    statusNote.textContent =
      "Sandbox runner detected assertion failure. Edit JSON and rerun to fix.";
  } else {
    statusText.className = "status-indicator pending";
    statusText.innerHTML =
      '<span class="status-dot-lg dot-pending"></span> NOT YET RUN';
    statusNote.textContent =
      "P1-E2 sandbox runner not yet wired. Scenarios loaded from JSON only.";
  }

  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal(): void {
  document.getElementById("modal-overlay")!.classList.remove("open");
  document.body.style.overflow = "";
  currentScenario = null;
}

// ---------------------------------------------------------------------------
// 5. Render Primitives panel
// ---------------------------------------------------------------------------

function renderPrimitivesPanel(): void {
  const panelBody = document.getElementById("primitives-panel-body")!;
  const totalChip = document.getElementById("prim-total-chip")!;
  const greenChip = document.getElementById("prim-green-chip")!;
  const redChip = document.getElementById("prim-red-chip")!;

  totalChip.textContent = `${PRIMITIVES.length} scenarios`;
  const greenCount = PRIMITIVES.filter((s) => s.status === "green").length;
  const redCount = PRIMITIVES.filter((s) => s.status === "red").length;
  greenChip.textContent = `${greenCount} passed`;
  redChip.textContent = `${redCount} failed`;

  panelBody.innerHTML = "";

  PRIMITIVE_CONFIG.forEach((cfg) => {
    const scenarios = PRIMITIVES.filter((s) => s.primitive === cfg.key);
    if (scenarios.length === 0) return;

    const allGreen = scenarios.every((s) => s.status === "green");
    const anyRed = scenarios.some((s) => s.status === "red");
    const groupStatus = allGreen ? "PASSED" : anyRed ? "FAILED" : "NOT RUN";
    const groupStatusClass = allGreen
      ? "status-green-label"
      : anyRed
      ? "status-red-label"
      : "status-pending-label";

    const group = document.createElement("div");
    group.className = "primitive-group";

    const header = document.createElement("div");
    header.className = "primitive-group-header";
    header.style.borderLeft = `4px solid ${cfg.color}`;
    header.innerHTML = `
      <span>${cfg.label}</span>
      <span class="group-status ${groupStatusClass}">${groupStatus}</span>
    `;

    const scenarioList = document.createElement("div");
    scenarioList.className = "primitive-scenarios";

    scenarios.forEach((s) => {
      const card = document.createElement("button");
      card.className = "scenario-card";
      card.setAttribute("type", "button");
      card.setAttribute(
        "aria-label",
        `View scenario: ${
          s.description ? s.description.slice(0, 60) : s.filename ?? ""
        }`
      );

      const dotClass =
        s.status === "green"
          ? "dot-green"
          : s.status === "red"
          ? "dot-red"
          : "dot-pending";
      const inputSum = inputSummary(s);
      const outputSum = outputSummary(s);

      card.innerHTML = `
        <span class="scenario-status-dot ${dotClass}" aria-hidden="true"></span>
        <span class="scenario-meta">
          <span class="scenario-name">${s.filename ?? s.category}</span>
          <span class="scenario-desc">
            ${s.description ? s.description.slice(0, 120) : ""}
          </span>
          <span style="font-size:0.72rem; color:#6b7280; margin-top:3px; display:block;">
            In: ${inputSum} &nbsp;|&nbsp; Expected: ${outputSum}
          </span>
        </span>
        <span class="category-chip ${catClass(s.category)}" aria-hidden="true">${catLabel(
        s.category
      )}</span>
      `;

      card.addEventListener("click", () => openModal(s));
      scenarioList.appendChild(card);
    });

    group.appendChild(header);
    group.appendChild(scenarioList);
    panelBody.appendChild(group);
  });
}

// ---------------------------------------------------------------------------
// 6. Render Module panel
// ---------------------------------------------------------------------------

function renderModulePanel(): void {
  const panelBody = document.getElementById("module-panel-body")!;
  const totalChip = document.getElementById("mod-total-chip")!;
  const greenChip = document.getElementById("mod-green-chip")!;
  const redChip = document.getElementById("mod-red-chip")!;

  totalChip.textContent = `${MODULE_SCENARIOS.length} scenarios`;
  const greenCount = MODULE_SCENARIOS.filter(
    (s) => s.status === "green"
  ).length;
  const redCount = MODULE_SCENARIOS.filter((s) => s.status === "red").length;
  greenChip.textContent = `${greenCount} passed`;
  redChip.textContent = `${redCount} failed`;

  panelBody.innerHTML = "";

  MODULE_SCENARIOS.forEach((s) => {
    const card = document.createElement("div");
    card.className = "module-card";

    const headerBtn = document.createElement("button");
    headerBtn.className = "module-card-header";
    headerBtn.setAttribute("type", "button");
    headerBtn.setAttribute(
      "aria-label",
      `View module scenario: ${
        s.description ? s.description.slice(0, 60) : s.filename ?? ""
      }`
    );

    const dotClass =
      s.status === "green"
        ? "dot-green"
        : s.status === "red"
        ? "dot-red"
        : "dot-pending";

    headerBtn.innerHTML = `
      <span>
        <span class="scenario-status-dot ${dotClass}" style="display:inline-block;margin-right:6px;vertical-align:middle;" aria-hidden="true"></span>
        <span class="module-card-title">${s.filename ?? s.category}</span>
        <span class="module-card-meta" style="display:block;margin-top:2px;">
          ${inputSummary(s)} &nbsp;|&nbsp; Expected: ${outputSummary(s)}
        </span>
      </span>
      <span class="category-chip ${catClass(s.category)}" aria-hidden="true">${catLabel(
      s.category
    )}</span>
    `;

    headerBtn.addEventListener("click", () => openModal(s));

    const primTags = document.createElement("div");
    primTags.className = "module-primitives-tag";
    (s.primitives ?? []).forEach((p) => {
      const tag = document.createElement("span");
      tag.className = "prim-tag";
      tag.textContent = p;
      primTags.appendChild(tag);
    });

    const body = document.createElement("div");
    body.className = "module-card-body";
    body.innerHTML = `<p class="module-card-desc">${
      s.description ? s.description.slice(0, 200) : "(no description)"
    }</p>`;

    card.appendChild(headerBtn);
    card.appendChild(primTags);
    card.appendChild(body);
    panelBody.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// 7. Render Microservice panel (static placeholder)
// ---------------------------------------------------------------------------

function renderServicePanel(): void {
  const panelBody = document.getElementById("service-panel-body")!;
  panelBody.innerHTML = `
    <div class="service-placeholder">
      <span class="service-coming-soon">Live data not wired yet &mdash; P1-E2</span>
      <h3>apps/technical-analysis/ — Go Microservice</h3>
      <p style="font-size:0.78rem;color:#64748b;margin-top:4px;">
        The microservice shape is documented here as a trust contract.
        Live HTTP calls will be wired in P1-E2 (sandbox runner).
        All status cards below reflect the planned architecture only.
      </p>

      <div class="service-tree">
        <span class="dir">apps/technical-analysis/</span><br>
        &nbsp;&nbsp;<span class="dir">cmd/server/</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;<span class="file-go">main.go</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#9ca3af;">← composition root (zero domain logic)</span><br>
        &nbsp;&nbsp;<span class="dir">pkg/</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;<span class="ddd-layer">primitive/</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="file-go">rsi.go</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#9ca3af;">← CalculateRSI (pure function)</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="file-go">macd.go</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#9ca3af;">← CalculateMACD (pure function)</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="file-go">bollinger_bands/</span>&nbsp;<span style="color:#9ca3af;">← CalculateBollingerBands</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="file-go">moving_average/</span>&nbsp;&nbsp;<span style="color:#9ca3af;">← SMA + EMA + dispatcher</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="file-go">detect_cross/</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#9ca3af;">← DetectCross (signal events)</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;<span class="ddd-layer">module/</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="file-go">technical_analysis.go</span>&nbsp;<span style="color:#9ca3af;">← composes all 5 primitives</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;<span class="ddd-layer">domain/</span>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#9ca3af;">← models.go, ports.go, services.go</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;<span class="ddd-layer">application/</span>&nbsp;<span style="color:#9ca3af;">← dtos.go, usecases.go</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;<span class="ddd-layer">infrastructure/</span>&nbsp;<span style="color:#9ca3af;">← calculator.go, repositories.go</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;<span class="ddd-layer">interface/http/</span>&nbsp;<span style="color:#9ca3af;">← router.go (chi)</span><br>
        &nbsp;&nbsp;<span class="dir">api/</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;<span class="file-yaml">openapi.yaml</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#9ca3af;">← HTTP contract (OpenAPI 3.0)</span>
      </div>

      <div class="service-endpoints">
        <h4>HTTP Endpoints (OpenAPI contract)</h4>
        <div class="endpoint-row">
          <span class="method-badge method-get">GET</span>
          <span class="endpoint-path">/health</span>
          <span class="endpoint-desc">Liveness check &rarr; {"status":"ok","service":"technical-analysis","port":5003}</span>
        </div>
        <div class="endpoint-row">
          <span class="method-badge method-post">POST</span>
          <span class="endpoint-path">/ta/indicators</span>
          <span class="endpoint-desc">Compute RSI, MACD, BB, MA for symbol+period. Body: ComputeTARequest &rarr; ComputeTAResponse.</span>
        </div>
      </div>

      <div style="margin-top:16px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 14px;text-align:left;">
        <p style="font-size:0.78rem;font-weight:700;color:#92400e;margin-bottom:4px;">Next task: P1-E2 — Sandbox runner</p>
        <p style="font-size:0.75rem;color:#78350f;line-height:1.5;">
          The "Edit &amp; Rerun" button in each scenario detail modal will call:<br>
          <code style="background:#fef3c7;padding:2px 6px;border-radius:4px;font-family:monospace;">go run ./cmd/sandbox -tier=&lt;tier&gt; -scenario=&lt;file&gt;</code><br>
          Result JSON is read back and the card flips RED or GREEN. Env audit ensures zero DB credentials in sandbox process.
          Security constraint: <strong>ZERO DB credentials, ZERO API keys</strong> in sandbox env at all times.
        </p>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 8. Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  renderPrimitivesPanel();
  renderModulePanel();
  renderServicePanel();

  // Close modal on overlay click
  document.getElementById("modal-overlay")!.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Close modal on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // Close button
  document.getElementById("modal-close-btn")!.addEventListener("click", closeModal);

  // Edit & Rerun button — wired by rerun-handler.ts (P1-E2).
  // rerun-handler.ts replaces this listener on DOMContentLoaded (50ms defer).
  // This stub ensures no-op if rerun-handler fails to load.
  document.getElementById("rerun-btn")!.addEventListener("click", () => {
    if (!currentScenario) return;
    if (typeof window.showRerunPane === "function") {
      window.showRerunPane(currentScenario);
    }
    // rerun-handler.ts takes over from here.
  });
});

// Export symbols used by rerun-handler via window globals.
// esbuild bundles each file separately (IIFE), so cross-file access goes through window.
window.renderPrimitivesPanel = renderPrimitivesPanel;
window.renderModulePanel = renderModulePanel;
window.openModal = openModal;
Object.defineProperty(window, "currentScenario", {
  get() {
    return currentScenario;
  },
  set(v: ScenarioData | null) {
    currentScenario = v;
  },
});
