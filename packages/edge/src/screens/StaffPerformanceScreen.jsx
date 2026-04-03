import { useState, useEffect, useMemo } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { formatINR } from "@swiftserve/shared";
import { getDateRange } from "../db/reportOps.js";

const PRESETS = ["today", "yesterday", "thisWeek", "thisMonth"];

function presetLabel(p) {
  if (p === "thisWeek") return "This Week";
  if (p === "thisMonth") return "This Month";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export default function StaffPerformanceScreen({ onBack }) {
  const [preset, setPreset] = useState("today");
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState([]);
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [shifts, setShifts] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const { start, end } = getDateRange(preset);
        const startISO = start.toISOString();
        const endISO = end.toISOString();

        const [staff, allShifts, allOrders] = await Promise.all([
          db.staff.where("outlet_id").equals(OUTLET_ID).toArray(),
          db.shifts.toArray(),
          db.orders
            .where("[outlet_id+created_at]")
            .between([OUTLET_ID, startISO], [OUTLET_ID, endISO], true, true)
            .toArray(),
        ]);

        // Filter orders to completed/fulfilled statuses and matching outlet
        const validOrders = allOrders.filter(
          (o) => o.status === "completed" || o.status === "fulfilled" || o.status === "paid"
        );

        // Filter shifts that overlap with the date range
        const rangeShifts = allShifts.filter((s) => {
          if (!s.opened_at) return false;
          const openedAt = new Date(s.opened_at);
          const closedAt = s.closed_at ? new Date(s.closed_at) : new Date();
          return openedAt <= end && closedAt >= start;
        });

        // Fetch payments for the valid orders
        const orderIds = validOrders.map((o) => o.id);
        const pays = orderIds.length > 0
          ? await db.payments.where("order_id").anyOf(orderIds).toArray()
          : [];

        setStaffList(staff);
        setOrders(validOrders);
        setPayments(pays);
        setShifts(rangeShifts);
        setLoading(false);
      } catch (err) {
        console.error("StaffPerformanceScreen load error:", err);
        setLoading(false);
      }
    }
    load();
  }, [preset]);

  const staffMetrics = useMemo(() => {
    const staffMap = {};
    staffList.forEach((s) => {
      staffMap[s.id] = {
        id: s.id,
        name: s.name,
        role: s.role,
        totalOrders: 0,
        totalRevenue: 0,
        cashCollected: 0,
        shiftHours: 0,
      };
    });

    // Aggregate orders
    orders.forEach((o) => {
      if (!o.staff_id || !staffMap[o.staff_id]) return;
      const m = staffMap[o.staff_id];
      m.totalOrders += 1;
      m.totalRevenue += o.grand_total || 0;
    });

    // Aggregate cash payments
    payments.forEach((p) => {
      if (p.is_refund || p.status === "refunded") return;
      // Find which staff handled this order
      const order = orders.find((o) => o.id === p.order_id);
      if (!order || !order.staff_id || !staffMap[order.staff_id]) return;
      if (p.method === "cash") {
        staffMap[order.staff_id].cashCollected += p.amount || 0;
      }
    });

    // Aggregate shift hours
    const { start, end } = getDateRange(preset);
    shifts.forEach((s) => {
      if (!s.staff_id || !staffMap[s.staff_id]) return;
      const openedAt = new Date(s.opened_at);
      const closedAt = s.closed_at ? new Date(s.closed_at) : new Date();
      // Clamp to date range
      const effectiveStart = openedAt < start ? start : openedAt;
      const effectiveEnd = closedAt > end ? end : closedAt;
      const hours = Math.max(0, (effectiveEnd - effectiveStart) / (1000 * 60 * 60));
      staffMap[s.staff_id].shiftHours += hours;
    });

    // Build array, compute derived metrics, sort by revenue desc
    return Object.values(staffMap)
      .map((m) => ({
        ...m,
        avgOrderValue: m.totalOrders > 0 ? Math.round(m.totalRevenue / m.totalOrders) : 0,
        ordersPerHour: m.shiftHours > 0 ? (m.totalOrders / m.shiftHours) : 0,
      }))
      .filter((m) => m.totalOrders > 0 || m.shiftHours > 0)
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [staffList, orders, payments, shifts, preset]);

  const maxRevenue = Math.max(...staffMetrics.map((m) => m.totalRevenue), 1);

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <h1 style={styles.title}>Staff Performance</h1>

        {/* Date Presets */}
        <div style={styles.presets}>
          {PRESETS.map((p) => (
            <button
              key={p}
              style={{ ...styles.presetBtn, ...(preset === p ? styles.presetActive : {}) }}
              onClick={() => setPreset(p)}
            >
              {presetLabel(p)}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={styles.loadingText}>Loading...</div>
        ) : staffMetrics.length === 0 ? (
          <div style={styles.empty}>No staff activity for this period.</div>
        ) : (
          <div style={styles.cardList}>
            {staffMetrics.map((m) => (
              <div key={m.id} style={styles.staffCard}>
                <div style={styles.staffHeader}>
                  <div style={styles.staffNameRow}>
                    <span style={styles.staffName}>{m.name}</span>
                    {m.role && <span style={styles.staffRole}>{m.role}</span>}
                  </div>
                  <span style={styles.staffRevenue}>{formatINR(m.totalRevenue)}</span>
                </div>

                {/* Revenue bar */}
                <div style={styles.barTrack}>
                  <div
                    style={{
                      ...styles.barFill,
                      width: `${Math.max((m.totalRevenue / maxRevenue) * 100, 2)}%`,
                    }}
                  />
                </div>

                {/* Metrics grid */}
                <div style={styles.metricsGrid}>
                  <div style={styles.metricCell}>
                    <span style={styles.metricLabel}>Orders</span>
                    <span style={styles.metricValue}>{m.totalOrders}</span>
                  </div>
                  <div style={styles.metricCell}>
                    <span style={styles.metricLabel}>Avg Order</span>
                    <span style={styles.metricValue}>{formatINR(m.avgOrderValue)}</span>
                  </div>
                  <div style={styles.metricCell}>
                    <span style={styles.metricLabel}>Orders/hr</span>
                    <span style={styles.metricValue}>{m.ordersPerHour.toFixed(1)}</span>
                  </div>
                  <div style={styles.metricCell}>
                    <span style={styles.metricLabel}>Shift Hrs</span>
                    <span style={styles.metricValue}>{m.shiftHours.toFixed(1)}</span>
                  </div>
                  <div style={styles.metricCell}>
                    <span style={styles.metricLabel}>Cash</span>
                    <span style={styles.metricValue}>{formatINR(m.cashCollected)}</span>
                  </div>
                  <div style={styles.metricCell}>
                    <span style={styles.metricLabel}>Revenue</span>
                    <span style={styles.metricValue}>{formatINR(m.totalRevenue)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button style={styles.backBtn} onClick={onBack} aria-label="Back">
          &#8592; Back
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    maxWidth: 640,
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
  presets: { display: "flex", gap: 6, marginBottom: 16 },
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
    padding: 24,
  },
  cardList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxHeight: 480,
    overflowY: "auto",
  },
  staffCard: {
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  staffHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  staffNameRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  staffName: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  staffRole: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-dim)",
    textTransform: "uppercase",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: "2px 8px",
    borderRadius: 4,
  },
  staffRevenue: {
    fontSize: 16,
    fontWeight: 700,
    color: "#38bdf8",
    fontFamily: "monospace",
  },
  barTrack: {
    height: 6,
    backgroundColor: "var(--border)",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: "#3b82f6",
    borderRadius: 3,
    transition: "width 0.3s ease",
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
  },
  metricCell: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    padding: "6px 0",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "var(--text-dim)",
    textTransform: "uppercase",
    letterSpacing: "0.02em",
  },
  metricValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-primary)",
    fontFamily: "monospace",
  },
  backBtn: {
    marginTop: 16,
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
