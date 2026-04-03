import React, { useState } from "react";
import { useOrder } from "../contexts/OrderContext.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import PinPad from "../components/PinPad.jsx";
import { formatINR, toRupees, toPaise } from "@swiftserve/shared";
import { db } from "../db/index.js";

const QUICK_DENOMINATIONS = [
  { label: "10", paise: 1000 },
  { label: "50", paise: 5000 },
  { label: "100", paise: 10000 },
  { label: "200", paise: 20000 },
  { label: "500", paise: 50000 },
];

const styles = {
  wrapper: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    display: "flex",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  leftPanel: {
    flex: "0 0 55%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: 24,
    overflow: "auto",
    boxSizing: "border-box",
    gap: 16,
  },
  rightPanel: {
    flex: "0 0 45%",
    display: "flex",
    flexDirection: "column",
    padding: 24,
    background: "var(--bg-primary)",
    borderLeft: "1px solid var(--border)",
    overflow: "auto",
    boxSizing: "border-box",
    gap: 20,
  },
  grandTotalBanner: {
    width: "100%",
    background: "var(--bg-secondary)",
    borderRadius: 12,
    border: "1px solid var(--border)",
    padding: "16px 20px",
    textAlign: "center",
    boxSizing: "border-box",
  },
  grandTotalLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  grandTotalValue: {
    fontSize: 32,
    fontWeight: 800,
    color: "#38bdf8",
    fontFamily: "monospace",
  },
  receivedLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
  },
  receivedValue: {
    fontSize: 24,
    fontWeight: 700,
    color: "var(--text-primary)",
    fontFamily: "monospace",
    textAlign: "center",
  },
  denomRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    width: "100%",
    maxWidth: 340,
  },
  denomBtn: {
    height: 44,
    minWidth: 64,
    padding: "0 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    color: "#38bdf8",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCard: {
    background: "var(--bg-secondary)",
    borderRadius: 12,
    border: "1px solid var(--border)",
    padding: 20,
    boxSizing: "border-box",
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 14,
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
    fontWeight: 500,
  },
  summaryValue: {
    fontSize: 14,
    color: "var(--text-secondary)",
    fontWeight: 600,
    fontFamily: "monospace",
  },
  divider: {
    borderTop: "1px dashed var(--border)",
    margin: "10px 0",
  },
  changeCard: {
    background: "var(--bg-secondary)",
    borderRadius: 12,
    border: "1px solid var(--border)",
    padding: 20,
    textAlign: "center",
    boxSizing: "border-box",
  },
  changeLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  changeValue: {
    fontSize: 28,
    fontWeight: 800,
    fontFamily: "monospace",
  },
  confirmBtn: {
    width: "100%",
    height: 56,
    minHeight: 44,
    borderRadius: 12,
    border: "none",
    background: "#22c55e",
    color: "#052e16",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    transition: "background 0.15s",
  },
  disabledBtn: {
    opacity: 0.4,
    cursor: "not-allowed",
    background: "var(--border)",
    color: "var(--text-dim)",
  },
  backBtn: {
    width: "100%",
    height: 48,
    minHeight: 44,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  errorText: {
    fontSize: 13,
    color: "#f87171",
    textAlign: "center",
    fontWeight: 500,
  },
};

