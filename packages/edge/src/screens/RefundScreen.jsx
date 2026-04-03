import { useState, useEffect } from "react";
import { db } from "../db/index.js";
import { refundOrder } from "../db/orderOps.js";
import { formatINR } from "@swiftserve/shared";
import bcrypt from "bcryptjs";

const REFUND_REASONS = [
  "Customer complaint",
  "Wrong order",
  "Food quality",
  "Long wait",
  "Other",
];

export default function RefundScreen({ orderId, onRefunded, onBack }) {
  const [order, setOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [processing, setProcessing] = useState(false);
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
        const pays = await db.payments
          .where("order_id").equals(orderId)
          .filter((p) => p.status === "success" && !p.is_refund)
          .toArray();
        setOrder(o);
        setOrderItems(items);
        setPayments(pays);
      } catch (err) {
        console.error("[REFUND] Load failed:", err);
      } finally {
        setLoading(false);
      }
    }
    if (orderId) load();
  }, [orderId]);

  const reason = selectedReason === "Other" ? customReason : selectedReason;

  const handleRefund = async () => {
    if (!reason.trim()) { setError("Please select a reason."); return; }
    if (pinInput.length < 4) { setPinError("Enter owner PIN"); return; }

    // Verify owner PIN
    setPinError("");
    try {
      const owners = await db.staff.where("role").equals("owner").filter(s => s.is_active === 1).toArray();
      let ownerId = null;
      for (const owner of owners) {
        if (await bcrypt.compare(pinInput, owner.pin_hash)) { ownerId = owner.id; break; }
      }
      if (!ownerId) { setPinError("Invalid owner PIN"); setPinInput(""); return; }

      setProcessing(true);
      setError("");
      const result = await refundOrder(orderId, reason.trim(), ownerId);
      if (result.success) onRefunded();
    } catch (err) {
      setError(err.message || "Refund failed.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingText}>Loading order...</div>
      </div>
    );
  }

  if (!order || order.status !== "completed") {
    return (
      <div style={styles.container}>
        <div style={styles.loadingText}>{!order ? "Order not found." : "Only completed orders can be refunded."}</div>
        <button style={styles.backBtn} onClick={onBack}>&#8592; Back</button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Process Refund</h1>

        {/* Order summary */}
        <div style={styles.orderInfo}>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Order</span>
            <span style={styles.orderNum}>#{order.order_number}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Total</span>
            <span style={styles.totalValue}>{formatINR(order.grand_total)}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Payment</span>
            <span style={styles.paymentMethod}>{payments.map(p => (p.method || "unknown").toUpperCase()).join(" + ")}</span>
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

        {/* Reason */}
        <p style={styles.prompt}>Reason for refund</p>
        <div style={styles.reasonList}>
          {REFUND_REASONS.map((r) => (
            <button
              key={r}
              style={{ ...styles.reasonBtn, ...(selectedReason === r ? styles.reasonBtnActive : {}) }}
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

        <div style={styles.divider} />

        {/* Owner PIN */}
        <p style={styles.prompt}>Owner Authorization</p>
        <input
          style={styles.pinInput}
          type="password"
          inputMode="numeric"
          placeholder="Owner PIN"
          value={pinInput}
          onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6)); setPinError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleRefund()}
        />
        {pinError && <div style={styles.pinErrorText}>{pinError}</div>}

        {error && <div style={styles.errorBox}>{error}</div>}

        <button
          style={{ ...styles.refundBtn, ...(processing || !reason.trim() ? styles.disabledBtn : {}) }}
          disabled={processing || !reason.trim()}
          onClick={handleRefund}
        >
          {processing ? "Processing Refund..." : `Refund ${formatINR(order.grand_total)}`}
        </button>

        <button style={styles.backBtn} onClick={onBack}>&#8592; Go Back</button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "var(--bg-primary)", display: "flex",
    flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
    padding: "24px 16px", overflowY: "auto", color: "var(--text-primary)",
  },
  loadingText: { color: "var(--text-muted)", fontSize: 16, textAlign: "center", padding: 32 },
  card: {
    backgroundColor: "var(--bg-secondary)", borderRadius: 16, padding: 28, width: "100%",
    maxWidth: 480, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", display: "flex",
    flexDirection: "column", alignItems: "center",
  },
  title: { color: "#f87171", fontSize: 22, fontWeight: 700, margin: "0 0 16px 0" },
  orderInfo: { width: "100%", display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 },
  infoRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" },
  infoLabel: { fontSize: 14, color: "var(--text-muted)" },
  orderNum: { fontSize: 18, fontWeight: 700, color: "var(--text-primary)" },
  totalValue: { fontSize: 16, fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" },
  paymentMethod: { fontSize: 14, fontWeight: 600, color: "#38bdf8" },
  itemList: { width: "100%", display: "flex", flexDirection: "column", gap: 4, maxHeight: 150, overflowY: "auto" },
  itemRow: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, color: "#cbd5e1" },
  itemName: { flex: 1 },
  itemQty: { color: "var(--text-muted)", minWidth: 30 },
  itemPrice: { fontFamily: "monospace", fontWeight: 600 },
  divider: { width: "100%", borderTop: "1px dashed var(--border)", margin: "14px 0" },
  prompt: { color: "var(--text-muted)", fontSize: 14, fontWeight: 600, margin: "0 0 10px 0", width: "100%", textTransform: "uppercase", letterSpacing: 0.5 },
  reasonList: { width: "100%", display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 },
  reasonBtn: {
    width: "100%", minHeight: 44, padding: "8px 14px", backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 14,
    textAlign: "left", cursor: "pointer", touchAction: "manipulation",
  },
  reasonBtnActive: { borderColor: "#f87171", backgroundColor: "rgba(239,68,68,0.1)", color: "#fca5a5" },
  customInput: {
    width: "100%", padding: "10px 14px", backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text-primary)", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 8,
  },
  pinInput: {
    width: "100%", padding: "14px 16px", backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)",
    borderRadius: 10, color: "var(--text-primary)", fontSize: 24, fontWeight: 700, fontFamily: "monospace",
    textAlign: "center", outline: "none", boxSizing: "border-box", letterSpacing: 8,
  },
  pinErrorText: { fontSize: 13, color: "#fca5a5", marginTop: 4 },
  errorBox: {
    marginTop: 8, padding: "10px 14px", backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #ef4444", borderRadius: 8, color: "#fca5a5", fontSize: 14,
    textAlign: "center", width: "100%", boxSizing: "border-box",
  },
  refundBtn: {
    marginTop: 16, width: "100%", minHeight: 52, padding: "12px 24px",
    backgroundColor: "#dc2626", border: "none", borderRadius: 12, color: "#fff",
    fontSize: 16, fontWeight: 700, cursor: "pointer", touchAction: "manipulation",
  },
  disabledBtn: { opacity: 0.5, cursor: "not-allowed" },
  backBtn: {
    marginTop: 12, width: "100%", minHeight: 44, padding: "10px 24px",
    backgroundColor: "transparent", border: "1px solid var(--border)", borderRadius: 10,
    color: "var(--text-muted)", fontSize: 14, fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
};
