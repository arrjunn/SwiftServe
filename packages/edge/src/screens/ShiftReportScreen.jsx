import { useState, useEffect } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { formatINR } from "@swiftserve/shared";
import { getDateRange, getShiftsInRange } from "../db/reportOps.js";

const PRESETS = ["today", "yesterday", "thisWeek", "thisMonth"];

export default function ShiftReportScreen({ onBack }) {
  const [preset, setPreset] = useState("today");
  const [shifts, setShifts] = useState([]);
  const [staffMap, setStaffMap] = useState({});
  const [staffFilter, setStaffFilter] = useState("");
  const [allStaff, setAllStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { start, end } = getDateRange(preset);
      const s = await getShiftsInRange(start, end, staffFilter || undefined);

      // Load staff names
      const staffList = await db.staff.where("outlet_id").equals(OUTLET_ID).toArray();
      const sm = {};
      staffList.forEach((st) => { sm[st.id] = st.name; });
      setStaffMap(sm);
      setAllStaff(staffList);

      // Load order count + revenue per shift
      const enriched = [];
      for (const shift of s) {
        const orders = await db.orders
          .where("shift_id").equals(shift.id)
          .filter((o) => o.status === "completed")
          .toArray();
        const revenue = orders.reduce((sum, o) => sum + (o.grand_total || 0), 0);

        // Cash payments in this shift
        const cashPayments = await db.payments
          .where("shift_id").equals(shift.id)
          .filter((p) => p.method === "cash" && p.status === "success" && !p.is_refund)
          .toArray();
        const cashExpected = cashPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

        enriched.push({
          ...shift,
          orderCount: orders.length,
          revenue,
          cashExpected,
        });
      }

      setShifts(enriched);
      setLoading(false);
    }
    load();
  }, [preset, staffFilter]);

  const formatDuration = (openedAt, closedAt) => {
    if (!closedAt) return "Active";
    const diff = Math.floor((new Date(closedAt) - new Date(openedAt)) / 60000);
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <h1 style={styles.title}>Shift Report</h1>

        {/* Presets */}
        <div style={styles.presets}>
          {PRESETS.map((p) => (
            <button key={p} style={{ ...styles.presetBtn, ...(preset === p ? styles.presetActive : {}) }}
              onClick={() => setPreset(p)}>
              {p === "thisWeek" ? "This Week" : p === "thisMonth" ? "This Month" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {/* Staff Filter */}
        <select style={styles.select} value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}>
          <option value="">All Staff</option>
          {allStaff.filter((s) => s.role !== "kitchen").map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {loading ? (
          <div style={styles.loadingText}>Loading...</div>
        ) : shifts.length === 0 ? (
          <div style={styles.empty}>No shifts found for this period.</div>
        ) : (
          <div style={styles.shiftList}>
            {shifts.map((s) => {
              const cashDiff = s.status === "closed" ? (s.closing_cash || 0) - s.cashExpected : null;
              return (
                <div key={s.id} style={styles.shiftCard}>
                  <div style={styles.shiftHeader}>
                    <span style={styles.staffName}>{staffMap[s.staff_id] || "Unknown"}</span>
                    <span style={{ ...styles.statusBadge, color: s.status === "open" ? "#4ade80" : "var(--text-muted)" }}>
                      {s.status}
                    </span>
                  </div>

                  <div style={styles.shiftDetails}>
                    <div style={styles.detailRow}>
                      <span style={styles.detailLabel}>Opened</span>
                      <span style={styles.detailValue}>
                        {new Date(s.opened_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {s.closed_at && (
                      <div style={styles.detailRow}>
                        <span style={styles.detailLabel}>Closed</span>
                        <span style={styles.detailValue}>
                          {new Date(s.closed_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    )}
                    <div style={styles.detailRow}>
                      <span style={styles.detailLabel}>Duration</span>
                      <span style={styles.detailValue}>{formatDuration(s.opened_at, s.closed_at)}</span>
                    </div>
                    <div style={styles.detailRow}>
                      <span style={styles.detailLabel}>Orders</span>
                      <span style={styles.detailValue}>{s.orderCount}</span>
                    </div>
                    <div style={styles.detailRow}>
                      <span style={styles.detailLabel}>Revenue</span>
                      <span style={{ ...styles.detailValue, color: "#38bdf8" }}>{formatINR(s.revenue)}</span>
                    </div>
                    {s.status === "closed" && (
                      <>
                        <div style={styles.detailRow}>
                          <span style={styles.detailLabel}>Cash Expected</span>
                          <span style={styles.detailValue}>{formatINR(s.cashExpected)}</span>
                        </div>
                        <div style={styles.detailRow}>
                          <span style={styles.detailLabel}>Cash Actual</span>
                          <span style={styles.detailValue}>{formatINR(s.closing_cash || 0)}</span>
                        </div>
                        {cashDiff !== null && (
                          <div style={styles.detailRow}>
                            <span style={styles.detailLabel}>Difference</span>
                            <span style={{ ...styles.detailValue, color: cashDiff >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                              {cashDiff >= 0 ? "+" : ""}{formatINR(cashDiff)}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button style={styles.backBtn} onClick={onBack}>&#8592; Back</button>
      </div>
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
    maxWidth: 560, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", display: "flex",
    flexDirection: "column", margin: "20px 0",
  },
  title: { color: "var(--text-primary)", fontSize: 22, fontWeight: 700, margin: "0 0 16px 0", textAlign: "center" },
  presets: { display: "flex", gap: 6, marginBottom: 12 },
  presetBtn: {
    flex: 1, minHeight: 44, padding: "8px 8px", backgroundColor: "transparent",
    border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)", fontSize: 13,
    fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  presetActive: { borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  select: {
    width: "100%", padding: "10px 12px", backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text-primary)", fontSize: 14, outline: "none", boxSizing: "border-box",
    marginBottom: 12,
  },
  loadingText: { color: "var(--text-muted)", textAlign: "center", padding: 32 },
  empty: { color: "var(--text-muted)", textAlign: "center", padding: 32 },
  shiftList: { display: "flex", flexDirection: "column", gap: 10, maxHeight: 500, overflowY: "auto" },
  shiftCard: {
    backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10,
    padding: 16, display: "flex", flexDirection: "column", gap: 10,
  },
  shiftHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  staffName: { fontSize: 16, fontWeight: 700, color: "var(--text-primary)" },
  statusBadge: { fontSize: 12, fontWeight: 600, textTransform: "uppercase" },
  shiftDetails: { display: "flex", flexDirection: "column", gap: 4 },
  detailRow: { display: "flex", justifyContent: "space-between", fontSize: 13 },
  detailLabel: { color: "var(--text-muted)" },
  detailValue: { color: "var(--text-secondary)", fontWeight: 500 },
  backBtn: {
    marginTop: 20, width: "100%", minHeight: 48, padding: "10px 24px",
    backgroundColor: "transparent", border: "1px solid var(--border)", borderRadius: 10,
    color: "var(--text-muted)", fontSize: 15, fontWeight: 600, cursor: "pointer",
    touchAction: "manipulation",
  },
};
