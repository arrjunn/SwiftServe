import { useState, useEffect, useMemo } from "react";
import { formatINR } from "@swiftserve/shared";
import { getDateRange, getOrdersInRange, getPaymentsForOrders } from "../db/reportOps.js";

const PRESETS = ["today", "yesterday", "thisWeek", "thisMonth"];
const COST_KEYS = [
  { key: "staff", label: "Staff / Salary" },
  { key: "rent", label: "Rent" },
  { key: "utilities", label: "Utilities" },
  { key: "rawMaterials", label: "Raw Materials" },
  { key: "other", label: "Other" },
];

function loadCosts() {
  try { return JSON.parse(localStorage.getItem("ss_monthly_costs") || "{}"); } catch { return {}; }
}
function saveCosts(costs) {
  localStorage.setItem("ss_monthly_costs", JSON.stringify(costs));
}

export default function RevenueSummaryScreen({ onBack }) {
  const [preset, setPreset] = useState("thisMonth");
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [costs, setCosts] = useState(loadCosts());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { start, end } = getDateRange(preset);
      const ords = await getOrdersInRange(start, end);
      const ids = ords.map((o) => o.id);
      const pays = await getPaymentsForOrders(ids);
      setOrders(ords);
      setPayments(pays);
      setLoading(false);
    }
    load();
  }, [preset]);

  const grossRevenue = useMemo(() => orders.reduce((s, o) => s + (o.grand_total || 0), 0), [orders]);
  const taxCollected = useMemo(() => orders.reduce((s, o) => s + (o.tax_total || 0), 0), [orders]);
  const netRevenue = grossRevenue - taxCollected;

  // Pro-rate monthly costs
  const { start, end } = useMemo(() => getDateRange(preset), [preset]);
  const daysInRange = Math.max(1, Math.ceil((end - start) / 86400000));
  const totalMonthlyCost = COST_KEYS.reduce((s, c) => s + (parseInt(costs[c.key]) || 0), 0) * 100; // to paise
  const proRatedCost = Math.round((totalMonthlyCost * daysInRange) / 30);
  const grossMargin = netRevenue - proRatedCost;
  const marginPct = netRevenue > 0 ? ((grossMargin / netRevenue) * 100).toFixed(1) : "0.0";

  const updateCost = (key, val) => {
    const updated = { ...costs, [key]: val.replace(/\D/g, "") };
    setCosts(updated);
    saveCosts(updated);
  };

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <h1 style={styles.title}>Revenue Summary</h1>

        <div style={styles.warning}>
          Costs are manually entered monthly estimates. Actuals may vary.
        </div>

        {/* Presets */}
        <div style={styles.presets}>
          {PRESETS.map((p) => (
            <button key={p} style={{ ...styles.presetBtn, ...(preset === p ? styles.presetActive : {}) }}
              onClick={() => setPreset(p)}>
              {p === "thisWeek" ? "This Week" : p === "thisMonth" ? "This Month" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={styles.loadingText}>Loading...</div>
        ) : (
          <>
            {/* Revenue Section */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Revenue ({daysInRange} day{daysInRange !== 1 ? "s" : ""})</h3>
              <Row label="Gross Revenue" value={formatINR(grossRevenue)} />
              <Row label="Tax Collected" value={`-${formatINR(taxCollected)}`} color="#f59e0b" />
              <Row label="Net Revenue" value={formatINR(netRevenue)} color="#38bdf8" bold />
              <Row label="Order Count" value={String(orders.length)} />
            </div>

            {/* Costs Section */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Monthly Costs (&#8377;)</h3>
              {COST_KEYS.map((c) => (
                <div key={c.key} style={styles.costRow}>
                  <span style={styles.costLabel}>{c.label}</span>
                  <input style={styles.costInput} inputMode="numeric" value={costs[c.key] || ""}
                    onChange={(e) => updateCost(c.key, e.target.value)} placeholder="0" />
                </div>
              ))}
              <Row label={`Pro-rated (${daysInRange}d)`} value={formatINR(proRatedCost)} color="#f87171" />
            </div>

            {/* Margin */}
            <div style={styles.marginBox}>
              <div style={styles.marginRow}>
                <span style={styles.marginLabel}>Gross Margin</span>
                <span style={{ ...styles.marginValue, color: grossMargin >= 0 ? "#4ade80" : "#f87171" }}>
                  {formatINR(grossMargin)}
                </span>
              </div>
              <div style={styles.marginRow}>
                <span style={styles.marginLabel}>Margin %</span>
                <span style={{ ...styles.marginPct, color: grossMargin >= 0 ? "#4ade80" : "#f87171" }}>
                  {marginPct}%
                </span>
              </div>
            </div>
          </>
        )}

        <button style={styles.backBtn} onClick={onBack}>&#8592; Back</button>
      </div>
    </div>
  );
}

function Row({ label, value, color, bold }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={{ ...styles.rowValue, ...(color ? { color } : {}), ...(bold ? { fontWeight: 700 } : {}) }}>{value}</span>
    </div>
  );
}

const styles = {
  container: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "var(--bg-primary)", display: "flex",
    alignItems: "flex-start", justifyContent: "center", padding: "24px 16px",
    overflowY: "auto", color: "var(--text-primary)",
  },
  panel: {
    backgroundColor: "var(--bg-secondary)", borderRadius: 16, padding: 28, width: "100%",
    maxWidth: 520, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", display: "flex",
    flexDirection: "column", margin: "20px 0",
  },
  title: { color: "var(--text-primary)", fontSize: 22, fontWeight: 700, margin: "0 0 12px 0", textAlign: "center" },
  warning: {
    padding: "8px 14px", backgroundColor: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
    borderRadius: 8, color: "#fbbf24", fontSize: 12, textAlign: "center", marginBottom: 12,
  },
  presets: { display: "flex", gap: 6, marginBottom: 16 },
  presetBtn: {
    flex: 1, minHeight: 44, padding: "8px 8px", backgroundColor: "transparent",
    border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)", fontSize: 13,
    fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  presetActive: { borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  loadingText: { color: "var(--text-muted)", textAlign: "center", padding: 32 },
  section: {
    marginBottom: 16, padding: 16, backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)",
    borderRadius: 10, display: "flex", flexDirection: "column", gap: 6,
  },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 8px 0" },
  row: { display: "flex", justifyContent: "space-between", fontSize: 14, padding: "2px 0" },
  rowLabel: { color: "var(--text-muted)" },
  rowValue: { color: "var(--text-secondary)", fontWeight: 500, fontFamily: "monospace" },
  costRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  costLabel: { fontSize: 13, color: "var(--text-muted)", flex: 1 },
  costInput: {
    width: 100, padding: "6px 10px", backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)",
    borderRadius: 6, color: "var(--text-primary)", fontSize: 14, fontFamily: "monospace",
    textAlign: "right", outline: "none", boxSizing: "border-box",
  },
  marginBox: {
    padding: 16, backgroundColor: "var(--bg-primary)", border: "2px solid var(--border)",
    borderRadius: 12, display: "flex", flexDirection: "column", gap: 8,
  },
  marginRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  marginLabel: { fontSize: 16, fontWeight: 700, color: "var(--text-primary)" },
  marginValue: { fontSize: 22, fontWeight: 800, fontFamily: "monospace" },
  marginPct: { fontSize: 22, fontWeight: 800 },
  backBtn: {
    marginTop: 20, width: "100%", minHeight: 48, padding: "10px 24px",
    backgroundColor: "transparent", border: "1px solid var(--border)", borderRadius: 10,
    color: "var(--text-muted)", fontSize: 15, fontWeight: 600, cursor: "pointer",
    touchAction: "manipulation",
  },
};
