import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { formatINR } from "@swiftserve/shared";

const DATE_RANGES = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
];

function getDateRange(key) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (key === "today") {
    return { from: startOfDay.toISOString(), to: now.toISOString() };
  }
  if (key === "week") {
    const day = startOfDay.getDay(); // 0=Sun
    const monday = new Date(startOfDay);
    monday.setDate(monday.getDate() - ((day + 6) % 7));
    return { from: monday.toISOString(), to: now.toISOString() };
  }
  // month
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: startOfMonth.toISOString(), to: now.toISOString() };
}

// ── Styles ──────────────────────────────────────────────────────────────────
const S = {
  root: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    background: "var(--bg-primary)",
    color: "var(--text-secondary)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    overflowY: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 20px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    background: "transparent",
    border: "1px solid var(--border-light)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 20,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0, flex: 1 },
  toolbar: {
    display: "flex",
    gap: 8,
    padding: "12px 20px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  filterBtn: (active) => ({
    minHeight: 44,
    padding: "8px 16px",
    background: active ? "#2563eb" : "var(--bg-secondary)",
    border: "1px solid " + (active ? "#2563eb" : "var(--border)"),
    borderRadius: 8,
    color: active ? "#fff" : "var(--text-muted)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  }),
  summaryBar: {
    display: "flex",
    gap: 16,
    padding: "12px 20px",
    flexWrap: "wrap",
  },
  summaryCard: {
    flex: 1,
    minWidth: 140,
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 16,
    textAlign: "center",
  },
  summaryLabel: { fontSize: 12, color: "var(--text-muted)", marginBottom: 4 },
  summaryValue: { fontSize: 22, fontWeight: 700, color: "var(--text-primary)" },
  tableWrap: {
    padding: "0 20px 20px",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
  th: {
    padding: "10px 12px",
    textAlign: "left",
    fontWeight: 600,
    color: "var(--text-muted)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid var(--bg-secondary)",
    color: "var(--text-secondary)",
    verticalAlign: "top",
  },
  badge: (color) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    background: color + "22",
    color,
  }),
  empty: {
    textAlign: "center",
    padding: 40,
    color: "var(--text-dim)",
    fontSize: 15,
  },
};

const REASON_COLORS = {
  expired: "#f59e0b",
  damaged: "#ef4444",
  spill: "#3b82f6",
  overcooked: "#a855f7",
  other: "var(--text-dim)",
};

// ─────────────────────────────────────────────────────────────────────────────
export default function WastageLogScreen({ onBack }) {
  useAuth(); // ensure inside provider

  const [logs, setLogs] = useState([]);
  const [itemMap, setItemMap] = useState({});
  const [staffMap, setStaffMap] = useState({});
  const [range, setRange] = useState("today");

  const loadData = useCallback(async () => {
    const { from } = getDateRange(range);

    // Load wastage logs within date range
    const allLogs = await db.wastage_log
      .where("outlet_id")
      .equals(OUTLET_ID)
      .toArray();

    const filtered = allLogs
      .filter((l) => l.created_at >= from)
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

    setLogs(filtered);

    // Build item name map
    const items = await db.inventory_items
      .where("outlet_id")
      .equals(OUTLET_ID)
      .toArray();
    const iMap = {};
    for (const it of items) {
      iMap[it.id] = it;
    }
    setItemMap(iMap);

    // Build staff name map
    const staffList = await db.staff
      .where("outlet_id")
      .equals(OUTLET_ID)
      .toArray();
    const sMap = {};
    for (const s of staffList) {
      sMap[s.id] = s.name;
    }
    setStaffMap(sMap);
  }, [range]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Summaries ───────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    let totalCount = 0;
    let totalCost = 0;
    for (const log of logs) {
      totalCount += log.quantity || 0;
      totalCost += log.cost_value || 0;
    }
    return { totalCount, totalCost, entries: logs.length };
  }, [logs]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack} aria-label="Back">{"\u2190"}</button>
        <h1 style={S.title}>Wastage Log</h1>
      </div>

      {/* Date range filter */}
      <div style={S.toolbar}>
        {DATE_RANGES.map((r) => (
          <button
            key={r.key}
            style={S.filterBtn(range === r.key)}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div style={S.summaryBar}>
        <div style={S.summaryCard}>
          <div style={S.summaryLabel}>Entries</div>
          <div style={S.summaryValue}>{summary.entries}</div>
        </div>
        <div style={S.summaryCard}>
          <div style={S.summaryLabel}>Total Qty Wasted</div>
          <div style={S.summaryValue}>{summary.totalCount}</div>
        </div>
        <div style={S.summaryCard}>
          <div style={S.summaryLabel}>Total Cost</div>
          <div style={{ ...S.summaryValue, color: "#ef4444" }}>
            {formatINR(summary.totalCost)}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={S.tableWrap}>
        {logs.length === 0 ? (
          <div style={S.empty}>No wastage records for this period.</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Date</th>
                <th style={S.th}>Item</th>
                <th style={S.th}>Qty</th>
                <th style={S.th}>Reason</th>
                <th style={S.th}>Notes</th>
                <th style={S.th}>Staff</th>
                <th style={{ ...S.th, textAlign: "right" }}>Cost Value</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const item = itemMap[log.inventory_item_id];
                const reasonColor = REASON_COLORS[log.reason] || "var(--text-dim)";
                return (
                  <tr key={log.id}>
                    <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                      {log.created_at
                        ? new Date(log.created_at).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "--"}
                    </td>
                    <td style={S.td}>{item?.name || log.inventory_item_id}</td>
                    <td style={S.td}>
                      {log.quantity ?? "--"} {item?.unit || ""}
                    </td>
                    <td style={S.td}>
                      <span style={S.badge(reasonColor)}>
                        {log.reason || "other"}
                      </span>
                    </td>
                    <td style={{ ...S.td, color: "var(--text-muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {log.notes || "--"}
                    </td>
                    <td style={S.td}>{staffMap[log.staff_id] || log.staff_id || "--"}</td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: "#ef4444" }}>
                      {log.cost_value ? formatINR(log.cost_value) : "--"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
