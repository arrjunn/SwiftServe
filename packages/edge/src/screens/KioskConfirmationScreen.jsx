import { useState, useEffect, useRef } from "react";
import { formatINR } from "@swiftserve/shared";

const AUTO_REDIRECT_SECONDS = 10;

export default function KioskConfirmationScreen({ orderNumber, paymentMethod, total, itemCount, onNewOrder }) {
  const [timeLeft, setTimeLeft] = useState(AUTO_REDIRECT_SECONDS);
  const timerRef = useRef(null);

  // Countdown timer and auto-redirect
  useEffect(() => {
    setTimeLeft(AUTO_REDIRECT_SECONDS);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          if (onNewOrder) onNewOrder();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [onNewOrder]);

  const isPaid = paymentMethod === "upi";

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        {/* Green checkmark circle */}
        <div style={styles.checkCircle}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <path
              d="M14 24.5L21 31.5L34 17.5"
              stroke="#ffffff"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 style={styles.title}>Order Placed!</h1>

        {/* Cash notice */}
        {paymentMethod === "cash" && (
          <p style={styles.cashNotice}>
            Please pay cash at the counter to finalize.
          </p>
        )}

        {/* Order number card */}
        <div style={styles.orderCard}>
          <span style={styles.orderLabel}>Your Order Number</span>
          <span style={styles.orderNumber}>#{orderNumber ?? "---"}</span>
        </div>

        {/* Summary row */}
        <div style={styles.summaryRow}>
          {itemCount != null && (
            <span style={styles.summaryText}>
              {itemCount} item{itemCount !== 1 ? "s" : ""}
            </span>
          )}
          {total != null && (
            <span style={styles.summaryText}>{formatINR(total)}</span>
          )}
        </div>

        {/* Payment badge */}
        <div style={{ ...styles.paymentBadge, backgroundColor: isPaid ? "#dcfce7" : "#fff7ed", color: isPaid ? "#16a34a" : "#ea580c", border: `1px solid ${isPaid ? "#bbf7d0" : "#fed7aa"}` }}>
          {isPaid ? "Paid" : "Unpaid"}
        </div>

        {/* New order button */}
        <button style={styles.newOrderBtn} onClick={onNewOrder}>
          Start New Order →
        </button>

        {/* Auto-refresh text */}
        <p style={styles.autoText}>Screen will refresh in {timeLeft}s</p>
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
    justifyContent: "center",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    padding: 24,
    overflowY: "auto",
  },
  container: {
    maxWidth: 420,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },

  /* ---- Checkmark ---- */
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#22c55e",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  /* ---- Text ---- */
  title: {
    fontSize: 32,
    fontWeight: 800,
    color: "var(--text-primary)",
    margin: 0,
    textAlign: "center",
  },
  cashNotice: {
    fontSize: 16,
    color: "#ea580c",
    fontWeight: 600,
    textAlign: "center",
    margin: 0,
    backgroundColor: "#fff7ed",
    padding: "10px 18px",
    borderRadius: 10,
    border: "1px solid #fed7aa",
    lineHeight: 1.5,
  },

  /* ---- Order Number Card ---- */
  orderCard: {
    backgroundColor: "var(--bg-primary)",
    borderRadius: 20,
    padding: "24px 40px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    border: "2px solid var(--border-light)",
    marginTop: 8,
  },
  orderLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  orderNumber: {
    fontSize: 64,
    fontWeight: 800,
    color: "var(--text-primary)",
    lineHeight: 1.1,
  },

  /* ---- Summary ---- */
  summaryRow: {
    display: "flex",
    gap: 20,
    alignItems: "center",
  },
  summaryText: {
    fontSize: 16,
    color: "var(--text-secondary)",
    fontWeight: 600,
  },

  /* ---- Payment Badge ---- */
  paymentBadge: {
    padding: "8px 24px",
    borderRadius: 20,
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  /* ---- Button ---- */
  newOrderBtn: {
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
    marginTop: 12,
    letterSpacing: 0.3,
  },
  autoText: {
    fontSize: 13,
    color: "var(--text-dim)",
    margin: 0,
    marginTop: 4,
  },
};
