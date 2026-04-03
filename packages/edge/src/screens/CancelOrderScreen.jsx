import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { db } from "../db/index.js";
import { cancelOrder } from "../db/orderOps.js";
import { formatINR } from "@swiftserve/shared";

const CANCEL_REASONS = [
  "Customer requested cancellation",
  "Item(s) not available",
  "Kitchen cannot prepare",
  "Duplicate order",
  "Wrong order entered",
  "Other",
];

export default function CancelOrderScreen({ orderId, onCancelled, onBack }) {
  const auth = useAuth();
  const [order, setOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const o = await db.orders.get(orderId);
        const items = await db.order_items
          .where("order_id").equals(orderId)
          .filter((i) => !i.is_void)
          .toArray();
        setOrder(o);
        setOrderItems(items);
      } catch (err) {
        console.error("[CANCEL] Load failed:", err);
      } finally {
        setLoading(false);
      }
    }
    if (orderId) load();
  }, [orderId]);

  const reason = selectedReason === "Other" ? customReason : selectedReason;

  // Only owner/admin can cancel (or counter staff can cancel their own received orders)
  const role = auth.staff?.role;
  const canCancel = role === "owner" || role === "admin"
    || (role === "counter" && order?.status === "received");

  const handleCancel = async () => {
    if (!reason.trim()) {
      setError("Please select a reason.");
      return;
    }
    setCancelling(true);
    setError("");
    try {
      const result = await cancelOrder(orderId, reason.trim(), auth.staff?.id);
      if (result.success) {
        onCancelled(result);
      }
    } catch (err) {
      setError(err.message || "Failed to cancel order.");
    } finally {
      setCancelling(false);
    }
  };

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

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Cancel Order</h1>

        {/* Order summary */}
        <div style={styles.orderInfo}>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Order</span>
            <span style={styles.orderNum}>#{order.order_number}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Status</span>
            <span style={styles.statusBadge}>{order.status}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Total</span>
            <span style={styles.totalValue}>{formatINR(order.grand_total)}</span>
          </div>
        </div>

        {/* Items */}
        <div style={styles.itemList}>
          {orderItems.map((item) => (
            <div key={item.id} style={styles.itemRow}>
              <span style={styles.itemName}>{item.name}</span>
              <span style={styles.itemQty}>x{item.quantity}</span>
              <span style={styles.itemPrice}>{formatINR(item.line_total)}</span>
            </div>
          ))}
        </div>

        <div style={styles.divider} />

        {/* Reason selection */}
        <p style={styles.prompt}>Reason for cancellation</p>
        <div style={styles.reasonList}>
          {CANCEL_REASONS.map((r) => (
            <button
              key={r}
              style={{
                ...styles.reasonBtn,
                ...(selectedReason === r ? styles.reasonBtnActive : {}),
              }}
              onClick={() => { setSelectedReason(r); setError(""); }}
            >
              {r}
            </button>
          ))}
        </div>

        {selectedReason === "Other" && (
          <input
            style={styles.customInput}
            type="text"
            placeholder="Enter reason..."
            value={customReason}
            onChange={(e) => { setCustomReason(e.target.value); setError(""); }}
            maxLength={200}
          />
        )}

        {!canCancel && (
          <div style={styles.warningBox}>
            You don't have permission to cancel this order. Only owners/admins can cancel, or counter staff can cancel received orders.
          </div>
        )}

        {error && <div style={styles.errorBox}>{error}</div>}

        <button
          style={{
            ...styles.cancelOrderBtn,
            ...(!canCancel || cancelling || !reason.trim() ? styles.disabledBtn : {}),
          }}
          disabled={!canCancel || cancelling || !reason.trim()}
          onClick={handleCancel}
        >
          {cancelling ? "Cancelling..." : "Confirm Cancellation"}
        </button>

        <button style={styles.backBtn} onClick={onBack}>
          ← Go Back
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
    maxWidth: 480,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  title: {
    color: "#f87171",
    fontSize: 22,
    fontWeight: 700,
    margin: "0 0 16px 0",
  },
  orderInfo: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 12,
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "4px 0",
  },
  infoLabel: {
    fontSize: 14,
    color: "var(--text-muted)",
  },
  orderNum: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  statusBadge: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: "capitalize",
    color: "#facc15",
    backgroundColor: "rgba(234,179,8,0.18)",
    padding: "2px 10px",
    borderRadius: 6,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text-primary)",
    fontFamily: "monospace",
  },
  itemList: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    maxHeight: 150,
    overflowY: "auto",
  },
  itemRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 0",
    fontSize: 13,
    color: "#cbd5e1",
  },
  itemName: {
    flex: 1,
  },
  itemQty: {
    color: "var(--text-muted)",
    minWidth: 30,
  },
  itemPrice: {
    fontFamily: "monospace",
    fontWeight: 600,
  },
  divider: {
    width: "100%",
    borderTop: "1px dashed var(--border)",
    margin: "14px 0",
  },
  prompt: {
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 600,
    margin: "0 0 10px 0",
    width: "100%",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  reasonList: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 8,
  },
  reasonBtn: {
    width: "100%",
    minHeight: 44,
    padding: "8px 14px",
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-secondary)",
    fontSize: 14,
    textAlign: "left",
    cursor: "pointer",
    touchAction: "manipulation",
  },
  reasonBtnActive: {
    borderColor: "#f87171",
    backgroundColor: "rgba(239,68,68,0.1)",
    color: "#fca5a5",
  },
  customInput: {
    width: "100%",
    padding: "10px 14px",
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 8,
  },
  warningBox: {
    marginTop: 8,
    padding: "10px 14px",
    backgroundColor: "rgba(234,179,8,0.12)",
    border: "1px solid #ca8a04",
    borderRadius: 8,
    color: "#fbbf24",
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box",
    textAlign: "center",
  },
  errorBox: {
    marginTop: 8,
    padding: "10px 14px",
    backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #ef4444",
    borderRadius: 8,
    color: "#fca5a5",
    fontSize: 14,
    textAlign: "center",
    width: "100%",
    boxSizing: "border-box",
  },
  cancelOrderBtn: {
    marginTop: 16,
    width: "100%",
    minHeight: 52,
    padding: "12px 24px",
    backgroundColor: "#dc2626",
    border: "none",
    borderRadius: 12,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  disabledBtn: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  backBtn: {
    marginTop: 12,
    width: "100%",
    minHeight: 44,
    padding: "10px 24px",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
};
