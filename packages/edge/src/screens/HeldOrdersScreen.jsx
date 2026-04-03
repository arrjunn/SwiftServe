import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useOrder } from "../contexts/OrderContext.jsx";
import { getHeldOrders, loadHeldOrderData, resumeHeldOrder, cancelOrder } from "../db/orderOps.js";
import { formatINR } from "@swiftserve/shared";

function elapsed(isoDate) {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m ago`;
}

export default function HeldOrdersScreen({ onResume, onBack }) {
  const auth = useAuth();
  const order = useOrder();
  const [heldOrders, setHeldOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // orderId being acted on

  const loadOrders = async () => {
    try {
      const orders = await getHeldOrders();
      setHeldOrders(orders);
    } catch (err) {
      console.error("[HELD] Failed to load:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleResume = async (orderId) => {
    setActionLoading(orderId);
    try {
      const { order: heldOrder, items } = await loadHeldOrderData(orderId);

      // Reactivate: held → received (same order, same order number)
      await resumeHeldOrder(orderId, auth.staff?.id);

      // Load items into cart via OrderContext with existing orderId
      const cartItems = items.filter((i) => !i.is_void).map((i) => ({
        menuItemId: i.menu_item_id,
        name: i.name,
        shortName: i.name,
        foodType: i.food_type,
        qty: i.quantity,
        unitPrice: i.unit_price,
        taxRate: i.tax_rate,
        hsnCode: i.hsn_code,
        station: i.station,
        notes: i.notes || null,
      }));

      order.loadHeldOrder(cartItems, heldOrder.type, heldOrder.id, heldOrder.order_number, heldOrder.held_reason || "");
      onResume();
    } catch (err) {
      console.error("[HELD] Resume failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (orderId) => {
    setActionLoading(orderId);
    try {
      await cancelOrder(orderId, "Held order discarded", auth.staff?.id);
      await loadOrders();
    } catch (err) {
      console.error("[HELD] Cancel failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingText}>Loading held orders...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>
          ← Back
        </button>
        <h1 style={styles.title}>Held Orders</h1>
        <span style={styles.countBadge}>{heldOrders.length}</span>
      </div>

      {/* Order List */}
      <div style={styles.list}>
        {heldOrders.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>--</div>
            <div style={{ color: "var(--text-muted)", fontSize: 15 }}>No held orders</div>
          </div>
        ) : (
          heldOrders.map((o) => (
            <div key={o.id} style={styles.orderCard}>
              <div style={styles.cardTop}>
                <span style={styles.orderNumber}>#{o.order_number}</span>
                <span style={styles.orderType}>
                  {o.type === "dine_in" ? "Dine-in" : "Takeaway"}
                </span>
                <span style={styles.elapsed}>{elapsed(o.created_at)}</span>
              </div>
              <div style={styles.cardBottom}>
                <span style={styles.grandTotal}>{formatINR(o.grand_total)}</span>
                <div style={styles.actions}>
                  <button
                    style={{ ...styles.resumeBtn, ...(actionLoading === o.id ? styles.disabledBtn : {}) }}
                    disabled={!!actionLoading}
                    onClick={() => handleResume(o.id)}
                  >
                    {actionLoading === o.id ? "..." : "Resume"}
                  </button>
                  <button
                    style={{ ...styles.cancelBtn, ...(actionLoading === o.id ? styles.disabledBtn : {}) }}
                    disabled={!!actionLoading}
                    onClick={() => handleCancel(o.id)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
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
    color: "var(--text-primary)",
    fontFamily: "inherit",
  },
  loadingText: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    fontSize: 16,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 20px",
    backgroundColor: "var(--bg-secondary)",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  backBtn: {
    minHeight: 40,
    minWidth: 44,
    padding: "6px 16px",
    backgroundColor: "transparent",
    border: "1px solid var(--border-light)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: 0,
    flex: 1,
  },
  countBadge: {
    backgroundColor: "rgba(168,85,247,0.2)",
    color: "#c084fc",
    fontSize: 14,
    fontWeight: 700,
    padding: "4px 12px",
    borderRadius: 12,
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxWidth: 700,
    width: "100%",
    margin: "0 auto",
    boxSizing: "border-box",
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-dim)",
    minHeight: 300,
  },
  orderCard: {
    backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  orderType: {
    fontSize: 13,
    color: "var(--text-muted)",
  },
  elapsed: {
    marginLeft: "auto",
    fontSize: 13,
    color: "var(--text-dim)",
    fontVariantNumeric: "tabular-nums",
  },
  cardBottom: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  grandTotal: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
    fontFamily: "monospace",
  },
  actions: {
    display: "flex",
    gap: 8,
  },
  resumeBtn: {
    minHeight: 40,
    padding: "6px 20px",
    backgroundColor: "#6366f1",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  cancelBtn: {
    minHeight: 40,
    padding: "6px 20px",
    backgroundColor: "transparent",
    border: "1px solid var(--border-light)",
    borderRadius: 8,
    color: "#f87171",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  disabledBtn: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
};
