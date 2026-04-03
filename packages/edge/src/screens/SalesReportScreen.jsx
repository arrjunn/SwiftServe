import { useState, useEffect, useMemo } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { formatINR } from "@swiftserve/shared";
import {
  getDateRange, getOrdersInRange, getOrderItemsForOrders, getPaymentsForOrders,
  aggregateSalesByCategory, aggregateSalesByItem, aggregateSalesByHour, aggregateSalesByPaymentMethod,
} from "../db/reportOps.js";

function exportCSV(tab, data) {
  let rows = [];
  let filename = `sales_${data.preset}_${tab.toLowerCase()}.csv`;

  if (tab === "Category") {
    rows = [["Category", "Quantity", "Revenue (₹)"]];
    data.byCategory.forEach((c) => rows.push([c.name, c.qty, (c.revenue / 100).toFixed(2)]));
  } else if (tab === "Item") {
    rows = [["Item", "Quantity", "Revenue (₹)"]];
    data.byItem.forEach((it) => rows.push([it.name, it.qty, (it.revenue / 100).toFixed(2)]));
  } else if (tab === "Hour") {
    rows = [["Hour", "Orders", "Revenue (₹)"]];
    data.byHour.filter((h) => h.count > 0).forEach((h) =>
      rows.push([`${String(h.hour).padStart(2, "0")}:00`, h.count, (h.revenue / 100).toFixed(2)]));
  } else if (tab === "Payment") {
    rows = [["Method", "Transactions", "Total (₹)"]];
    data.byPayment.forEach((p) => rows.push([p.method, p.count, (p.total / 100).toFixed(2)]));
  }

  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const PRESETS = ["today", "yesterday", "thisWeek", "thisMonth"];
const TABS = ["Category", "Item", "Hour", "Payment"];

export default function SalesReportScreen({ onBack }) {
  const [preset, setPreset] = useState("today");
  const [activeTab, setActiveTab] = useState("Category");
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { start, end } = getDateRange(preset);
      const ords = await getOrdersInRange(start, end);
      const ids = ords.map((o) => o.id);
      const itms = await getOrderItemsForOrders(ids);
      const pays = await getPaymentsForOrders(ids);
      const cats = await db.menu_categories.where("outlet_id").equals(OUTLET_ID).toArray();
      // Enrich order_items with category_id from menu_items
      const menuItemIds = [...new Set(itms.map((i) => i.menu_item_id).filter(Boolean))];
      const menuItems = menuItemIds.length > 0 ? await db.menu_items.where("id").anyOf(menuItemIds).toArray() : [];
      const catLookup = {};
      menuItems.forEach((m) => { catLookup[m.id] = m.category_id; });
      const enrichedItems = itms.map((i) => ({ ...i, category_id: catLookup[i.menu_item_id] || null }));
      setOrders(ords);
      setItems(enrichedItems);
      setPayments(pays);
      setCategories(cats);
      setLoading(false);
    }
    load();
  }, [preset]);

  const totalRevenue = useMemo(() => orders.reduce((s, o) => s + (o.grand_total || 0), 0), [orders]);
  const avgOrder = orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0;

  const byCategory = useMemo(() => aggregateSalesByCategory(items, categories), [items, categories]);
  const byItem = useMemo(() => aggregateSalesByItem(items), [items]);
  const byHour = useMemo(() => aggregateSalesByHour(orders), [orders]);
  const byPayment = useMemo(() => aggregateSalesByPaymentMethod(payments), [payments]);

  const maxRevenue = (data, key = "revenue") => Math.max(...data.map((d) => d[key] || d.total || 0), 1);

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <h1 style={styles.title}>Sales Report</h1>

        {/* Date Presets */}
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
            {/* Summary Cards */}
            <div style={styles.summaryRow}>
              <div style={styles.summaryCard}>
                <span style={styles.sumLabel}>Revenue</span>
                <span style={styles.sumValue}>{formatINR(totalRevenue)}</span>
              </div>
              <div style={styles.summaryCard}>
                <span style={styles.sumLabel}>Orders</span>
                <span style={styles.sumValue}>{orders.length}</span>
              </div>
              <div style={styles.summaryCard}>
                <span style={styles.sumLabel}>Avg Order</span>
                <span style={styles.sumValue}>{formatINR(avgOrder)}</span>
              </div>
            </div>

            {/* Tabs */}
            <div style={styles.tabs}>
              {TABS.map((t) => (
                <button key={t} style={{ ...styles.tab, ...(activeTab === t ? styles.tabActive : {}) }}
                  onClick={() => setActiveTab(t)}>{t}</button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={styles.tabContent}>
              {activeTab === "Category" && byCategory.map((c) => (
                <BarRow key={c.categoryId} label={c.name} value={formatINR(c.revenue)}
                  sub={`${c.qty} items`} pct={c.revenue / maxRevenue(byCategory)} />
              ))}

              {activeTab === "Item" && byItem.map((it, i) => (
                <BarRow key={i} label={it.name} value={formatINR(it.revenue)}
                  sub={`x${it.qty}`} pct={it.revenue / maxRevenue(byItem)} />
              ))}

              {activeTab === "Hour" && byHour.filter((h) => h.count > 0).map((h) => (
                <BarRow key={h.hour} label={`${String(h.hour).padStart(2, "0")}:00`}
                  value={formatINR(h.revenue)} sub={`${h.count} orders`}
                  pct={h.revenue / maxRevenue(byHour)} />
              ))}

              {activeTab === "Payment" && byPayment.map((p) => (
                <BarRow key={p.method} label={p.method.toUpperCase()} value={formatINR(p.total)}
                  sub={`${p.count} txns`} pct={p.total / maxRevenue(byPayment, "total")} />
              ))}

              {((activeTab === "Category" && byCategory.length === 0) ||
                (activeTab === "Item" && byItem.length === 0) ||
                (activeTab === "Hour" && byHour.every((h) => h.count === 0)) ||
                (activeTab === "Payment" && byPayment.length === 0)) && (
                <div style={styles.empty}>No data for this period.</div>
              )}
            </div>
          </>
        )}

        {!loading && orders.length > 0 && (
          <button style={styles.exportBtn} onClick={() => exportCSV(activeTab, { byCategory, byItem, byHour, byPayment, orders, preset })}>
            Export CSV
          </button>
        )}

        <button style={styles.backBtn} onClick={onBack}>&#8592; Back</button>
      </div>
    </div>
  );
}

