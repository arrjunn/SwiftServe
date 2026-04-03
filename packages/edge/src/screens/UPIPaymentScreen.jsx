import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useOrder } from "../contexts/OrderContext.jsx";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { formatINR, toRupees } from "@swiftserve/shared";
import QRCode from "qrcode";

const TIMER_SECONDS = 300; // 5 minutes

export default function UPIPaymentScreen({ onPaymentComplete, onPayWithCash, onBack }) {
  const auth = useAuth();
  const order = useOrder();
  const canvasRef = useRef(null);

  const [outlet, setOutlet] = useState(null);
  const [utrNumber, setUtrNumber] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [orderSaved, setOrderSaved] = useState(!!order.orderId);
  const [paymentRecorded, setPaymentRecorded] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);

  // Load outlet for VPA
  useEffect(() => {
    db.outlets.get(OUTLET_ID).then(setOutlet);
  }, []);

  // Generate QR code
  useEffect(() => {
    if (!outlet?.upi_vpa || !canvasRef.current) return;
    const amountRupees = toRupees(order.grandTotal).toFixed(2);
    const orderNum = order.orderNumber || "New";
    const upiUri = `upi://pay?pa=${encodeURIComponent(outlet.upi_vpa)}&pn=${encodeURIComponent(outlet.name)}&am=${amountRupees}&cu=INR&tn=Order${orderNum}`;

    QRCode.toCanvas(canvasRef.current, upiUri, {
      width: 220,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(console.error);
  }, [outlet, order.grandTotal, order.orderNumber]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((t) => {
      if (t <= 1) clearInterval(timer);
      return Math.max(0, t - 1);
    }), 1000);
    return () => clearInterval(timer);
  }, []);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  const handleConfirm = async () => {
    setProcessing(true);
    setError("");
    try {
      const staffId = auth.staff?.id;
      const shiftId = await auth.getShiftId();

      // Step 1: Save order
      let savedOrderId = order.orderId;
      if (!orderSaved) {
        const saved = await order.saveOrder(staffId, shiftId);
        if (!saved) throw new Error("Failed to save order");
        savedOrderId = saved.id;
        setOrderSaved(true);
      }

      // Step 2: Record UPI payment
      if (!paymentRecorded) {
        await order.recordUPIPayment(staffId, shiftId, utrNumber.trim() || null, savedOrderId);
        setPaymentRecorded(true);
      }

      // Step 3: Generate invoice
      await order.generateInvoice(staffId);
      onPaymentComplete();
    } catch (err) {
      setError(err.message || "Payment failed. Try again.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Left Panel — QR Code */}
      <div style={styles.leftPanel}>
        <div style={styles.qrCard}>
          <h2 style={styles.panelTitle}>Scan to Pay</h2>
          <div style={styles.totalDisplay}>{formatINR(order.grandTotal)}</div>

          <div style={styles.qrWrapper}>
            <canvas ref={canvasRef} style={styles.qrCanvas} />
          </div>

          {outlet?.upi_vpa && (
            <div style={styles.vpaText}>UPI: {outlet.upi_vpa}</div>
          )}

          <div style={styles.timer}>
            {timeLeft > 0
              ? `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
              : "Timer expired"}
          </div>
        </div>
      </div>

      {/* Right Panel — Actions */}
      <div style={styles.rightPanel}>
        <div style={styles.summaryCard}>
          <h3 style={styles.sectionTitle}>Order Summary</h3>
          <div style={styles.summaryRow}>
            <span>Items</span>
            <span>{order.items.reduce((sum, i) => sum + i.qty, 0)}</span>
          </div>
          <div style={styles.summaryRow}>
            <span>Subtotal</span>
            <span>{formatINR(order.subtotal)}</span>
          </div>
          {order.discountAmount > 0 && (
            <div style={{ ...styles.summaryRow, color: "#22c55e" }}>
              <span>Discount</span>
              <span>-{formatINR(order.discountAmount)}</span>
            </div>
          )}
          <div style={styles.summaryRow}>
            <span>Tax</span>
            <span>{formatINR(order.taxTotal)}</span>
          </div>
          <div style={{ ...styles.summaryRow, fontWeight: 700, color: "#38bdf8", fontSize: 16, marginTop: 8 }}>
            <span>Total</span>
            <span>{formatINR(order.grandTotal)}</span>
          </div>
        </div>

        <input
          style={styles.utrInput}
          type="text"
          placeholder="UTR / Reference (optional)"
          value={utrNumber}
          onChange={(e) => setUtrNumber(e.target.value)}
          maxLength={30}
        />

        {error && <div style={styles.errorBox}>{error}</div>}

        <button
          style={{ ...styles.confirmBtn, ...(processing || timeLeft <= 0 ? styles.disabledBtn : {}) }}
          onClick={handleConfirm}
          disabled={processing || timeLeft <= 0}
        >
          {processing ? "Processing..." : timeLeft <= 0 ? "QR Expired — Go Back & Retry" : "Confirm Payment Received"}
        </button>

        <button style={styles.switchBtn} onClick={onPayWithCash}>
          Pay with Cash Instead
        </button>

        <button style={styles.backBtn} onClick={onBack}>
          &#8592; Back
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
    flexDirection: "row",
    color: "var(--text-primary)",
  },
  leftPanel: {
    flex: "0 0 55%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  rightPanel: {
    flex: "0 0 45%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  qrCard: {
    backgroundColor: "var(--bg-secondary)",
    borderRadius: 16,
    padding: 32,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
    color: "var(--text-primary)",
  },
  totalDisplay: {
    fontSize: 32,
    fontWeight: 800,
    color: "#38bdf8",
    fontFamily: "monospace",
  },
  qrWrapper: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
  },
  qrCanvas: {
    display: "block",
  },
  vpaText: {
    fontSize: 13,
    color: "var(--text-muted)",
    fontFamily: "monospace",
  },
  timer: {
    fontSize: 18,
    fontWeight: 700,
    color: "#facc15",
    fontFamily: "monospace",
  },
  summaryCard: {
    backgroundColor: "var(--bg-secondary)",
    borderRadius: 12,
    padding: 16,
    border: "1px solid var(--border)",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 1,
    margin: "0 0 10px 0",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 14,
    color: "#cbd5e1",
    padding: "3px 0",
  },
  utrInput: {
    width: "100%",
    padding: "12px 14px",
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  errorBox: {
    padding: "10px 14px",
    backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #ef4444",
    borderRadius: 8,
    color: "#fca5a5",
    fontSize: 14,
    textAlign: "center",
  },
  confirmBtn: {
    width: "100%",
    minHeight: 52,
    padding: "12px 24px",
    backgroundColor: "#22c55e",
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
  switchBtn: {
    width: "100%",
    minHeight: 44,
    padding: "10px 24px",
    backgroundColor: "transparent",
    border: "1px solid #f59e0b",
    borderRadius: 10,
    color: "#fbbf24",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  backBtn: {
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
