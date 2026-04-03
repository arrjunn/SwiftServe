import { useOrder } from "../contexts/OrderContext.jsx";
import { formatINR } from "@swiftserve/shared";

export default function PaymentSelectScreen({ onCash, onUPI, onSplit, onCard, onBack }) {
  const order = useOrder();

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Select Payment Method</h1>

        <div style={styles.totalBox}>
          <span style={styles.totalLabel}>Amount Due</span>
          <span style={styles.totalValue}>{formatINR(order.grandTotal)}</span>
        </div>

        {order.discountAmount > 0 && (
          <div style={styles.discountNote}>
            Discount applied: -{formatINR(order.discountAmount)}
          </div>
        )}

        <div style={styles.methods}>
          <button style={{ ...styles.methodBtn, ...styles.cashBtn }} onClick={onCash}>
            <span style={styles.methodIcon}>&#8377;</span>
            <span style={styles.methodLabel}>Cash</span>
          </button>

          <button style={{ ...styles.methodBtn, ...styles.upiBtn }} onClick={onUPI}>
            <span style={styles.methodIcon}>QR</span>
            <span style={styles.methodLabel}>UPI</span>
          </button>

          <button style={{ ...styles.methodBtn, ...styles.splitBtn }} onClick={onSplit}>
            <span style={styles.methodIcon}>//</span>
            <span style={styles.methodLabel}>Split Payment</span>
          </button>

          <button style={{ ...styles.methodBtn, ...styles.cardBtn, ...(onCard ? { opacity: 1, cursor: "pointer" } : {}) }} disabled={!onCard} onClick={onCard}>
            <span style={styles.methodIcon}>&#9114;</span>
            <span style={styles.methodLabel}>Card</span>
            {!onCard && <span style={styles.comingSoon}>Configure in Settings</span>}
          </button>
        </div>

        <button style={styles.backBtn} onClick={onBack}>
          &#8592; Back to Cart
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
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "24px 16px",
    overflowY: "auto",
    color: "var(--text-primary)",
  },
  card: {
    backgroundColor: "var(--bg-secondary)",
    borderRadius: 16,
    padding: 32,
    width: "100%",
    maxWidth: 440,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  title: {
    color: "var(--text-primary)",
    fontSize: 22,
    fontWeight: 700,
    margin: "0 0 20px 0",
  },
  totalBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 13,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    fontWeight: 600,
    letterSpacing: 1,
  },
  totalValue: {
    fontSize: 36,
    fontWeight: 800,
    color: "#38bdf8",
    fontFamily: "monospace",
  },
  discountNote: {
    fontSize: 13,
    color: "#22c55e",
    marginBottom: 20,
    fontWeight: 500,
  },
  methods: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 12,
  },
  methodBtn: {
    width: "100%",
    minHeight: 60,
    padding: "14px 20px",
    borderRadius: 12,
    border: "2px solid var(--border)",
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 14,
    touchAction: "manipulation",
    position: "relative",
  },
  cashBtn: {
    borderColor: "#22c55e",
    backgroundColor: "rgba(34,197,94,0.08)",
  },
  upiBtn: {
    borderColor: "#6366f1",
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  splitBtn: {
    borderColor: "#f59e0b",
    backgroundColor: "rgba(245,158,11,0.08)",
  },
  cardBtn: {
    borderColor: "var(--border-light)",
    opacity: 0.5,
    cursor: "not-allowed",
  },
  methodIcon: {
    fontSize: 20,
    fontWeight: 800,
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    flexShrink: 0,
  },
  methodLabel: {
    flex: 1,
  },
  comingSoon: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    backgroundColor: "rgba(148,163,184,0.15)",
    padding: "2px 8px",
    borderRadius: 4,
    textTransform: "uppercase",
  },
  backBtn: {
    marginTop: 20,
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