function BarRow({ label, value, sub, pct }) {
  return (
    <div style={styles.barRow}>
      <div style={styles.barInfo}>
        <span style={styles.barLabel}>{label}</span>
        <span style={styles.barValue}>{value}</span>
      </div>
      <div style={styles.barTrack}>
        <div style={{ ...styles.barFill, width: `${Math.max(pct * 100, 2)}%` }} />
      </div>
      <span style={styles.barSub}>{sub}</span>
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
    maxWidth: 600, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", display: "flex",
    flexDirection: "column", margin: "20px 0",
  },
  title: { color: "var(--text-primary)", fontSize: 22, fontWeight: 700, margin: "0 0 16px 0", textAlign: "center" },
  presets: { display: "flex", gap: 6, marginBottom: 16 },
  presetBtn: {
    flex: 1, minHeight: 44, padding: "8px 8px", backgroundColor: "transparent",
    border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)", fontSize: 13,
    fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  presetActive: { borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  loadingText: { color: "var(--text-muted)", textAlign: "center", padding: 32 },
  summaryRow: { display: "flex", gap: 8, marginBottom: 16 },
  summaryCard: {
    flex: 1, backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10,
    padding: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
  },
  sumLabel: { fontSize: 11, color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase" },
  sumValue: { fontSize: 18, fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" },
  tabs: { display: "flex", gap: 4, marginBottom: 12 },
  tab: {
    flex: 1, minHeight: 44, padding: "8px 8px", backgroundColor: "transparent",
    border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", fontSize: 13,
    fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  tabActive: { borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  tabContent: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" },
  barRow: { display: "flex", flexDirection: "column", gap: 3 },
  barInfo: { display: "flex", justifyContent: "space-between", fontSize: 13 },
  barLabel: { color: "var(--text-secondary)", fontWeight: 500 },
  barValue: { color: "#38bdf8", fontWeight: 700, fontFamily: "monospace" },
  barTrack: { height: 6, backgroundColor: "var(--border)", borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: "#3b82f6", borderRadius: 3 },
  barSub: { fontSize: 11, color: "var(--text-dim)" },
  empty: { color: "var(--text-muted)", textAlign: "center", padding: 24 },
  exportBtn: {
    marginTop: 12, width: "100%", minHeight: 48, padding: "10px 24px",
    backgroundColor: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
    borderRadius: 10, color: "#4ade80", fontSize: 14, fontWeight: 700,
    cursor: "pointer", touchAction: "manipulation",
  },
  backBtn: {
    marginTop: 12, width: "100%", minHeight: 48, padding: "10px 24px",
    backgroundColor: "transparent", border: "1px solid var(--border)", borderRadius: 10,
    color: "var(--text-muted)", fontSize: 15, fontWeight: 600, cursor: "pointer",
    touchAction: "manipulation",
  },
};