export default function CashPaymentScreen({ onPaymentComplete, onBack }) {
  const order = useOrder();
  const auth = useAuth();
  const [receivedStr, setReceivedStr] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [orderSaved, setOrderSaved] = useState(false);
  const [paymentRecorded, setPaymentRecorded] = useState(false);

  const { grandTotal, items, subtotal, taxTotal } = order;
  const totalQty = items.reduce((sum, i) => sum + i.qty, 0);

  // receivedStr is in rupees (user enters rupee amount via numpad)
  const receivedPaise = receivedStr ? toPaise(Number(receivedStr)) : 0;
  const changePaise = receivedPaise - grandTotal;
  const canConfirm = receivedPaise >= grandTotal && receivedPaise > 0 && !processing;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setProcessing(true);
    setError("");

    try {
      const staffId = auth.staff?.id;
      if (!staffId) {
        setError("Session expired. Please login again.");
        setProcessing(false);
        return;
      }
      const shiftId = await auth.getShiftId();

      // Step 1: Save order
      let savedOrderId = order.orderId;
      if (!orderSaved) {
        const saved = await order.saveOrder(staffId, shiftId);
        if (!saved) throw new Error("Failed to save order");
        savedOrderId = saved.id;
        setOrderSaved(true);
      }

      // Step 2: Record cash payment
      if (!paymentRecorded) {
        await order.recordCashPayment(receivedPaise, staffId, shiftId, savedOrderId);
        setPaymentRecorded(true);
      }

      // Step 3: Generate invoice
      await order.generateInvoice(staffId);

      // Step 4: Navigate
      onPaymentComplete();
    } catch (err) {
      console.error("Payment flow error:", err);
      if (paymentRecorded || orderSaved) {
        // Payment or order already recorded — only invoice failed
        setError("Payment received but invoice generation failed. Tap to retry.");
      } else {
        setError("Payment failed. Please try again.");
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      {/* Left Panel — Numpad */}
      <div style={styles.leftPanel}>
        {/* Grand total banner */}
        <div style={styles.grandTotalBanner}>
          <div style={styles.grandTotalLabel}>Amount Due</div>
          <div style={styles.grandTotalValue}>{formatINR(grandTotal)}</div>
        </div>

        {/* Received amount display */}
        <div>
          <div style={styles.receivedLabel}>Cash Received</div>
          <div style={styles.receivedValue}>
            {receivedStr ? `₹${receivedStr}` : "₹0"}
          </div>
        </div>

        {/* PinPad for entering amount */}
        <PinPad
          value={receivedStr}
          onChange={setReceivedStr}
          showDecimal={false}
          masked={false}
          maxLength={6}
        />

        {/* Quick denomination buttons */}
        <div style={styles.denomRow}>
          {QUICK_DENOMINATIONS.map((d) => (
            <button
              key={d.paise}
              type="button"
              style={styles.denomBtn}
              onClick={() => setReceivedStr(String(d.paise / 100))}
            >
              ₹{d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Right Panel — Summary & Confirm */}
      <div style={styles.rightPanel}>
        {/* Order summary */}
        <div style={styles.summaryCard}>
          <div style={styles.summaryTitle}>Order Summary</div>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Items</span>
            <span style={styles.summaryValue}>{totalQty}</span>
          </div>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Subtotal</span>
            <span style={styles.summaryValue}>{formatINR(subtotal)}</span>
          </div>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Tax (GST)</span>
            <span style={styles.summaryValue}>{formatINR(taxTotal)}</span>
          </div>
          <div style={styles.divider} />
          <div style={styles.summaryRow}>
            <span style={{ ...styles.summaryLabel, color: "var(--text-primary)", fontWeight: 700 }}>
              Grand Total
            </span>
            <span style={{ ...styles.summaryValue, color: "#38bdf8", fontSize: 18, fontWeight: 800 }}>
              {formatINR(grandTotal)}
            </span>
          </div>
        </div>

        {/* Change calculation */}
        <div style={styles.changeCard}>
          <div style={styles.changeLabel}>Change to Return</div>
          <div
            style={{
              ...styles.changeValue,
              color: receivedPaise === 0
                ? "var(--border-light)"
                : changePaise >= 0
                  ? "#22c55e"
                  : "#f87171",
            }}
          >
            {receivedPaise === 0
              ? "--"
              : changePaise >= 0
                ? formatINR(changePaise)
                : `Short ${formatINR(Math.abs(changePaise))}`}
          </div>
        </div>

        {error && <div style={styles.errorText}>{error}</div>}

        {/* Confirm button */}
        <button
          type="button"
          style={{
            ...styles.confirmBtn,
            ...(!canConfirm ? styles.disabledBtn : {}),
          }}
          disabled={!canConfirm}
          onClick={handleConfirm}
        >
          {processing ? "Processing..." : "Confirm Payment"}
        </button>

        {/* Back button */}
        <button
          type="button"
          style={styles.backBtn}
          onClick={onBack}
          disabled={processing}
        >
          ← Back to Cart
        </button>
      </div>
    </div>
  );
}
