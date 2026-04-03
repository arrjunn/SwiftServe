import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { db } from "../db/index.js";
import PinPad from "../components/PinPad.jsx";
import { formatINR, toPaise } from "@swiftserve/shared";

export default function ShiftCloseScreen({ onShiftClosed, onCancel }) {
  const auth = useAuth();
  const [amountStr, setAmountStr] = useState("");
  const [notes, setNotes] = useState("");
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null); // null = input mode, object = summary mode
  const [shiftStats, setShiftStats] = useState({ orderCount: 0, cashIn: 0 });

  // Load shift stats on mount
  useEffect(() => {
    if (!auth.shift) return;
    async function load() {
      const orders = await db.orders
        .where("shift_id").equals(auth.shift.id)
        .toArray();
      const cashPayments = await db.payments
        .where("shift_id").equals(auth.shift.id)
        .filter((p) => p.method === "cash" && p.status === "success" && !p.is_refund)
        .toArray();
      const cashIn = cashPayments.reduce((sum, p) => sum + p.amount, 0);
      setShiftStats({
        orderCount: orders.filter((o) => o.status !== "cancelled").length,
        cashIn,
      });
    }
    load();
  }, [auth.shift]);

  const closingPaise = amountStr === "" ? 0 : toPaise(Number(amountStr));

  const handleClose = async () => {
    setClosing(true);
    setError("");
    try {
      const result = await auth.closeShift(closingPaise, notes);
      setSummary(result);
    } catch (err) {
      console.error("[SHIFT CLOSE]", err);
      setError(err.message || "Failed to close shift.");
    } finally {
      setClosing(false);
    }
  };

  // Summary view after successful close
  if (summary) {
    const diffColor = summary.cashDifference === 0
      ? "#4ade80"
      : summary.cashDifference > 0
        ? "#38bdf8"
        : "#f87171";
    const diffLabel = summary.cashDifference === 0
      ? "Exact"
      : summary.cashDifference > 0
        ? "Excess"
        : "Short";

    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Shift Closed</h1>
          <p style={styles.subtitle}>Summary for {auth.staff?.name || "Staff"}</p>

          <div style={styles.summaryGrid}>
            <SummaryRow label="Opened At" value={new Date(summary.openedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })} />
            <SummaryRow label="Closed At" value={new Date(summary.closedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })} />
            <div style={styles.divider} />
            <SummaryRow label="Opening Cash" value={formatINR(summary.openingCash)} />
            <SummaryRow label="Cash Sales" value={`+${formatINR(summary.cashIn)}`} valueColor="#4ade80" />
            {summary.cashOut > 0 && (
              <SummaryRow label="Cash Refunds" value={`-${formatINR(summary.cashOut)}`} valueColor="#f87171" />
            )}
            <div style={styles.divider} />
            <SummaryRow label="Expected in Drawer" value={formatINR(summary.expectedCash)} bold />
            <SummaryRow label="Actual in Drawer" value={formatINR(summary.closingCash)} bold />
            <div style={styles.divider} />
            <SummaryRow
              label={`Variance (${diffLabel})`}
              value={`${summary.cashDifference >= 0 ? "+" : ""}${formatINR(summary.cashDifference)}`}
              valueColor={diffColor}
              bold
            />
          </div>

          {/* Daily Performance Summary */}
          <div style={{ width: "100%", marginTop: 16, padding: "16px 20px", backgroundColor: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Your Shift Performance</div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>{shiftStats.orderCount}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Orders Served</div>
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#4ade80" }}>{formatINR(summary.cashIn)}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Cash Collected</div>
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#38bdf8" }}>
                  {(() => {
                    const opened = new Date(summary.openedAt);
                    const closed = new Date(summary.closedAt);
                    const hrs = Math.round((closed - opened) / (1000 * 60 * 60) * 10) / 10;
                    return `${hrs}h`;
                  })()}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Duration</div>
              </div>
            </div>
            {shiftStats.orderCount > 0 && (
              <div style={{ marginTop: 10, textAlign: "center", fontSize: 13, color: "#a5b4fc" }}>
                {shiftStats.orderCount >= 30 ? "Outstanding shift! You crushed it today." :
                 shiftStats.orderCount >= 15 ? "Great work! Solid shift." :
                 "Good shift. See you next time!"}
              </div>
            )}
          </div>

          <button style={styles.primaryBtn} onClick={onShiftClosed}>
            Done
          </button>
        </div>
      </div>
    );
  }

  // Input view
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Close Shift</h1>
        <p style={styles.subtitle}>{auth.staff?.name || "Staff"}</p>

        {/* Shift info */}
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Opening Cash</span>
          <span style={styles.infoValue}>{formatINR(auth.shift?.opening_cash || 0)}</span>
        </div>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Orders This Shift</span>
          <span style={styles.infoValue}>{shiftStats.orderCount}</span>
        </div>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Cash Sales</span>
          <span style={styles.infoValue}>{formatINR(shiftStats.cashIn)}</span>
        </div>

        <div style={styles.divider} />

        <p style={styles.prompt}>Count cash in drawer and enter amount</p>

        <div style={styles.amountDisplay}>
          <span style={styles.amountText}>{formatINR(closingPaise)}</span>
        </div>

        <PinPad
          value={amountStr}
          showDecimal={false}
          masked={false}
          maxLength={7}
          onChange={(v) => { setAmountStr(v); setError(""); }}
        />

        {/* Notes */}
        <textarea
          style={styles.notesInput}
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />

        {error && <div style={styles.errorBox}>{error}</div>}

        <button
          style={{ ...styles.primaryBtn, ...(closing ? styles.disabledBtn : {}) }}
          onClick={handleClose}
          disabled={closing}
        >
          {closing ? "Closing..." : "Close Shift"}
        </button>

        <button style={styles.backBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, valueColor, bold }) {
  return (
    <div style={styles.summaryRow}>
      <span style={{ ...styles.summaryLabel, ...(bold ? { fontWeight: 700, color: "var(--text-secondary)" } : {}) }}>{label}</span>
      <span style={{ ...styles.summaryValue, ...(valueColor ? { color: valueColor } : {}), ...(bold ? { fontWeight: 800 } : {}) }}>{value}</span>
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
    fontSize: 24,
    fontWeight: 700,
    margin: 0,
    textAlign: "center",
  },
  subtitle: {
    color: "var(--text-muted)",
    fontSize: 15,
    margin: "4px 0 16px 0",
  },
  infoRow: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
  },
  infoLabel: {
    fontSize: 14,
    color: "var(--text-muted)",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-secondary)",
    fontFamily: "monospace",
  },
  divider: {
    width: "100%",
    borderTop: "1px dashed var(--border)",
    margin: "12px 0",
  },
  prompt: {
    color: "var(--text-muted)",
    fontSize: 15,
    margin: "0 0 12px 0",
    textAlign: "center",
  },
  amountDisplay: {
    width: "100%",
    padding: "16px 0",
    backgroundColor: "var(--bg-primary)",
    borderRadius: 12,
    textAlign: "center",
    marginBottom: 16,
  },
  amountText: {
    color: "var(--text-primary)",
    fontSize: 36,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  },
  notesInput: {
    width: "100%",
    padding: "10px 14px",
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--text-primary)",
    fontSize: 14,
    fontFamily: "inherit",
    resize: "none",
    outline: "none",
    boxSizing: "border-box",
    marginTop: 8,
  },
  errorBox: {
    marginTop: 12,
    padding: "10px 16px",
    backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #ef4444",
    borderRadius: 8,
    color: "#fca5a5",
    fontSize: 14,
    textAlign: "center",
    width: "100%",
    boxSizing: "border-box",
  },
  primaryBtn: {
    marginTop: 16,
    width: "100%",
    minHeight: 52,
    padding: "12px 24px",
    backgroundColor: "#6366f1",
    border: "none",
    borderRadius: 12,
    color: "#fff",
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  disabledBtn: {
    opacity: 0.6,
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
  // Summary styles
  summaryGrid: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    marginBottom: 16,
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
  },
  summaryLabel: {
    fontSize: 14,
    color: "var(--text-muted)",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-secondary)",
    fontFamily: "monospace",
  },
};
