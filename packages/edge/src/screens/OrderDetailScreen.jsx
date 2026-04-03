import { useState, useEffect } from "react";
import { db } from "../db/index.js";
import { formatINR } from "@swiftserve/shared";

const KDS_STYLES = {
  pending: {
    label: "Queued",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    message: (item) => `Waiting to start — ${item.station || "kitchen"} station`,
  },
  preparing: {
    label: "Cooking",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.12)",
    message: (item) => {
      const station = item.station || "kitchen";
      const stationMsg = { grill: "On the grill right now", fryer: "Frying fresh for you", assembly: "Being assembled", counter: "Being prepared at counter" };
      return stationMsg[station] || `Being prepared at ${station}`;
    },
  },
  ready: {
    label: "Ready",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.12)",
    message: () => "Done — ready to serve!",
  },
};

const STATUS_COLORS = {
  received:  { bg: "rgba(59,130,246,0.18)", color: "#60a5fa" },
  preparing: { bg: "rgba(234,179,8,0.18)",  color: "#facc15" },
  ready:     { bg: "rgba(34,197,94,0.18)",   color: "#4ade80" },
  completed: { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" },
  held:      { bg: "rgba(168,85,247,0.18)",  color: "#c084fc" },
  cancelled: { bg: "rgba(239,68,68,0.15)",   color: "#f87171" },
};

export default function OrderDetailScreen({ orderId, onBack, onRefund }) {
  const [order, setOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [payment, setPayment] = useState(null);
  const [cancelledByName, setCancelledByName] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const o = await db.orders.get(orderId);
        const items = await db.order_items
          .where("order_id").equals(orderId)
          .toArray();
        const payments = await db.payments
          .where("order_id").equals(orderId)
          .toArray();

        setOrder(o);
        setOrderItems(items);
        if (payments.length > 0) setPayment(payments[0]);

        if (o?.cancelled_by) {
          const staff = await db.staff.get(o.cancelled_by);
          if (staff) setCancelledByName(staff.name);
        }
      } catch (err) {
        console.error("[ORDER_DETAIL] Load failed:", err);
      } finally {
        setLoading(false);
      }
    }
    if (orderId) load();
    // Auto-refresh every 5s to get live KDS updates
    const interval = setInterval(() => { if (orderId) load(); }, 5000);
    return () => clearInterval(interval);
  }, [orderId]);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingText}>Loading order...</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingText}>Order not found.</div>
        <button style={styles.backBtn} onClick={onBack}>← Back</button>
      </div>
    );
  }

  const statusStyle = STATUS_COLORS[order.status] || STATUS_COLORS.received;
  const activeItems = orderItems.filter((i) => !i.is_void);
  const voidedItems = orderItems.filter((i) => i.is_void);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Order #{order.order_number}</h1>
          <span style={{
            ...styles.statusBadge,
            backgroundColor: statusStyle.bg,
            color: statusStyle.color,
          }}>
            {order.status}
          </span>
        </div>

        {/* Order Info */}
        <div style={styles.infoGrid}>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>Type</span>
            <span style={styles.infoValue}>
              {order.type === "dine_in" ? "Dine-in" : "Takeaway"}
            </span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>Source</span>
            <span style={styles.infoValue}>{order.source || "Counter"}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>Created</span>
            <span style={styles.infoValue}>
              {new Date(order.created_at).toLocaleString("en-IN", {
                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
              })}
            </span>
          </div>
          {payment && (
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Payment</span>
              <span style={styles.infoValue}>{payment.method?.toUpperCase()}</span>
            </div>
          )}
        </div>

        <div style={styles.divider} />

        {/* Live Kitchen Status */}
        <p style={styles.sectionTitle}>Order Progress</p>
        <div style={styles.itemList}>
          {activeItems.map((item) => {
            const kds = item.kds_status || "pending";
            const kdsStyle = KDS_STYLES[kds] || KDS_STYLES.pending;
            return (
              <div key={item.id} style={{ ...styles.itemRow, borderLeft: `3px solid ${kdsStyle.color}`, paddingLeft: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={styles.foodDot(item.food_type)} />
                    <span style={styles.itemName}>{item.name}</span>
                    <span style={styles.itemQty}>x{item.quantity}</span>
                  </div>
                  <div style={{ fontSize: 12, color: kdsStyle.color, fontWeight: 500, marginTop: 3 }}>
                    {kdsStyle.message(item)}
                  </div>
                </div>
                <div style={{ ...styles.kdsBadge, backgroundColor: kdsStyle.bg, color: kdsStyle.color }}>
                  {kdsStyle.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Overall estimate */}
        {order.status !== "completed" && order.status !== "cancelled" && (
          <div style={styles.estimateBox}>
            {activeItems.every(i => i.kds_status === "ready")
              ? "All items ready — order can be served!"
              : activeItems.some(i => i.kds_status === "preparing")
                ? `Preparing — estimated ${Math.max(...activeItems.filter(i => i.kds_status !== "ready").map(i => i.prep_time_mins || 5))} min remaining`
                : `In queue — estimated ${activeItems.reduce((max, i) => Math.max(max, i.prep_time_mins || 5), 0)} min total`
            }
          </div>
        )}

        {voidedItems.length > 0 && (
          <>
            <p style={{ ...styles.sectionTitle, color: "#f87171", marginTop: 12 }}>
              Voided Items
            </p>
            <div style={styles.itemList}>
              {voidedItems.map((item) => (
                <div key={item.id} style={{ ...styles.itemRow, opacity: 0.5, textDecoration: "line-through" }}>
                  <span style={styles.foodDot(item.food_type)} />
                  <span style={styles.itemName}>{item.name}</span>
                  <span style={styles.itemQty}>x{item.quantity}</span>
                  <span style={styles.itemPrice}>{formatINR(item.line_total)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={styles.divider} />

        {/* Totals */}
        <div style={styles.totalsSection}>
          <div style={styles.totalRow}>
            <span>Subtotal</span>
            <span>{formatINR(order.subtotal)}</span>
          </div>
          {order.cgst > 0 && (
            <div style={styles.totalRow}>
              <span>CGST</span>
              <span>{formatINR(order.cgst)}</span>
            </div>
          )}
          {order.sgst > 0 && (
            <div style={styles.totalRow}>
              <span>SGST</span>
              <span>{formatINR(order.sgst)}</span>
            </div>
          )}
          {order.discount_amount > 0 && (
            <div style={{ ...styles.totalRow, color: "#4ade80" }}>
              <span>Discount</span>
              <span>-{formatINR(order.discount_amount)}</span>
            </div>
          )}
          {order.round_off !== 0 && order.round_off != null && (
            <div style={styles.totalRow}>
              <span>Round-off</span>
              <span>{formatINR(order.round_off)}</span>
            </div>
          )}
          <div style={styles.grandTotalRow}>
            <span>Grand Total</span>
            <span>{formatINR(order.grand_total)}</span>
          </div>
        </div>

        {/* Cancellation Info */}
        {order.status === "cancelled" && (
          <>
            <div style={styles.divider} />
            <div style={styles.cancelBox}>
              <p style={styles.cancelTitle}>Cancellation Details</p>
              {order.cancel_reason && (
                <div style={styles.cancelRow}>
                  <span style={styles.cancelLabel}>Reason</span>
                  <span style={styles.cancelValue}>{order.cancel_reason}</span>
                </div>
              )}
              {order.cancelled_at && (
                <div style={styles.cancelRow}>
                  <span style={styles.cancelLabel}>Cancelled At</span>
                  <span style={styles.cancelValue}>
                    {new Date(order.cancelled_at).toLocaleString("en-IN", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
              {cancelledByName && (
                <div style={styles.cancelRow}>
                  <span style={styles.cancelLabel}>Cancelled By</span>
                  <span style={styles.cancelValue}>{cancelledByName}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Discount Info */}
        {order.discount_reason && (
          <>
            <div style={styles.divider} />
            <div style={styles.cancelRow}>
              <span style={styles.cancelLabel}>Discount Reason</span>
              <span style={styles.cancelValue}>{order.discount_reason}</span>
            </div>
          </>
        )}

        {order.status === "completed" && onRefund && (
          <button
            style={styles.refundBtn}
            onClick={() => onRefund(order.id)}
          >
            Process Refund
          </button>
        )}

        <button style={styles.backBtn} onClick={onBack}>
          ← Back to Orders
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "var(--bg-primary)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    padding: "24px 16px",
    overflowY: "auto",
    color: "var(--text-primary)",
  },
  loadingText: {
    color: "var(--text-muted)",
    fontSize: 16,
    textAlign: "center",
    padding: 32,
  },
  card: {
    backgroundColor: "var(--bg-secondary)",
    borderRadius: 16,
    padding: 28,
    width: "100%",
    maxWidth: 520,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    color: "var(--text-primary)",
    fontSize: 22,
    fontWeight: 700,
    margin: 0,
  },
  statusBadge: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: "capitalize",
    padding: "4px 12px",
    borderRadius: 6,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  infoItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  infoLabel: {
    fontSize: 12,
    color: "var(--text-dim)",
    fontWeight: 600,
    textTransform: "uppercase",
  },
  infoValue: {
    fontSize: 14,
    color: "var(--text-secondary)",
    fontWeight: 500,
    textTransform: "capitalize",
  },
  divider: {
    width: "100%",
    borderTop: "1px dashed var(--border)",
    margin: "16px 0",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    margin: "0 0 8px 0",
  },
  itemList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    maxHeight: 200,
    overflowY: "auto",
  },
  itemRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 0",
    fontSize: 14,
    color: "#cbd5e1",
  },
  foodDot: (type) => ({
    width: 10,
    height: 10,
    borderRadius: 2,
    border: `2px solid ${type === "veg" ? "#22c55e" : "#ef4444"}`,
    flexShrink: 0,
  }),
  itemName: {
    flex: 1,
  },
  itemQty: {
    color: "var(--text-muted)",
    minWidth: 30,
    textAlign: "center",
  },
  itemPrice: {
    fontFamily: "monospace",
    fontWeight: 600,
    minWidth: 70,
    textAlign: "right",
  },
  kdsBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flexShrink: 0,
  },
  estimateBox: {
    marginTop: 12,
    padding: "12px 16px",
    backgroundColor: "rgba(56,189,248,0.08)",
    border: "1px solid rgba(56,189,248,0.2)",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 500,
    color: "#38bdf8",
    textAlign: "center",
  },
  totalsSection: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 14,
    color: "var(--text-muted)",
  },
  grandTotalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
    marginTop: 6,
    paddingTop: 8,
    borderTop: "1px solid var(--border)",
  },
  cancelBox: {
    backgroundColor: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 10,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  cancelTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "#f87171",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cancelRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cancelLabel: {
    fontSize: 13,
    color: "var(--text-muted)",
  },
  cancelValue: {
    fontSize: 13,
    color: "var(--text-secondary)",
    fontWeight: 500,
    textAlign: "right",
    maxWidth: "60%",
  },
  refundBtn: {
    marginTop: 20,
    width: "100%",
    minHeight: 48,
    padding: "10px 24px",
    backgroundColor: "rgba(239,68,68,0.12)",
    border: "1px solid #ef4444",
    borderRadius: 10,
    color: "#f87171",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  backBtn: {
    marginTop: 12,
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
