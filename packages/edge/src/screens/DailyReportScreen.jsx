import { useState, useEffect, useMemo } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { formatINR } from "@swiftserve/shared";
import {
  getDateRange,
  getOrdersInRange,
  getOrderItemsForOrders,
  getPaymentsForOrders,
  getShiftsInRange,
  aggregateSalesByItem,
  aggregateSalesByHour,
  aggregateSalesByPaymentMethod,
} from "../db/reportOps.js";

const PRESETS = ["today", "yesterday", "thisWeek", "thisMonth"];

const PRESET_LABELS = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This Week",
  thisMonth: "This Month",
};

function formatSource(src) {
  if (!src) return "Counter";
  const lower = src.toLowerCase();
  if (lower === "zomato") return "Zomato";
  if (lower === "swiggy") return "Swiggy";
  return "Counter";
}

export default function DailyReportScreen({ onBack }) {
  const [preset, setPreset] = useState("today");
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [staffMap, setStaffMap] = useState({});

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const { start, end } = getDateRange(preset);

        const ords = await getOrdersInRange(start, end);
        const orderIds = ords.map((o) => o.id);
        const itms = await getOrderItemsForOrders(orderIds);
        const pays = await getPaymentsForOrders(orderIds);
        const shfts = await getShiftsInRange(start, end);

        const staffList = await db.staff.where("outlet_id").equals(OUTLET_ID).toArray();
        const sm = {};
        staffList.forEach((s) => { sm[s.id] = s.name; });

        // Enrich shifts with cash payment totals
        const enrichedShifts = [];
        for (const shift of shfts) {
          const cashPayments = await db.payments
            .where("shift_id").equals(shift.id)
            .filter((p) => p.method === "cash" && p.status === "success" && !p.is_refund)
            .toArray();
          const cashExpected = cashPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
          enrichedShifts.push({ ...shift, cashExpected });
        }

        setOrders(ords);
        setItems(itms);
        setPayments(pays);
        setShifts(enrichedShifts);
        setStaffMap(sm);
        setLoading(false);
      } catch (err) {
        console.error("DailyReportScreen load error:", err);
        setLoading(false);
      }
    }
    load();
  }, [preset]);

  // --- Derived data ---

  const totalRevenue = useMemo(
    () => orders.reduce((s, o) => s + (o.grand_total || 0), 0),
    [orders]
  );
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // Orders by source
  const bySource = useMemo(() => {
    const map = {};
    orders.forEach((o) => {
      const src = formatSource(o.source);
      if (!map[src]) map[src] = { source: src, count: 0, revenue: 0 };
      map[src].count += 1;
      map[src].revenue += o.grand_total || 0;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  // Payment breakdown
  const byPayment = useMemo(
    () => aggregateSalesByPaymentMethod(payments),
    [payments]
  );

  // Top 5 selling items by quantity
  const topItems = useMemo(() => {
    const all = aggregateSalesByItem(items, 100);
    return [...all].sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [items]);

  // Busiest hour
  const busiestHour = useMemo(() => {
    const slots = aggregateSalesByHour(orders);
    if (slots.length === 0) return { hour: 0, count: 0, revenue: 0 };
    let best = slots[0];
    slots.forEach((s) => { if (s.count > best.count) best = s; });
    return best;
  }, [orders]);

  // Cash variance across all closed shifts
  const cashVariance = useMemo(() => {
    const closedShifts = shifts.filter((s) => s.status === "closed");
    if (closedShifts.length === 0) return null;

    let totalExpected = 0;
    let totalActual = 0;
    closedShifts.forEach((s) => {
      totalExpected += (s.opening_cash || 0) + (s.cashExpected || 0);
      totalActual += s.closing_cash || 0;
    });

    return { expected: totalExpected, actual: totalActual, diff: totalActual - totalExpected };
  }, [shifts]);

  // Staff leaderboard
  const staffLeaderboard = useMemo(() => {
    const map = {};
    orders.forEach((o) => {
      const sid = o.staff_id;
      if (!sid) return;
      if (!map[sid]) map[sid] = { staffId: sid, name: staffMap[sid] || "Unknown", count: 0, revenue: 0 };
      map[sid].count += 1;
      map[sid].revenue += o.grand_total || 0;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [orders, staffMap]);

  // --- Render ---

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <h1 style={styles.title}>Daily Report</h1>

        {/* Date presets */}
        <div style={styles.presets}>
          {PRESETS.map((p) => (
            <button
              key={p}
              style={{ ...styles.presetBtn, ...(preset === p ? styles.presetActive : {}) }}
              onClick={() => setPreset(p)}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={styles.loadingText}>Loading report...</div>
        ) : totalOrders === 0 ? (
          <div style={styles.empty}>No completed orders for this period.</div>
        ) : (
          <div style={styles.reportBody}>

            {/* Summary cards row */}
            <div style={styles.summaryRow}>
              <SummaryCard label="Total Revenue" value={formatINR(totalRevenue)} color="#38bdf8" />
              <SummaryCard label="Total Orders" value={String(totalOrders)} color="#a78bfa" />
              <SummaryCard label="Avg Order Value" value={formatINR(avgOrderValue)} color="#fbbf24" />
            </div>

            {/* Orders by Source */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Orders by Source</h2>
              {bySource.map((s) => (
                <div key={s.source} style={styles.row}>
                  <span style={styles.rowLabel}>{s.source}</span>
                  <span style={styles.rowMeta}>{s.count} orders</span>
                  <span style={styles.rowValue}>{formatINR(s.revenue)}</span>
                </div>
              ))}
            </div>

            {/* Payment Breakdown */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Payment Breakdown</h2>
              {byPayment.length === 0 ? (
                <div style={styles.muted}>No payments recorded.</div>
              ) : (
                byPayment.map((p) => (
                  <div key={p.method} style={styles.row}>
                    <span style={styles.rowLabel}>{p.method.charAt(0).toUpperCase() + p.method.slice(1)}</span>
                    <span style={styles.rowMeta}>{p.count} txns</span>
                    <span style={styles.rowValue}>{formatINR(p.total)}</span>
                  </div>
                ))
              )}
            </div>

            {/* Top 5 Selling Items */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Top 5 Selling Items</h2>
              {topItems.length === 0 ? (
                <div style={styles.muted}>No item data available.</div>
              ) : (
                topItems.map((item, idx) => (
                  <div key={item.name + idx} style={styles.row}>
                    <span style={styles.rankBadge}>{idx + 1}</span>
                    <span style={{ ...styles.rowLabel, flex: 1 }}>{item.name}</span>
                    <span style={styles.rowMeta}>{item.qty} sold</span>
                    <span style={styles.rowValue}>{formatINR(item.revenue)}</span>
                  </div>
                ))
              )}
            </div>

            {/* Busiest Hour */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Busiest Hour</h2>
              {busiestHour.count === 0 ? (
                <div style={styles.muted}>No data.</div>
              ) : (
                <div style={styles.busiestRow}>
                  <span style={styles.busiestTime}>
                    {String(busiestHour.hour).padStart(2, "0")}:00 - {String(busiestHour.hour + 1).padStart(2, "0")}:00
                  </span>
                  <span style={styles.busiestDetail}>
                    {busiestHour.count} orders / {formatINR(busiestHour.revenue)}
                  </span>
                </div>
              )}
            </div>

            {/* Cash Variance */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Cash Variance</h2>
              {cashVariance === null ? (
                <div style={styles.muted}>No closed shifts in this period.</div>
              ) : (
                <>
                  <div style={styles.row}>
                    <span style={styles.rowLabel}>Expected</span>
                    <span style={styles.rowValue}>{formatINR(cashVariance.expected)}</span>
                  </div>
                  <div style={styles.row}>
                    <span style={styles.rowLabel}>Actual</span>
                    <span style={styles.rowValue}>{formatINR(cashVariance.actual)}</span>
                  </div>
                  <div style={{ ...styles.row, borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 4 }}>
                    <span style={{ ...styles.rowLabel, fontWeight: 700 }}>Difference</span>
                    <span style={{
                      ...styles.rowValue,
                      fontWeight: 700,
                      color: cashVariance.diff >= 0 ? "#4ade80" : "#f87171",
                    }}>
                      {cashVariance.diff >= 0 ? "+" : ""}{formatINR(cashVariance.diff)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Staff Leaderboard */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Staff Leaderboard</h2>
              {staffLeaderboard.length === 0 ? (
                <div style={styles.muted}>No staff data available.</div>
              ) : (
                staffLeaderboard.map((s, idx) => (
                  <div key={s.staffId} style={styles.row}>
                    <span style={styles.rankBadge}>{idx + 1}</span>
                    <span style={{ ...styles.rowLabel, flex: 1 }}>{s.name}</span>
                    <span style={styles.rowMeta}>{s.count} orders</span>
                    <span style={styles.rowValue}>{formatINR(s.revenue)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <button style={styles.backBtn} onClick={onBack} aria-label="Back">&#8592; Back</button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={styles.summaryCard}>
      <div style={{ ...styles.summaryValue, color }}>{value}</div>
      <div style={styles.summaryLabel}>{label}</div>
    </div>
  );
}

const styles = {
  container: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "var(--bg-primary)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "24px 16px",
    overflowY: "auto",
    color: "var(--text-primary)",
  },
  panel: {
    backgroundColor: "var(--bg-secondary)",
    borderRadius: 16,
    padding: 28,
    width: "100%",
    maxWidth: 600,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    display: "flex",
    flexDirection: "column",
    margin: "20px 0",
  },
  title: {
    color: "var(--text-primary)",
    fontSize: 22,
    fontWeight: 700,
    margin: "0 0 16px 0",
    textAlign: "center",
  },
  presets: {
    display: "flex",
    gap: 6,
    marginBottom: 16,
  },
  presetBtn: {
    flex: 1,
    minHeight: 44,
    padding: "8px 8px",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  presetActive: {
    borderColor: "#3b82f6",
    backgroundColor: "rgba(59,130,246,0.15)",
    color: "#60a5fa",
  },
  loadingText: {
    color: "var(--text-muted)",
    textAlign: "center",
    padding: 32,
  },
  empty: {
    color: "var(--text-muted)",
    textAlign: "center",
    padding: 32,
  },
  reportBody: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },

  /* Summary cards row */
  summaryRow: {
    display: "flex",
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "14px 10px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 700,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  /* Section cards */
  card: {
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: 0,
    paddingBottom: 6,
    borderBottom: "1px solid var(--border)",
  },

  /* Row items */
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
  },
  rowLabel: {
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  rowMeta: {
    color: "var(--text-dim)",
    fontSize: 12,
    marginLeft: "auto",
    marginRight: 8,
  },
  rowValue: {
    color: "#38bdf8",
    fontWeight: 600,
    fontSize: 13,
    minWidth: 70,
    textAlign: "right",
  },
  rankBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: "50%",
    backgroundColor: "rgba(59,130,246,0.15)",
    color: "#60a5fa",
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },
  muted: {
    color: "var(--text-muted)",
    fontSize: 13,
    padding: "4px 0",
  },

  /* Busiest hour */
  busiestRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  busiestTime: {
    fontSize: 16,
    fontWeight: 700,
    color: "#fbbf24",
  },
  busiestDetail: {
    fontSize: 13,
    color: "var(--text-muted)",
  },

  /* Back button */
  backBtn: {
    marginTop: 20,
    width: "100%",
    minHeight: 48,
    padding: "10px 24px",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--text-muted)",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
};
