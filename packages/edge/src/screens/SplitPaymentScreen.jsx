import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useOrder } from "../contexts/OrderContext.jsx";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { formatINR, toRupees, toPaise } from "@swiftserve/shared";
import QRCode from "qrcode";

const QUICK_AMOUNTS = [5000, 10000, 20000, 50000]; // paise: ₹50, ₹100, ₹200, ₹500

export default function SplitPaymentScreen({ onPaymentComplete, onBack }) {
  const auth = useAuth();
  const order = useOrder();
  const qrRef = useRef(null);

  const [slot1Method, setSlot1Method] = useState("cash");
  const [slot2Method, setSlot2Method] = useState("upi");
  const [slot1Input, setSlot1Input] = useState("");
  const [slot1Utr, setSlot1Utr] = useState("");
  const [slot2Utr, setSlot2Utr] = useState("");
  const [outlet, setOutlet] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [orderSaved, setOrderSaved] = useState(!!order.orderId);

  const grandTotal = order.grandTotal;
  const slot1Paise = slot1Input ? toPaise(Number(slot1Input)) : 0;
  const slot2Paise = Math.max(0, grandTotal - slot1Paise);

  const isValid = slot1Paise > 0 && slot1Paise < grandTotal;

  // Load outlet for UPI QR
  useEffect(() => {
    db.outlets.get(OUTLET_ID).then(setOutlet);
  }, []);

  // Generate QR for UPI slot
  useEffect(() => {
    if (!qrRef.current || !outlet?.upi_vpa) return;
    const upiAmount = slot1Method === "upi" ? slot1Paise : slot2Paise;
    if (upiAmount <= 0) return;

    const amtRupees = toRupees(upiAmount).toFixed(2);
    const upiUri = `upi://pay?pa=${encodeURIComponent(outlet.upi_vpa)}&pn=${encodeURIComponent(outlet.name)}&am=${amtRupees}&cu=INR&tn=Split`;

    QRCode.toCanvas(qrRef.current, upiUri, {
      width: 140,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(console.error);
  }, [outlet, slot1Method, slot2Method, slot1Paise, slot2Paise]);

  const handleConfirm = async () => {
    if (!isValid) return;
    setProcessing(true);
    setError("");
    try {
      const staffId = auth.staff?.id;
      const shiftId = await auth.getShiftId();

      let savedOrderId = order.orderId;
      if (!orderSaved) {
        const saved = await order.saveOrder(staffId, shiftId);
        if (!saved) throw new Error("Failed to save order");
        savedOrderId = saved.id;
        setOrderSaved(true);
      }

      const payments = [
        {
          method: slot1Method,
          amount: slot1Paise,
          cashTendered: slot1Method === "cash" ? slot1Paise : null,
          utrNumber: slot1Method === "upi" ? slot1Utr.trim() || null : null,
        },
        {
          method: slot2Method,
          amount: slot2Paise,
          cashTendered: slot2Method === "cash" ? slot2Paise : null,
          utrNumber: slot2Method === "upi" ? slot2Utr.trim() || null : null,
        },
      ];

      await order.recordSplitPayments(payments, staffId, shiftId, savedOrderId);
      await order.generateInvoice(staffId);
      onPaymentComplete();
    } catch (err) {
      setError(err.message || "Payment failed. Try again.");
    } finally {
      setProcessing(false);
    }
  };

  const hasUpiSlot = slot1Method === "upi" || slot2Method === "upi";

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Split Payment</h1>
        <div style={styles.totalBox}>
          <span style={styles.totalLabel}>Total</span>
          <span style={styles.totalValue}>{formatINR(grandTotal)}</span>
        </div>

        {/* Slot 1 */}
        <div style={styles.slot}>
          <div style={styles.slotHeader}>
            <span style={styles.slotTitle}>Slot 1</span>
            <div style={styles.methodToggle}>
              {["cash", "upi"].map((m) => (
                <button
                  key={m}
                  style={{ ...styles.methodBtn, ...(slot1Method === m ? styles.methodBtnActive : {}) }}
                  onClick={() => {
                    setSlot1Method(m);
                    if (m === slot2Method) setSlot2Method(m === "cash" ? "upi" : "cash");
                  }}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div style={styles.amountRow}>
            <span style={styles.rupeeSign}>&#8377;</span>
            <input
              style={styles.amountInput}
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={slot1Input}
              onChange={(e) => { setSlot1Input(e.target.value); setError(""); }}
            />
          </div>
          {slot1Method === "cash" && (
            <div style={styles.quickAmounts}>
              {QUICK_AMOUNTS.map((amt) => (
                <button key={amt} style={styles.quickBtn} onClick={() => setSlot1Input(String(toRupees(amt)))}>
                  &#8377;{toRupees(amt)}
                </button>
              ))}
            </div>
          )}
          {slot1Method === "upi" && (
            <input style={styles.utrInput} type="text" placeholder="UTR (optional)" value={slot1Utr} onChange={(e) => setSlot1Utr(e.target.value)} maxLength={30} />
          )}
        </div>

        {/* Slot 2 */}
        <div style={styles.slot}>
          <div style={styles.slotHeader}>
            <span style={styles.slotTitle}>Slot 2</span>
            <div style={styles.methodToggle}>
              {["cash", "upi"].map((m) => (
                <button
                  key={m}
                  style={{ ...styles.methodBtn, ...(slot2Method === m ? styles.methodBtnActive : {}) }}
                  onClick={() => {
                    setSlot2Method(m);
                    if (m === slot1Method) setSlot1Method(m === "cash" ? "upi" : "cash");
                  }}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div style={styles.slot2Amount}>
            <span style={styles.slot2Label}>Remaining</span>
            <span style={styles.slot2Value}>{formatINR(slot2Paise)}</span>
          </div>
          {slot2Method === "upi" && (
            <input style={styles.utrInput} type="text" placeholder="UTR (optional)" value={slot2Utr} onChange={(e) => setSlot2Utr(e.target.value)} maxLength={30} />
          )}
        </div>

        {/* Mini QR for UPI slot */}
        {hasUpiSlot && (
          <div style={styles.qrSection}>
            <div style={styles.qrWrapper}>
              <canvas ref={qrRef} />
            </div>
            {outlet?.upi_vpa && <span style={styles.vpaText}>{outlet.upi_vpa}</span>}
          </div>
        )}

        {!isValid && slot1Input !== "" && (
          <div style={styles.warningBox}>
            {slot1Paise <= 0 ? "Slot 1 amount must be greater than zero" :
             slot1Paise >= grandTotal ? "Slot 1 amount must be less than total" : ""}
          </div>
        )}

        {error && <div style={styles.errorBox}>{error}</div>}

        <button
          style={{ ...styles.confirmBtn, ...(!isValid || processing ? styles.disabledBtn : {}) }}
          onClick={handleConfirm}
          disabled={!isValid || processing}
        >
          {processing ? "Processing..." : "Confirm Split Payment"}
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
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "24px 16px",
    overflowY: "auto",
    color: "var(--text-primary)",
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
    fontSize: 22,
    fontWeight: 700,
    margin: "0 0 8px 0",
    color: "var(--text-primary)",
  },
  totalBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    fontWeight: 600,
  },
  totalValue: {
    fontSize: 28,
    fontWeight: 800,
    color: "#38bdf8",
    fontFamily: "monospace",
  },
  slot: {
    width: "100%",
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  slotHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  slotTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
  },
  methodToggle: {
    display: "flex",
    gap: 4,
  },
  methodBtn: {
    padding: "8px 16px",
    minHeight: 44,
    borderRadius: 6,
    border: "1px solid var(--border-light)",
    backgroundColor: "transparent",
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  methodBtnActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
    color: "#fff",
  },
  amountRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  rupeeSign: {
    fontSize: 22,
    fontWeight: 700,
    color: "var(--text-muted)",
  },
  amountInput: {
    flex: 1,
    padding: "10px 12px",
    backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 20,
    fontWeight: 700,
    fontFamily: "monospace",
    outline: "none",
    boxSizing: "border-box",
  },
  quickAmounts: {
    display: "flex",
    gap: 6,
    marginTop: 8,
    flexWrap: "wrap",
  },
  quickBtn: {
    padding: "8px 14px",
    minHeight: 44,
    borderRadius: 6,
    border: "1px solid var(--border-light)",
    backgroundColor: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13,
    touchAction: "manipulation",
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  slot2Amount: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  slot2Label: {
    fontSize: 14,
    color: "var(--text-muted)",
  },
  slot2Value: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-secondary)",
    fontFamily: "monospace",
  },
  utrInput: {
    width: "100%",
    padding: "8px 12px",
    backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    marginTop: 8,
  },
  qrSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  qrWrapper: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 8,
  },
  vpaText: {
    fontSize: 12,
    color: "var(--text-dim)",
    fontFamily: "monospace",
  },
  warningBox: {
    width: "100%",
    padding: "8px 14px",
    backgroundColor: "rgba(234,179,8,0.12)",
    border: "1px solid #ca8a04",
    borderRadius: 8,
    color: "#fbbf24",
    fontSize: 13,
    textAlign: "center",
    boxSizing: "border-box",
    marginBottom: 8,
  },
  errorBox: {
    width: "100%",
    padding: "8px 14px",
    backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #ef4444",
    borderRadius: 8,
    color: "#fca5a5",
    fontSize: 13,
    textAlign: "center",
    boxSizing: "border-box",
    marginBottom: 8,
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
  backBtn: {
    marginTop: 10,
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
