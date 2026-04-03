import { useState, useEffect, useRef } from "react";
import { useOrder } from "../contexts/OrderContext.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { formatINR, toRupees } from "@swiftserve/shared";
import QRCode from "qrcode";

const TIMER_SECONDS = 300; // 5 minutes

export default function KioskPaymentScreen({ onPaymentComplete, onBack }) {
  const order = useOrder();
  const auth = useAuth();

  const [step, setStep] = useState("select"); // select | upi | cash
  const [outlet, setOutlet] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef(null);

  // Load outlet info
  useEffect(() => {
    db.outlets.get(OUTLET_ID).then(setOutlet);
  }, []);

  // Generate QR data URL when UPI step is active
  useEffect(() => {
    if (step !== "upi" || !outlet?.upi_vpa) return;

    const amountRupees = toRupees(order.grandTotal).toFixed(2);
    const tn = order.orderNumber ? `&tn=Order${order.orderNumber}` : "";
    const upiUri = `upi://pay?pa=${encodeURIComponent(outlet.upi_vpa)}&pn=${encodeURIComponent(outlet.name)}&am=${amountRupees}&cu=INR${tn}`;

    QRCode.toDataURL(upiUri, {
      width: 280,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(console.error);
  }, [step, outlet, order.grandTotal, order.orderNumber]);

  // Countdown timer for UPI step
  useEffect(() => {
    if (step !== "upi") return;
    setTimeLeft(TIMER_SECONDS);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [step]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  // --- Handlers ---

  const handleSelectUPI = () => setStep("upi");

  const handleSelectCash = async () => {
    setStep("cash");
    setProcessing(true);
    setError("");
    try {
      const staffId = auth.staff?.id;
      const shiftId = await auth.getShiftId();

      // Save order (status = "received", no payment recorded)
      if (!order.orderId) {
        const saved = await order.saveOrder(staffId, shiftId);
        if (!saved) throw new Error("Failed to save order");
      }

      // No payment recorded for cash — customer pays at counter
      setProcessing(false);
      onPaymentComplete("cash");
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmUPI = async () => {
    setProcessing(true);
    setError("");
    try {
      const staffId = auth.staff?.id;
      const shiftId = await auth.getShiftId();

      // Save order first
      let savedOrderId = order.orderId;
      if (!savedOrderId) {
        const saved = await order.saveOrder(staffId, shiftId);
        if (!saved) throw new Error("Failed to save order");
        savedOrderId = saved.id;
      }

      // Record UPI payment
      await order.recordUPIPayment(staffId, shiftId, null, savedOrderId);

      onPaymentComplete("upi");
    } catch (err) {
      setError(err.message || "Payment failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const handleFallbackCash = async () => {
    setProcessing(true);
    setError("");
    try {
      const staffId = auth.staff?.id;
      const shiftId = await auth.getShiftId();

      if (!order.orderId) {
        const saved = await order.saveOrder(staffId, shiftId);
        if (!saved) throw new Error("Failed to save order");
      }

      onPaymentComplete("cash");
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setProcessing(false);
    }
  };

  // ============================================================
  // Step 1: Payment method selection
  // ============================================================
  if (step === "select") {
    return (
      <div style={styles.wrapper}>
        <div style={styles.container}>
          <h1 style={styles.title}>How would you like to pay?</h1>

          {/* UPI Option */}
          <button style={styles.upiCard} onClick={handleSelectUPI}>
            <div style={styles.recommendedBadge}>RECOMMENDED</div>
            <div style={styles.optionIcon}>📱</div>
            <div style={styles.optionInfo}>
              <span style={styles.optionTitle}>UPI QR Payment</span>
              <span style={styles.optionDesc}>Scan & Pay instantly</span>
            </div>
            <span style={styles.optionArrow}>→</span>
          </button>

          {/* Cash Option */}
          <button style={styles.cashCard} onClick={handleSelectCash} disabled={processing}>
            <div style={styles.optionIcon}>💵</div>
            <div style={styles.optionInfo}>
              <span style={styles.optionTitle}>Pay at Counter</span>
              <span style={styles.optionDesc}>Cash or Card with cashier</span>
            </div>
            <span style={styles.optionArrow}>→</span>
          </button>

          {/* Total */}
          <div style={styles.totalBar}>
            <span style={styles.totalLabel}>Total to Pay</span>
            <span style={styles.totalValue}>{formatINR(order.grandTotal)}</span>
          </div>

          {error && <div style={styles.errorBox}>{error}</div>}

          <button style={styles.backBtn} onClick={onBack}>
            ← Back to Cart
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Step 2a: UPI QR
  // ============================================================
  if (step === "upi") {
    return (
      <div style={styles.wrapper}>
        <div style={styles.container}>
          <h1 style={styles.title}>Scan QR to Pay</h1>

          {/* Amount */}
          <div style={styles.amountBig}>{formatINR(order.grandTotal)}</div>

          {/* QR Code */}
          <div style={styles.qrBox}>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="UPI QR Code" style={styles.qrImage} />
            ) : (
              <div style={styles.qrPlaceholder}>Generating QR...</div>
            )}
          </div>

          {outlet?.upi_vpa && (
            <div style={styles.vpaText}>UPI ID: {outlet.upi_vpa}</div>
          )}

          <p style={styles.appsText}>
            Pay using any UPI app — Google Pay, PhonePe, Paytm, etc.
          </p>

          {/* Timer */}
          <div style={styles.timerRow}>
            <span style={{ ...styles.timerText, color: timeLeft <= 60 ? "#ef4444" : "var(--text-muted)" }}>
              {timeLeft > 0
                ? `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")} remaining`
                : "QR expired — please try again"}
            </span>
          </div>

          {/* Status */}
          <div style={styles.statusRow}>
            <span style={styles.statusDot} />
            <span style={styles.statusText}>Waiting for payment...</span>
          </div>

          {error && <div style={styles.errorBox}>{error}</div>}

          {/* Confirm */}
          <button
            style={{
              ...styles.confirmBtn,
              ...(processing || timeLeft <= 0 ? { opacity: 0.5, cursor: "not-allowed" } : {}),
            }}
            onClick={handleConfirmUPI}
            disabled={processing || timeLeft <= 0}
          >
            {processing ? "Processing..." : "Confirm Payment"}
          </button>

          {/* Fallback */}
          <button style={styles.fallbackBtn} onClick={handleFallbackCash} disabled={processing}>
            Problem scanning? Pay with Cash
          </button>

          <button style={styles.backBtn} onClick={() => setStep("select")}>
            ← Choose another method
          </button>
        </div>
      </div>
    );
  }

  // Step 2b (cash) auto-proceeds via handleSelectCash, so we show a loading state
  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={styles.loadingText}>Processing your order...</div>
        {error && <div style={styles.errorBox}>{error}</div>}
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "var(--bg-primary)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    overflowY: "auto",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  container: {
    maxWidth: 480,
    width: "100%",
    padding: "32px 24px 48px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    boxSizing: "border-box",
  },
  title: {
    fontSize: 26,
    fontWeight: 800,
    color: "var(--text-primary)",
    margin: 0,
    textAlign: "center",
  },

  /* ---- Select Step ---- */
  upiCard: {
    width: "100%",
    minHeight: 80,
    padding: "18px 20px",
    backgroundColor: "#f0fdf4",
    border: "2px solid #22c55e",
    borderRadius: 16,
    display: "flex",
    alignItems: "center",
    gap: 14,
    cursor: "pointer",
    touchAction: "manipulation",
    position: "relative",
    textAlign: "left",
  },
  recommendedBadge: {
    position: "absolute",
    top: -10,
    right: 16,
    backgroundColor: "#22c55e",
    color: "#ffffff",
    fontSize: 10,
    fontWeight: 800,
    padding: "3px 10px",
    borderRadius: 6,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  cashCard: {
    width: "100%",
    minHeight: 80,
    padding: "18px 20px",
    backgroundColor: "var(--bg-primary)",
    border: "2px solid var(--border-light)",
    borderRadius: 16,
    display: "flex",
    alignItems: "center",
    gap: 14,
    cursor: "pointer",
    touchAction: "manipulation",
    textAlign: "left",
  },
  optionIcon: {
    fontSize: 32,
    flexShrink: 0,
  },
  optionInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  optionDesc: {
    fontSize: 14,
    color: "var(--text-muted)",
  },
  optionArrow: {
    fontSize: 22,
    color: "var(--text-dim)",
    flexShrink: 0,
  },

  totalBar: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "var(--bg-primary)",
    borderRadius: 14,
    padding: "18px 20px",
    border: "1px solid var(--border-light)",
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--text-secondary)",
  },
  totalValue: {
    fontSize: 22,
    fontWeight: 800,
    color: "var(--text-primary)",
  },

  /* ---- UPI Step ---- */
  amountBig: {
    fontSize: 32,
    fontWeight: 800,
    color: "#22c55e",
    fontFamily: "monospace",
  },
  qrBox: {
    backgroundColor: "var(--bg-primary)",
    borderRadius: 16,
    padding: 16,
    border: "2px solid var(--border-light)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  qrImage: {
    width: 260,
    height: 260,
    display: "block",
  },
  qrPlaceholder: {
    width: 260,
    height: 260,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-dim)",
    fontSize: 16,
  },
  vpaText: {
    fontSize: 14,
    color: "var(--text-muted)",
    fontFamily: "monospace",
  },
  appsText: {
    fontSize: 14,
    color: "var(--text-muted)",
    textAlign: "center",
    margin: 0,
    lineHeight: 1.5,
  },
  timerRow: {
    padding: "4px 0",
  },
  timerText: {
    fontSize: 16,
    fontWeight: 700,
    fontFamily: "monospace",
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#facc15",
    animation: "none", // CSS animations need keyframes; pulse is visual-only
  },
  statusText: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-secondary)",
  },
  confirmBtn: {
    width: "100%",
    minHeight: 64,
    padding: "16px 24px",
    backgroundColor: "#22c55e",
    border: "none",
    borderRadius: 16,
    color: "#ffffff",
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
    marginTop: 8,
  },
  fallbackBtn: {
    width: "100%",
    minHeight: 56,
    padding: "14px 24px",
    backgroundColor: "transparent",
    border: "2px solid #f59e0b",
    borderRadius: 14,
    color: "#d97706",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  backBtn: {
    width: "100%",
    minHeight: 56,
    padding: "14px 24px",
    backgroundColor: "transparent",
    border: "2px solid var(--border-light)",
    borderRadius: 14,
    color: "var(--text-muted)",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },

  /* ---- Shared ---- */
  errorBox: {
    width: "100%",
    padding: "12px 16px",
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 10,
    color: "#dc2626",
    fontSize: 14,
    textAlign: "center",
    boxSizing: "border-box",
  },
  loadingText: {
    fontSize: 20,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginTop: 80,
  },
};
