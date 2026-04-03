import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { FOOD_TYPE_DISPLAY, KDS_STATUS } from "@swiftserve/shared";
import { playOrderSound } from "../utils/sound.js";
import { useAuth } from "../contexts/AuthContext.jsx";

const STATIONS = ["All", "grill", "fryer", "assembly", "counter"];

const STATION_LABELS = {
  All: "All Stations",
  grill: "Grill",
  fryer: "Fryer",
  assembly: "Assembly",
  counter: "Counter",
};

const STATUS_COLORS = {
  [KDS_STATUS.PENDING]: { bg: "rgba(245,158,11,0.18)", color: "#f59e0b", border: "#f59e0b" },
  [KDS_STATUS.PREPARING]: { bg: "rgba(59,130,246,0.18)", color: "#3b82f6", border: "#3b82f6" },
  [KDS_STATUS.READY]: { bg: "rgba(34,197,94,0.18)", color: "#22c55e", border: "#22c55e" },
};

const NEXT_STATUS = {
  [KDS_STATUS.PENDING]: KDS_STATUS.PREPARING,
  [KDS_STATUS.PREPARING]: KDS_STATUS.READY,
};

function elapsed(isoDate) {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

function elapsedMinutes(isoDate) {
  return (Date.now() - new Date(isoDate).getTime()) / 60000;
}

function elapsedColor(isoDate) {
  const mins = elapsedMinutes(isoDate);
  if (mins >= 10) return "#ef4444";
  if (mins >= 5) return "#facc15";
  return "#22c55e";
}

export default function KDSScreen({ onBack }) {
  const { staff } = useAuth();
  const staffId = staff?.id || null;

  const [orders, setOrders] = useState([]);
  const [orderItemsMap, setOrderItemsMap] = useState({});
  const [paidOrderIds, setPaidOrderIds] = useState(new Set());
  const [activeStation, setActiveStation] = useState("All");
  const [currentTime, setCurrentTime] = useState(new Date());
  const prevOrderCountRef = useRef(0);

  // Load orders and their items
  const loadData = useCallback(async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOrders = await db.orders
      .where("[outlet_id+created_at]")
      .between(
        [OUTLET_ID, todayStart.toISOString()],
        [OUTLET_ID, "\uffff"],
      )
      .filter((o) => ["received", "preparing", "ready"].includes(o.status))
      .toArray();

    // Load items for all fetched orders
    const orderIds = todayOrders.map((o) => o.id);
    const allItems = orderIds.length > 0
      ? await db.order_items
          .where("order_id")
          .anyOf(orderIds)
          .filter((item) => item.is_void !== 1)
          .toArray()
      : [];

    // Group items by order_id
    const itemsByOrder = {};
    for (const item of allItems) {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push(item);
    }

    // Query payment status for each order
    const allPayments = orderIds.length > 0
      ? await db.payments
          .where("order_id")
          .anyOf(orderIds)
          .filter((p) => p.status === "success" && !p.is_refund)
          .toArray()
      : [];
    const paidIds = new Set(allPayments.map((p) => p.order_id));

    // Play sound when new orders arrive
    const activeOrders = todayOrders.filter((o) => o.status !== "ready");
    const newCount = activeOrders.length;
    if (prevOrderCountRef.current > 0 && newCount > prevOrderCountRef.current) {
      playOrderSound();
    }
    prevOrderCountRef.current = newCount;

    setOrders(todayOrders);
    setOrderItemsMap(itemsByOrder);
    setPaidOrderIds(paidIds);
  }, []);

  // Initial load + auto-refresh every 5 seconds
  useEffect(() => {
    let cancelled = false;
    let interval;

    async function tick() {
      if (!cancelled) {
        await loadData();
        setCurrentTime(new Date());
      }
    }

    tick();
    interval = setInterval(tick, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loadData]);

  // Advance an item's KDS status
  const advanceItemStatus = useCallback(async (itemId, orderId, currentStatus) => {
    const nextStatus = NEXT_STATUS[currentStatus];
    if (!nextStatus) return;

    const now = new Date().toISOString();

    await db.transaction("rw", ["order_items", "orders", "audit_log"], async () => {
      // Update item status
      await db.order_items.update(itemId, {
        kds_status: nextStatus,
        updated_at: now,
      });

      // Audit log
      await db.audit_log.add({
        id: crypto.randomUUID(),
        outlet_id: OUTLET_ID,
        staff_id: null,
        action: "kds_status_change",
        entity_type: "order_item",
        entity_id: itemId,
        old_value: JSON.stringify({ kds_status: currentStatus }),
        new_value: JSON.stringify({ kds_status: nextStatus }),
        created_at: now,
        synced_at: null,
      });

      // If advancing to ready, check if all items in order are now ready
      if (nextStatus === KDS_STATUS.READY) {
        const siblings = await db.order_items
          .where("order_id")
          .equals(orderId)
          .filter((i) => i.is_void !== 1)
          .toArray();

        const allReady = siblings.every(
          (i) => i.id === itemId ? true : i.kds_status === KDS_STATUS.READY
        );

        if (allReady) {
          await db.orders.update(orderId, {
            status: "ready",
            ready_at: now,
            updated_at: now,
          });

          await db.audit_log.add({
            id: crypto.randomUUID(),
            outlet_id: OUTLET_ID,
            staff_id: null,
            action: "order_ready",
            entity_type: "order",
            entity_id: orderId,
            old_value: null,
            new_value: JSON.stringify({ status: "ready" }),
            created_at: now,
            synced_at: null,
          });
        }
      }
    });

    // Reload
    await loadData();
  }, [loadData]);

  // Mark cash collected for unpaid kiosk orders
  const handleCashCollected = useCallback(async (order) => {
    // Prevent duplicate payment
    const existingPayment = await db.payments.where("order_id").equals(order.id)
      .filter(p => p.status === "success" && !p.is_refund).first();
    if (existingPayment) return; // Already paid

    const now = new Date().toISOString();
    const paymentId = uuid();

    await db.transaction("rw", ["payments", "orders", "audit_log"], async () => {
      await db.payments.add({
        id: paymentId,
        outlet_id: OUTLET_ID,
        order_id: order.id,
        shift_id: null,
        method: "cash",
        amount: order.grand_total,
        status: "success",
        gateway: null,
        gateway_txn_id: null,
        gateway_order_id: null,
        upi_vpa_masked: null,
        cash_tendered: order.grand_total,
        cash_change: 0,
        is_refund: 0,
        refund_of: null,
        refund_reason: null,
        refunded_by: null,
        created_at: now,
        updated_at: now,
        synced_at: null,
        deleted_at: null,
      });

      // Don't change order status — let kitchen continue preparing
      // Just record that cash was collected (order stays in KDS flow)

      await db.audit_log.add({
        id: uuid(),
        outlet_id: OUTLET_ID,
        staff_id: staffId,
        action: "cash_collected",
        entity_type: "payment",
        entity_id: paymentId,
        old_value: null,
        new_value: JSON.stringify({ method: "cash", amount: order.grand_total, order_id: order.id }),
        created_at: now,
        synced_at: null,
      });
    });

    await loadData();
  }, [loadData, staffId]);

  // Filter items by station, then determine active vs ready orders
  const getFilteredOrders = useCallback(() => {
    const active = [];
    const ready = [];

    for (const order of orders) {
      const items = orderItemsMap[order.id] || [];
      const filteredItems = activeStation === "All"
        ? items
        : items.filter((i) => i.station === activeStation);

      if (filteredItems.length === 0) continue;

      const orderData = { ...order, items: filteredItems };

      const allReady = filteredItems.every((i) => i.kds_status === KDS_STATUS.READY);

      if (allReady) {
        ready.push(orderData);
      } else {
        active.push(orderData);
      }
    }

    // Sort active by created_at ascending (oldest first)
    active.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    // Sort ready by most recent first
    ready.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return { active, ready };
  }, [orders, orderItemsMap, activeStation]);

  const { active, ready } = getFilteredOrders();

  const activeCount = active.length;
  const readyCount = ready.length;

  return (
    <div style={styles.root}>
      {/* ---- Top Bar ---- */}
      <div style={styles.topBar}>
        <div style={styles.topLeft}>
          <button style={styles.backButton} onClick={onBack}>
            Logout
          </button>
          <span style={styles.topTitle}>Kitchen Display</span>
        </div>

        <div style={styles.stationTabs}>
          {STATIONS.map((st) => (
            <button
              key={st}
              style={{
                ...styles.stationTab,
                ...(activeStation === st ? styles.stationTabActive : {}),
              }}
              onClick={() => setActiveStation(st)}
            >
              {STATION_LABELS[st] || st}
            </button>
          ))}
        </div>

        <div style={styles.topRight}>
          <span style={styles.clock}>
            {currentTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <span style={styles.countBadge}>
            {activeCount} active
          </span>
          <span style={{ ...styles.countBadge, backgroundColor: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
            {readyCount} ready
          </span>
        </div>
      </div>

      {/* ---- Main Two-Column Layout ---- */}
      <div style={styles.mainArea}>
        {/* Active Column */}
        <div style={styles.column}>
          <div style={styles.columnHeader}>
            <span style={styles.columnTitle}>Active Orders</span>
            <span style={{ ...styles.columnCount, backgroundColor: "rgba(245,158,11,0.2)", color: "#f59e0b" }}>
              {activeCount}
            </span>
          </div>
          <div style={styles.columnBody}>
            {activeCount === 0 ? (
              <div style={styles.emptyState}>
                <span style={{ color: "var(--text-dim)", fontSize: 14 }}>
                  No active orders
                </span>
              </div>
            ) : (
              active.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onAdvance={advanceItemStatus}
                  isPaid={paidOrderIds.has(order.id)}
                  onCashCollected={handleCashCollected}
                />
              ))
            )}
          </div>
        </div>

        {/* Ready Column */}
        <div style={{ ...styles.column, borderLeft: "1px solid var(--border)" }}>
          <div style={styles.columnHeader}>
            <span style={{ ...styles.columnTitle, color: "#22c55e" }}>Ready</span>
            <span style={{ ...styles.columnCount, backgroundColor: "rgba(34,197,94,0.2)", color: "#22c55e" }}>
              {readyCount}
            </span>
          </div>
          <div style={styles.columnBody}>
            {readyCount === 0 ? (
              <div style={styles.emptyState}>
                <span style={{ color: "var(--text-dim)", fontSize: 14 }}>
                  No ready orders
                </span>
              </div>
            ) : (
              ready.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onAdvance={advanceItemStatus}
                  isReady
                  isPaid={paidOrderIds.has(order.id)}
                  onCashCollected={handleCashCollected}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Order Card Component ──────────────────────────────── */
function OrderCard({ order, onAdvance, isReady, isPaid, onCashCollected }) {
  const typeLabel = order.type === "dine_in" ? "Dine-in" : "Takeaway";
  const typeBg = order.type === "dine_in"
    ? "rgba(59,130,246,0.2)"
    : "rgba(168,85,247,0.2)";
  const typeColor = order.type === "dine_in" ? "#60a5fa" : "#c084fc";
  const timeColor = elapsedColor(order.created_at);

  const showCashCollected = !isPaid && order.source === "kiosk";

  // Determine left border color: paid=green, unpaid=red, unless isReady (always green)
  let leftBorderColor;
  if (isReady) {
    leftBorderColor = "#22c55e";
  } else if (isPaid) {
    leftBorderColor = "#22c55e";
  } else {
    leftBorderColor = "#ef4444";
  }

  return (
    <div
      style={{
        ...styles.orderCard,
        borderLeftColor: leftBorderColor,
      }}
    >
      {/* Header */}
      <div style={styles.orderCardHeader}>
        <span style={styles.orderNumber}>#{order.order_number}</span>
        {/* Paid / Unpaid badge */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            padding: "2px 8px",
            borderRadius: 4,
            backgroundColor: isPaid ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
            color: isPaid ? "#22c55e" : "#ef4444",
          }}
        >
          {isPaid ? "PAID" : "UNPAID"}
        </span>
        <span style={{ ...styles.typeBadge, backgroundColor: typeBg, color: typeColor }}>
          {typeLabel}
        </span>
        <span style={{ ...styles.elapsedTime, color: timeColor }}>
          {elapsed(order.created_at)}
        </span>
      </div>

      {/* Items */}
      <div style={styles.itemsList}>
        {order.items.map((item) => {
          const ftDisplay = FOOD_TYPE_DISPLAY[item.food_type];
          const statusStyle = STATUS_COLORS[item.kds_status] || STATUS_COLORS[KDS_STATUS.PENDING];
          const canAdvance = NEXT_STATUS[item.kds_status];

          return (
            <div key={item.id} style={styles.itemRow}>
              <div style={{ ...styles.itemInfo, flexWrap: "wrap" }}>
                {/* Food type indicator */}
                {ftDisplay && (
                  <span
                    style={{ ...styles.foodTypeIndicator, color: ftDisplay.color }}
                    title={ftDisplay.label}
                  >
                    {ftDisplay.symbol}
                  </span>
                )}

                {/* Quantity */}
                <span style={styles.itemQty}>{item.quantity}x</span>

                {/* Name */}
                <span style={styles.itemName}>{item.name}</span>

                {/* Notes — displayed on own line below the item name */}
                {item.notes && (
                  <div style={styles.itemNotes}>{item.notes}</div>
                )}
              </div>

              {/* Status button */}
              <button
                style={{
                  ...styles.statusButton,
                  backgroundColor: statusStyle.bg,
                  color: statusStyle.color,
                  borderColor: statusStyle.border,
                  cursor: canAdvance ? "pointer" : "default",
                  opacity: canAdvance ? 1 : 0.7,
                }}
                onClick={() => canAdvance && onAdvance(item.id, item.order_id, item.kds_status)}
                disabled={!canAdvance}
              >
                {item.kds_status === KDS_STATUS.PENDING && "Start"}
                {item.kds_status === KDS_STATUS.PREPARING && "Ready"}
                {item.kds_status === KDS_STATUS.READY && "\u2713 Done"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Cash Collected button for unpaid kiosk orders */}
      {showCashCollected && (
        <button
          style={styles.cashCollectedButton}
          onClick={() => onCashCollected(order)}
        >
          Cash Collected
        </button>
      )}
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────── */
const styles = {
  root: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "var(--bg-primary)",
    display: "flex",
    flexDirection: "column",
    color: "var(--text-primary)",
    fontFamily: "inherit",
  },

  /* Top Bar */
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    backgroundColor: "var(--bg-secondary)",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
    gap: 12,
    flexWrap: "wrap",
  },
  topLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  },
  backButton: {
    minHeight: 44,
    minWidth: 44,
    padding: "8px 16px",
    backgroundColor: "transparent",
    border: "1px solid var(--border-light)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  topTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
    letterSpacing: "-0.01em",
  },
  stationTabs: {
    display: "flex",
    gap: 4,
    flexWrap: "wrap",
  },
  stationTab: {
    minHeight: 44,
    padding: "8px 18px",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
    transition: "background-color 0.12s, color 0.12s",
  },
  stationTabActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
    color: "#ffffff",
  },
  topRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  clock: {
    fontSize: 14,
    color: "var(--text-muted)",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
  },
  countBadge: {
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 10px",
    borderRadius: 6,
    backgroundColor: "rgba(245,158,11,0.15)",
    color: "#f59e0b",
  },

  /* Main Area */
  mainArea: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
  },
  column: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  columnHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  columnTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#f59e0b",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  columnCount: {
    fontSize: 12,
    fontWeight: 700,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 8px",
  },
  columnBody: {
    flex: 1,
    overflowY: "auto",
    padding: 12,
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
    color: "var(--border-light)",
  },

  /* Order Card */
  orderCard: {
    backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderLeft: "4px solid #f59e0b",
    borderRadius: 10,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  orderCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  orderNumber: {
    fontSize: 48,
    fontWeight: 800,
    color: "var(--text-primary)",
    lineHeight: 1,
  },
  typeBadge: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    padding: "3px 8px",
    borderRadius: 4,
  },
  elapsedTime: {
    fontSize: 14,
    fontWeight: 700,
    marginLeft: "auto",
    fontVariantNumeric: "tabular-nums",
  },

  /* Item Row */
  itemsList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  itemRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "6px 8px",
    backgroundColor: "rgba(15,23,42,0.5)",
    borderRadius: 6,
  },
  itemInfo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  foodTypeIndicator: {
    fontSize: 14,
    flexShrink: 0,
    width: 18,
    textAlign: "center",
  },
  itemQty: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-secondary)",
    flexShrink: 0,
    minWidth: 28,
  },
  itemName: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemNotes: {
    width: "100%",
    fontSize: 12,
    color: "#fbbf24",
    fontStyle: "italic",
    paddingLeft: 54,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  /* Cash Collected Button */
  cashCollectedButton: {
    minHeight: 44,
    padding: "8px 16px",
    backgroundColor: "#22c55e",
    color: "#ffffff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
    width: "100%",
  },

  /* Status Button */
  statusButton: {
    minHeight: 44,
    minWidth: 80,
    padding: "8px 16px",
    border: "1px solid",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    touchAction: "manipulation",
    flexShrink: 0,
    transition: "opacity 0.12s",
  },
};
