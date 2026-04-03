import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { formatINR } from "@swiftserve/shared";

const STATUS_CONFIG = {
  available: { color: "#22c55e", label: "Available" },
  occupied: { color: "#f59e0b", label: "Occupied" },
  reserved: { color: "#3b82f6", label: "Reserved" },
  blocked: { color: "#ef4444", label: "Blocked" },
};

const REFRESH_INTERVAL = 15_000;

function formatElapsed(startISO) {
  if (!startISO) return "--";
  const diffMs = Date.now() - new Date(startISO).getTime();
  if (diffMs < 0) return "0m";
  const totalMin = Math.floor(diffMs / 60_000);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function getTodayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return { start, end };
}

export default function TableTimelineScreen({ onBack }) {
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [todayOrders, setTodayOrders] = useState([]);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const allTables = await db.floor_tables
        .where("outlet_id")
        .equals(OUTLET_ID)
        .toArray();
      const activeTables = allTables
        .filter((t) => !t.deleted_at)
        .sort((a, b) => String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true }));
      setTables(activeTables);

      // Current orders for occupied tables
      const occupiedIds = activeTables
        .filter((t) => t.current_order_id)
        .map((t) => t.current_order_id);
      if (occupiedIds.length > 0) {
        const currentOrders = await db.orders.bulkGet(occupiedIds);
        setOrders(currentOrders.filter(Boolean));
      } else {
        setOrders([]);
      }

      // Today's completed orders for stats
      const { start, end } = getTodayRange();
      const todayAll = await db.orders
        .where("[outlet_id+created_at]")
        .between([OUTLET_ID, start], [OUTLET_ID, end], true, false)
        .toArray();
      setTodayOrders(todayAll.filter((o) => o.status === "completed" || o.status === "paid"));
    } catch (err) {
      console.error("TableTimelineScreen loadData error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData();
      setTick((t) => t + 1);
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  // Force elapsed-time updates every 30s even between data refreshes
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const orderMap = useMemo(() => {
    const m = {};
    orders.forEach((o) => { m[o.id] = o; });
    return m;
  }, [orders]);

  const tableStats = useMemo(() => {
    const stats = {};
    todayOrders.forEach((o) => {
      if (!o.table_id) return;
      if (!stats[o.table_id]) stats[o.table_id] = { count: 0, revenue: 0 };
      stats[o.table_id].count += 1;
      stats[o.table_id].revenue += o.grand_total || 0;
    });
    return stats;
  }, [todayOrders]);

  if (loading) return (
    <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 15 }}>
      Loading tables...
    </div>
  );

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack} aria-label="Back">
          &#8592; Back
        </button>
        <h1 style={styles.title}>Table Timeline</h1>
        <div style={styles.headerRight}>
          <span style={styles.countBadge}>
            {tables.length} tables
          </span>
        </div>
      </div>

      {/* Status legend */}
      <div style={styles.legend}>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} style={styles.legendItem}>
            <span style={{ ...styles.legendDot, backgroundColor: cfg.color }} />
            <span style={styles.legendLabel}>{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* Status summary bar */}
      <div style={styles.summaryBar}>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const count = tables.filter(t => t.status === key).length;
          return (
            <div key={key} style={styles.summaryItem}>
              <span style={{ ...styles.summaryDot, backgroundColor: cfg.color }} />
              <span style={styles.summaryLabel}>{cfg.label}</span>
              <span style={{ ...styles.summaryCount, color: cfg.color }}>{count}</span>
            </div>
          );
        })}
      </div>

      {/* Tables grouped by status */}
      <div style={styles.scrollArea}>
        {tables.length === 0 && (
          <div style={styles.empty}>No tables configured for this outlet.</div>
        )}

        {["occupied", "reserved", "available", "blocked"].map((statusKey) => {
          const group = tables.filter(t => t.status === statusKey);
          if (group.length === 0) return null;
          const cfg = STATUS_CONFIG[statusKey];

          return (
            <div key={statusKey} style={styles.section}>
              <div style={styles.sectionHeader}>
                <span style={{ ...styles.sectionDot, backgroundColor: cfg.color }} />
                <span style={styles.sectionTitle}>{cfg.label}</span>
                <span style={styles.sectionCount}>{group.length}</span>
              </div>
              <div style={styles.grid}>
                {group.map((table) => {
                  const order = table.current_order_id ? orderMap[table.current_order_id] : null;
                  const isOccupied = table.status === "occupied";
                  const stat = tableStats[table.id];

                  return (
                    <div key={table.id} style={{ ...styles.card, borderColor: cfg.color }}>
                      <div style={styles.cardHeader}>
                        <span style={styles.tableNumber}>{table.table_number}</span>
                        <span style={{ ...styles.badge, backgroundColor: cfg.color }}>{cfg.label}</span>
                      </div>

                      <div style={styles.cardBody}>
                        {isOccupied && order ? (
                          <>
                            <div style={styles.orderRow}>
                              <span style={styles.labelText}>Order</span>
                              <span style={styles.valueText}>#{order.order_number}</span>
                            </div>
                            <div style={styles.orderRow}>
                              <span style={styles.labelText}>Time</span>
                              <span style={styles.elapsed}>{formatElapsed(order.created_at)}</span>
                            </div>
                            <div style={styles.orderRow}>
                              <span style={styles.labelText}>Total</span>
                              <span style={styles.valueText}>{formatINR(order.grand_total || 0)}</span>
                            </div>
                          </>
                        ) : isOccupied && !order ? (
                          <span style={styles.mutedText}>Occupied (no order linked)</span>
                        ) : table.status === "reserved" ? (
                          <span style={{ ...styles.mutedText, color: "#3b82f6" }}>Reserved</span>
                        ) : table.status === "blocked" ? (
                          <span style={{ ...styles.mutedText, color: "#ef4444" }}>Blocked</span>
                        ) : (
                          <span style={styles.readyText}>Ready</span>
                        )}
                      </div>

                      {stat ? (
                        <div style={styles.cardFooter}>
                          <span style={styles.footerText}>
                            Today: {stat.count} order{stat.count !== 1 ? "s" : ""} / {formatINR(stat.revenue)}
                          </span>
                        </div>
                      ) : (
                        <div style={styles.cardFooter}>
                          <span style={styles.footerText}>Today: 0 orders</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    backgroundColor: "var(--bg-secondary)",
    flexShrink: 0,
  },
  backBtn: {
    background: "none",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    padding: "8px 14px",
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
    minHeight: 44,
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    margin: 0,
    color: "var(--text-primary)",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  countBadge: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "4px 10px",
    border: "1px solid var(--border)",
    borderRadius: 12,
  },
  legend: {
    display: "flex",
    gap: 16,
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
    flexWrap: "wrap",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    display: "inline-block",
    width: 10,
    height: 10,
    borderRadius: "50%",
  },
  legendLabel: {
    fontSize: 13,
    color: "var(--text-muted)",
  },
  summaryBar: {
    display: "flex", gap: 16, padding: "10px 16px", borderBottom: "1px solid var(--border)",
    flexShrink: 0, flexWrap: "wrap",
  },
  summaryItem: { display: "flex", alignItems: "center", gap: 6 },
  summaryDot: { width: 10, height: 10, borderRadius: "50%" },
  summaryLabel: { fontSize: 13, color: "var(--text-muted)", fontWeight: 500 },
  summaryCount: { fontSize: 15, fontWeight: 700 },
  scrollArea: {
    flex: 1, overflowY: "auto", padding: "0 16px 16px",
  },
  section: { marginTop: 16 },
  sectionHeader: {
    display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
  },
  sectionDot: { width: 10, height: 10, borderRadius: "50%" },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: 0.5 },
  sectionCount: { fontSize: 12, color: "var(--text-dim)", fontWeight: 600 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 12,
    alignContent: "start",
  },
  card: {
    backgroundColor: "var(--bg-secondary)",
    border: "2px solid",
    borderRadius: 10,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minHeight: 150,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tableNumber: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    color: "#fff",
    padding: "3px 10px",
    borderRadius: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardBody: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    justifyContent: "center",
  },
  orderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  labelText: {
    fontSize: 13,
    color: "var(--text-muted)",
  },
  valueText: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  elapsed: {
    fontSize: 14,
    fontWeight: 600,
    color: "#f59e0b",
  },
  readyText: {
    fontSize: 15,
    fontWeight: 500,
    color: "#22c55e",
    textAlign: "center",
  },
  mutedText: {
    fontSize: 13,
    color: "var(--text-dim)",
    textAlign: "center",
  },
  cardFooter: {
    borderTop: "1px solid var(--border)",
    paddingTop: 8,
  },
  footerText: {
    fontSize: 12,
    color: "var(--text-dim)",
  },
  empty: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    fontSize: 15,
    padding: 32,
  },
};
