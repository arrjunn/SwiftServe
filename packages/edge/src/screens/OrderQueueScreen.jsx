import { useState, useEffect, useRef } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { formatINR } from "@swiftserve/shared";
import { playOrderSound } from "../utils/sound.js";

const CHANNELS = ["All", "Counter", "Zomato", "Swiggy", "Cancelled"];

const STATUS_COLORS = {
  received:  { bg: "rgba(59,130,246,0.18)", color: "#60a5fa" },
  preparing: { bg: "rgba(234,179,8,0.18)",  color: "#facc15" },
  ready:     { bg: "rgba(34,197,94,0.18)",   color: "#4ade80" },
  completed: { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" },
  held:      { bg: "rgba(168,85,247,0.18)",  color: "#c084fc" },
  cancelled: { bg: "rgba(239,68,68,0.15)",   color: "#f87171" },
};

const SOURCE_COLORS = {
  counter: { bg: "rgba(59,130,246,0.2)", color: "#60a5fa" },
  zomato:  { bg: "rgba(239,68,68,0.2)",  color: "#f87171" },
  swiggy:  { bg: "rgba(249,115,22,0.2)", color: "#fb923c" },
};

function elapsed(isoDate) {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

export default function OrderQueueScreen({ onNewOrder, onLogout, onCloseShift, onHeldOrders, onCancelOrder, onModifyOrder, onViewOrder, onRefundOrder, onReorder, onAdmin, onQuickReorder, onTableTimeline, onTableManagement }) {
  const { staff, logout } = useAuth();
  const [orders, setOrders] = useState([]);
  const prevOrderCountRef = useRef(0);
  const [stats, setStats] = useState({ total: 0, paidCount: 0, revenue: 0, heldCount: 0, cancelledCount: 0 });
  const [customerMap, setCustomerMap] = useState({});
  const [activeChannel, setActiveChannel] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [online, setOnline] = useState(navigator.onLine);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [lowStockDismissed, setLowStockDismissed] = useState(false);

  // Load low stock items
  useEffect(() => {
    let cancelled = false;

    async function checkLowStock() {
      try {
        const items = await db.inventory_items
          .where("is_active")
          .equals(1)
          .toArray();
        if (cancelled) return;
        const low = items.filter((item) => item.current_stock <= item.min_stock);
        setLowStockItems(low);
      } catch (e) {
        // inventory_items table may not exist yet
      }
    }

    checkLowStock();
    const interval = setInterval(checkLowStock, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Load orders
  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayOrders = await db.orders
        .where("[outlet_id+created_at]")
        .between(
          [OUTLET_ID, todayStart.toISOString()],
          [OUTLET_ID, "\uffff"],
        )
        .reverse()
        .toArray();

      if (cancelled) return;

      // Play sound on new orders
      if (todayOrders.length > prevOrderCountRef.current && prevOrderCountRef.current > 0) {
        playOrderSound();
      }
      prevOrderCountRef.current = todayOrders.length;

      setOrders(todayOrders);

      // Load customer names for linked orders
      const custIds = [...new Set(todayOrders.map(o => o.customer_id).filter(Boolean))];
      if (custIds.length > 0) {
        const custs = await db.customers.where("id").anyOf(custIds).toArray();
        const cm = {};
        custs.forEach(c => { cm[c.id] = c.name || ("****" + (c.phone || "").slice(-4)); });
        setCustomerMap(cm);
      }

      // Revenue = only completed (paid) orders — not pending/preparing/held/cancelled
      const paidOrders = todayOrders.filter((o) => o.status === "completed");
      const heldCount = todayOrders.filter((o) => o.status === "held").length;
      const cancelledCount = todayOrders.filter((o) => o.status === "cancelled").length;
      setStats({
        total: todayOrders.length,
        paidCount: paidOrders.length,
        revenue: paidOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0),
        heldCount,
        cancelledCount,
      });
    }

    loadOrders();

    // Refresh every 15 seconds
    const interval = setInterval(loadOrders, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Clock tick every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      // Don't fire if user is typing in an input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "F1") { e.preventDefault(); onNewOrder(); }
      if (e.key === "F2") { e.preventDefault(); document.querySelector("[data-search-orders]")?.focus(); }
      if (e.key === "Escape") { setSearchQuery(""); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onNewOrder]);

  // Online status
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Filter by channel — "Cancelled" tab shows only cancelled; other tabs hide cancelled
  const channelFiltered = activeChannel === "Cancelled"
    ? orders.filter((o) => o.status === "cancelled")
    : activeChannel === "All"
      ? orders.filter((o) => o.status !== "cancelled")
      : orders.filter((o) => (o.source || "counter").toLowerCase() === activeChannel.toLowerCase() && o.status !== "cancelled");

  // Apply search filter
  const filtered = searchQuery.trim()
    ? channelFiltered.filter((o) => String(o.order_number).includes(searchQuery.trim()))
    : channelFiltered;

  const avgOrderValue = stats.paidCount > 0
    ? Math.round(stats.revenue / stats.paidCount)
    : 0;

  const handleLogout = () => {
    if (!window.confirm("Log out? You will need to enter your PIN again.")) return;
    logout();
    if (onLogout) onLogout();
  };

  return (
    <div style={styles.root}>
      {/* ─── Offline Banner ──────────────────────────── */}
      {!online && (
        <div style={styles.offlineBanner}>
          No internet — orders saved locally, will sync when connection restores
        </div>
      )}
      {/* ─── Top Bar ────────────────────────────────── */}
      <div style={styles.topBar}>
        <span style={styles.topTitle}>SwiftServe &middot; Order Queue</span>

        <div style={styles.topRight}>
          <span style={styles.onlineDot(online)} />
          <span style={{ color: online ? "#4ade80" : "#f87171", fontSize: 13 }}>
            {online ? "Online" : "Offline"}
          </span>

          <span style={styles.clock}>
            {currentTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </span>

          {staff && (
            <span style={styles.staffBadge}>
              {staff.name}
              <span style={styles.roleBadge}>{staff.role}</span>
            </span>
          )}

          {(staff?.role === "owner" || staff?.role === "admin") && onAdmin && (
            <button style={styles.adminButton} onClick={onAdmin}>
              Admin Panel
            </button>
          )}

          <button style={styles.logoutButton} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      {/* ─── Main Area ──────────────────────────────── */}
      <div style={styles.mainArea}>
        {/* Orders Column */}
        <div style={styles.ordersColumn}>
          {/* Search + Channel Tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", borderBottom: "1px solid var(--border)" }}>
            <input
              data-search-orders
              type="text"
              placeholder="Search order #... (F2)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: 140, height: 36, padding: "0 10px", backgroundColor: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
            {searchQuery && <button style={{ height: 36, padding: "0 10px", backgroundColor: "transparent", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }} onClick={() => setSearchQuery("")}>Clear</button>}
          </div>
          <div style={styles.channelTabs}>
            {CHANNELS.map((ch) => {
              const isCancelled = ch === "Cancelled";
              const isActive = activeChannel === ch;
              return (
                <button
                  key={ch}
                  style={{
                    ...styles.channelTab,
                    ...(isActive
                      ? isCancelled ? styles.channelTabCancelled : styles.channelTabActive
                      : {}),
                    ...(isCancelled && !isActive ? { borderColor: "rgba(239,68,68,0.4)", color: "#f87171" } : {}),
                  }}
                  onClick={() => setActiveChannel(ch)}
                >
                  {ch}
                  {isCancelled && stats.cancelledCount > 0 && (
                    <span style={styles.cancelledBadge}>{stats.cancelledCount}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Low Stock Banner */}
          {lowStockItems.length > 0 && !lowStockDismissed && (
            <div style={styles.lowStockBanner}>
              <span style={styles.lowStockText}>
                Low stock:{" "}
                {lowStockItems.slice(0, 3).map((item) => item.name).join(", ")}
                {lowStockItems.length > 3 && ` +${lowStockItems.length - 3} more`}
              </span>
              <button
                style={styles.lowStockDismiss}
                onClick={() => setLowStockDismissed(true)}
              >
                X
              </button>
            </div>
          )}

          {/* Order Cards */}
          <div style={styles.orderList}>
            {filtered.length === 0 ? (
              <div style={styles.emptyState}>
                <span style={{ color: "var(--text-muted)", fontSize: 15 }}>
                  No orders yet. Tap "+ New Order" to get started.
                </span>
              </div>
            ) : (
              filtered.map((order) => {
                const srcStyle = SOURCE_COLORS[order.source] || SOURCE_COLORS.counter;
                const statusStyle = STATUS_COLORS[order.status] || STATUS_COLORS.received;
                const isCaptain = staff?.role === "captain";
                const canModify = !isCaptain && ["received", "preparing"].includes(order.status);
                const canCancel = !isCaptain && ["received", "preparing", "ready", "held"].includes(order.status);

                const isViewable = ["cancelled", "completed"].includes(order.status);

                return (
                  <div
                    key={order.id}
                    style={styles.orderCard}
                    onClick={() => isViewable && onViewOrder?.(order.id)}
                  >
                    <div style={styles.orderCardTop}>
                      <span style={styles.orderNumber}>#{order.order_number}</span>

                      <span style={{
                        ...styles.badge,
                        backgroundColor: srcStyle.bg,
                        color: srcStyle.color,
                      }}>
                        {order.source}
                      </span>

                      <span style={{
                        ...styles.badge,
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.color,
                      }}>
                        {order.status}
                      </span>

                      <span style={styles.elapsed}>{elapsed(order.created_at)}</span>
                    </div>

                    <div style={styles.orderCardBottom}>
                      <span style={styles.orderMeta}>
                        {order.type === "dine_in" ? "Dine-in" : "Takeaway"}
                        {order.customer_id && customerMap[order.customer_id] && (
                          <span style={styles.customerTag}> &middot; {customerMap[order.customer_id]}</span>
                        )}
                      </span>
                      <span style={styles.grandTotal}>{formatINR(order.grand_total)}</span>
                    </div>

                    {/* Action buttons */}
                    {(canModify || canCancel) && (
                      <div style={styles.orderActions}>
                        {canModify && (
                          <button
                            style={styles.actionBtn}
                            onClick={(e) => { e.stopPropagation(); onModifyOrder(order.id); }}
                          >
                            Modify
                          </button>
                        )}
                        {canCancel && (
                          <button
                            style={styles.actionBtnDanger}
                            onClick={(e) => { e.stopPropagation(); onCancelOrder(order.id); }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}

                    {/* View details for cancelled/completed */}
                    {isViewable && (
                      <div style={styles.orderActions}>
                        <button
                          style={styles.actionBtn}
                          onClick={(e) => { e.stopPropagation(); onViewOrder?.(order.id); }}
                        >
                          View Details
                        </button>
                        {order.status === "completed" && onReorder && (
                          <button
                            style={styles.actionBtnReorder}
                            onClick={(e) => { e.stopPropagation(); onReorder(order.id); }}
                          >
                            Reorder
                          </button>
                        )}
                        {order.status === "completed" && onRefundOrder && !isCaptain && (
                          <button
                            style={styles.actionBtnDanger}
                            onClick={(e) => { e.stopPropagation(); onRefundOrder(order.id); }}
                          >
                            Refund
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div style={styles.sidebar}>
          <h3 style={styles.sidebarTitle}>Today's Summary</h3>

          <div style={styles.statCard}>
            <span style={styles.statLabel}>Total Orders</span>
            <span style={styles.statValue}>{stats.total}</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>Revenue</span>
            <span style={styles.statValue}>{formatINR(stats.revenue)}</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>Avg Order Value</span>
            <span style={styles.statValue}>{formatINR(avgOrderValue)}</span>
          </div>

          {/* Held Orders button */}
          <button style={styles.heldOrdersButton} onClick={onHeldOrders}>
            Held Orders
            {stats.heldCount > 0 && (
              <span style={styles.heldBadge}>{stats.heldCount}</span>
            )}
          </button>

          {onQuickReorder && (
            <button style={styles.quickReorderBtn} onClick={onQuickReorder}>
              Quick Reorder
            </button>
          )}

          {onTableTimeline && (
            <button style={styles.tableTimelineBtn} onClick={onTableTimeline}>
              Table Map
            </button>
          )}

          {onTableManagement && (
            <button style={styles.tableManageBtn} onClick={onTableManagement}>
              Manage Tables
            </button>
          )}

          <button
            style={styles.newOrderButton}
            onClick={onNewOrder}
          >
            + New Order
          </button>

          {/* Close Shift button — only for cash-handling roles */}
          {staff?.role !== "kitchen" && staff?.role !== "captain" && (
            <button style={styles.closeShiftButton} onClick={onCloseShift}>
              Close Shift
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  offlineBanner: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderBottom: "1px solid rgba(239,68,68,0.3)",
    color: "#fca5a5",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "center",
    padding: "8px 16px",
    flexShrink: 0,
  },
  root: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "var(--bg-primary)",
    display: "flex",
    flexDirection: "column",
    color: "var(--text-primary)",
    fontFamily: "inherit",
  },

  /* ── Top Bar ─────────────────────────── */
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 20px",
    backgroundColor: "var(--bg-secondary)",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  topTitle: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    color: "var(--text-primary)",
  },
  topRight: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  onlineDot: (on) => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: on ? "#4ade80" : "#f87171",
    flexShrink: 0,
  }),
  clock: {
    fontSize: 13,
    color: "var(--text-muted)",
    fontVariantNumeric: "tabular-nums",
  },
  staffBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 14,
    color: "var(--text-secondary)",
  },
  roleBadge: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    backgroundColor: "rgba(99,102,241,0.2)",
    color: "#a5b4fc",
    padding: "2px 8px",
    borderRadius: 4,
  },
  adminButton: {
    minHeight: 36,
    padding: "6px 16px",
    backgroundColor: "rgba(99,102,241,0.15)",
    border: "1px solid rgba(99,102,241,0.3)",
    borderRadius: 8,
    color: "#a5b4fc",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
    display: "flex",
    alignItems: "center",
    gap: 6,
    letterSpacing: 0.3,
  },
  logoutButton: {
    minHeight: 36,
    minWidth: 44,
    padding: "6px 16px",
    backgroundColor: "transparent",
    border: "1px solid var(--border-light)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },

  /* ── Main Area ───────────────────────── */
  mainArea: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
  },
  ordersColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },

  /* ── Channel Tabs ────────────────────── */
  channelTabs: {
    display: "flex",
    gap: 4,
    padding: "12px 20px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  channelTab: {
    minHeight: 40,
    padding: "8px 20px",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
    transition: "background-color 0.12s, color 0.12s",
  },
  channelTabActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
    color: "#ffffff",
  },
  channelTabCancelled: {
    backgroundColor: "#dc2626",
    borderColor: "#dc2626",
    color: "#ffffff",
  },
  cancelledBadge: {
    marginLeft: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 5px",
  },

  /* ── Low Stock Banner ───────────────── */
  lowStockBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 36,
    padding: "0 20px",
    backgroundColor: "rgba(251,191,36,0.1)",
    border: "1px solid rgba(251,191,36,0.4)",
    borderLeft: "none",
    borderRight: "none",
    flexShrink: 0,
  },
  lowStockText: {
    fontSize: 13,
    fontWeight: 600,
    color: "#f59e0b",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  lowStockDismiss: {
    width: 24,
    height: 24,
    backgroundColor: "transparent",
    border: "none",
    color: "#f59e0b",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    touchAction: "manipulation",
  },

  /* ── Order List ──────────────────────── */
  orderList: {
    flex: 1,
    overflowY: "auto",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-dim)",
  },
  orderCard: {
    backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    cursor: "pointer",
    touchAction: "manipulation",
    transition: "border-color 0.12s",
  },
  orderCardTop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
    minWidth: 48,
  },
  badge: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: "capitalize",
    padding: "3px 10px",
    borderRadius: 6,
  },
  elapsed: {
    marginLeft: "auto",
    fontSize: 13,
    color: "var(--text-muted)",
    fontVariantNumeric: "tabular-nums",
  },
  orderCardBottom: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  orderMeta: {
    fontSize: 13,
    color: "var(--text-dim)",
  },
  grandTotal: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  customerTag: {
    color: "#4ade80",
    fontWeight: 600,
  },

  /* ── Sidebar ─────────────────────────── */
  sidebar: {
    width: 240,
    flexShrink: 0,
    backgroundColor: "var(--bg-secondary)",
    borderLeft: "1px solid var(--border)",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    overflowY: "auto",
  },
  sidebarTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    margin: 0,
  },
  statCard: {
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "var(--text-dim)",
    fontWeight: 600,
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
    color: "var(--text-primary)",
    fontVariantNumeric: "tabular-nums",
  },
  newOrderButton: {
    minHeight: 56,
    backgroundColor: "#3b82f6",
    border: "none",
    borderRadius: 12,
    color: "#ffffff",
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
    transition: "background-color 0.12s, transform 0.08s",
    WebkitTapHighlightColor: "transparent",
  },
  heldOrdersButton: {
    marginTop: "auto",
    minHeight: 44,
    backgroundColor: "transparent",
    border: "1px solid #7c3aed",
    borderRadius: 10,
    color: "#c084fc",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    position: "relative",
  },
  heldBadge: {
    backgroundColor: "#7c3aed",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 6px",
  },
  closeShiftButton: {
    minHeight: 44,
    backgroundColor: "transparent",
    border: "1px solid var(--border-light)",
    borderRadius: 10,
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  quickReorderBtn: {
    minHeight: 44,
    backgroundColor: "transparent",
    border: "1px solid rgba(56,189,248,0.4)",
    borderRadius: 10,
    color: "#38bdf8",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  tableTimelineBtn: {
    minHeight: 44,
    backgroundColor: "transparent",
    border: "1px solid rgba(251,146,60,0.4)",
    borderRadius: 10,
    color: "#fb923c",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  tableManageBtn: {
    minHeight: 44,
    backgroundColor: "transparent",
    border: "1px solid rgba(244,114,182,0.4)",
    borderRadius: 10,
    color: "#f472b6",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },

  /* ── Order Card Actions ──────────────── */
  orderActions: {
    display: "flex",
    gap: 8,
    borderTop: "1px solid var(--border)",
    paddingTop: 10,
  },
  actionBtn: {
    minHeight: 36,
    padding: "4px 16px",
    backgroundColor: "transparent",
    border: "1px solid var(--border-light)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  actionBtnReorder: {
    minHeight: 36,
    padding: "4px 16px",
    backgroundColor: "rgba(59,130,246,0.1)",
    border: "1px solid rgba(59,130,246,0.4)",
    borderRadius: 8,
    color: "#60a5fa",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  actionBtnDanger: {
    minHeight: 36,
    padding: "4px 16px",
    backgroundColor: "transparent",
    border: "1px solid rgba(239,68,68,0.4)",
    borderRadius: 8,
    color: "#f87171",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
};
