import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useSupabaseAuth } from "../contexts/SupabaseAuthContext.jsx";
import { useOrder } from "../contexts/OrderContext.jsx";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { formatINR } from "@swiftserve/shared";
import { v4 as uuid } from "uuid";

const CLOUD_BASE = import.meta.env.VITE_CLOUD_URL || "http://localhost:3001";

/**
 * Dynamically load the Razorpay checkout script.
 * Resolves immediately if already loaded; rejects on network failure.
 */
function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      // Script tag exists but hasn't loaded yet — wait for it
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay SDK")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay SDK. Check your internet connection."));
    document.body.appendChild(script);
  });
}

export default function CardPaymentScreen({ onPaymentComplete, onBack }) {
  const auth = useAuth();
  const { session } = useSupabaseAuth();
  const order = useOrder();

  const [outlet, setOutlet] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | processing | success | failed
  const [error, setError] = useState("");
  const [orderSaved, setOrderSaved] = useState(!!order.orderId);
  const [paymentRecorded, setPaymentRecorded] = useState(false);

  // Load outlet config for razorpay_key_id
  useEffect(() => {
    db.outlets.get(OUTLET_ID).then(setOutlet);
  }, []);

  const razorpayKeyId = outlet?.razorpay_key_id || null;
  const outletName = outlet?.name || "SwiftServe";

  const handlePay = useCallback(async () => {
    setStatus("loading");
    setError("");

    const staffId = auth.staff?.id;
    if (!staffId) {
      setError("Session expired. Please login again.");
      setStatus("failed");
      return;
    }
    const shiftId = await auth.getShiftId();

    try {
      // Step 1: Save order if not yet saved
      if (!orderSaved) {
        await order.saveOrder(staffId, shiftId);
        setOrderSaved(true);
      }

      // Step 2: Load Razorpay SDK
      await loadRazorpayScript();

      // Step 3: Create Razorpay order via cloud API
      const createRes = await fetch(`${CLOUD_BASE}/api/payments/create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          amount: order.grandTotal,
          orderId: order.orderId,
          keyId: razorpayKeyId,
        }),
      });

      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${createRes.status})`);
      }

      const { razorpayOrderId } = await createRes.json();

      // Step 4: Open Razorpay checkout
      setStatus("processing");

      const options = {
        key: razorpayKeyId,
        amount: order.grandTotal, // already in paise
        currency: "INR",
        name: outletName,
        description: `Order #${order.orderNumber}`,
        order_id: razorpayOrderId,
        handler: async function (response) {
          // Payment successful — verify and record
          try {
            await verifyAndRecord(response, staffId, shiftId, razorpayOrderId);
          } catch (err) {
            setError(err.message || "Verification failed. Contact support.");
            setStatus("failed");
          }
        },
        modal: {
          ondismiss: function () {
            // User closed the payment modal without paying
            setStatus("idle");
            setError("Payment cancelled. Tap to retry.");
          },
        },
        prefill: {},
        theme: { color: "#3b82f6" },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", function (resp) {
        setError(resp.error?.description || "Payment failed. Please try again.");
        setStatus("failed");
      });
      rzp.open();
    } catch (err) {
      console.error("Card payment error:", err);
      setError(err.message || "Something went wrong. Please try again.");
      setStatus("failed");
    }
  }, [auth, session, order, orderSaved, razorpayKeyId, outletName]);

  const verifyAndRecord = useCallback(async (response, staffId, shiftId, razorpayOrderId) => {
    // Step 5: Verify signature on server
    const verifyRes = await fetch(`${CLOUD_BASE}/api/payments/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token || ""}`,
      },
      body: JSON.stringify({
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature,
        orderId: order.orderId,
        amount: order.grandTotal,
      }),
    });

    if (!verifyRes.ok) {
      const body = await verifyRes.json().catch(() => ({}));
      throw new Error(body.error || "Payment verification failed");
    }

    // Step 6: Record payment locally in Dexie
    if (!paymentRecorded) {
      const now = new Date().toISOString();
      const paymentId = uuid();

      const payment = {
        id: paymentId,
        outlet_id: OUTLET_ID,
        order_id: order.orderId,
        shift_id: shiftId || null,
        method: "card",
        amount: order.grandTotal,
        status: "success",
        gateway: "razorpay",
        gateway_txn_id: response.razorpay_payment_id,
        gateway_order_id: response.razorpay_order_id,
        upi_vpa_masked: null,
        cash_tendered: null,
        cash_change: null,
        is_refund: 0,
        refund_of: null,
        refund_reason: null,
        refunded_by: null,
        created_at: now,
        updated_at: now,
        synced_at: null,
        deleted_at: null,
      };

      const cardTxTables = ["payments", "orders", "audit_log"];
      if (order.tableId) cardTxTables.push("floor_tables");

      await db.transaction("rw", cardTxTables, async () => {
        await db.payments.add(payment);
        await db.orders.update(order.orderId, {
          status: "completed",
          completed_at: now,
          updated_at: now,
        });
        if (order.tableId) {
          await db.floor_tables.update(order.tableId, {
            status: "available",
            current_order_id: null,
            updated_at: now,
          });
        }
        await db.audit_log.add({
          id: crypto.randomUUID(),
          outlet_id: OUTLET_ID,
          staff_id: staffId,
          action: "payment_received",
          entity_type: "payment",
          entity_id: paymentId,
          old_value: null,
          new_value: JSON.stringify({
            method: "card",
            gateway: "razorpay",
            amount: order.grandTotal,
            gateway_txn_id: response.razorpay_payment_id,
          }),
          created_at: now,
          synced_at: null,
        });
      });

      setPaymentRecorded(true);
    }

    // Step 7: Generate invoice
    await order.generateInvoice(staffId);

    setStatus("success");

    // Brief pause so the user sees the success state, then navigate
    setTimeout(() => onPaymentComplete(), 1200);
  }, [auth, session, order, paymentRecorded, onPaymentComplete]);

  // Not configured state
  if (outlet && !razorpayKeyId) {
    return (
      <div style={styles.container}>
        <div style={styles.centerCard}>
          <div style={styles.iconCircle}>
            <span style={{ fontSize: 36 }}>&#9888;</span>
          </div>
          <h2 style={styles.title}>Card Payments Not Configured</h2>
          <p style={styles.subtitle}>
            Go to Settings &gt; Payments to add your Razorpay Key ID.
          </p>
          <button style={styles.backBtn} onClick={onBack}>
            &#8592; Back
          </button>
        </div>
      </div>
    );
  }

  const totalQty = order.items.reduce((sum, i) => sum + i.qty, 0);
  const isProcessing = status === "loading" || status === "processing";

  return (
    <div style={styles.container}>
      {/* Left Panel — Payment Info */}
      <div style={styles.leftPanel}>
        <div style={styles.paymentCard}>
          {/* Status icon */}
          <div style={styles.iconCircle}>
            {status === "success" ? (
              <span style={{ fontSize: 40, color: "#22c55e" }}>&#10003;</span>
            ) : status === "failed" ? (
              <span style={{ fontSize: 40, color: "#ef4444" }}>&#10007;</span>
            ) : (
              <span style={{ fontSize: 36, color: "#38bdf8" }}>&#128179;</span>
            )}
          </div>

          <h2 style={styles.title}>
            {status === "success"
              ? "Payment Successful"
              : status === "failed"
                ? "Payment Failed"
                : status === "processing"
                  ? "Awaiting Payment..."
                  : "Card Payment"}
          </h2>

          {/* Amount display */}
          <div style={styles.totalDisplay}>{formatINR(order.grandTotal)}</div>

          {status === "processing" && (
            <p style={styles.hint}>Complete the payment in the Razorpay window.</p>
          )}

          {status === "success" && (
            <p style={{ ...styles.hint, color: "#22c55e" }}>Redirecting to receipt...</p>
          )}
        </div>
      </div>

      {/* Right Panel — Summary & Actions */}
      <div style={styles.rightPanel}>
        {/* Order summary */}
        <div style={styles.summaryCard}>
          <h3 style={styles.sectionTitle}>Order Summary</h3>
          <div style={styles.summaryRow}>
            <span>Items</span>
            <span>{totalQty}</span>
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
            <span>Tax (GST)</span>
            <span>{formatINR(order.taxTotal)}</span>
          </div>
          <div style={{ ...styles.summaryRow, fontWeight: 700, color: "#38bdf8", fontSize: 16, marginTop: 8 }}>
            <span>Total</span>
            <span>{formatINR(order.grandTotal)}</span>
          </div>
        </div>

        {/* Gateway badge */}
        <div style={styles.gatewayBadge}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Powered by</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#3b82f6" }}>Razorpay</span>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Pay button */}
        {status !== "success" && (
          <button
            style={{
              ...styles.payBtn,
              ...(isProcessing ? styles.disabledBtn : {}),
            }}
            onClick={handlePay}
            disabled={isProcessing}
          >
            {status === "loading"
              ? "Creating Order..."
              : status === "processing"
                ? "Waiting for Payment..."
                : status === "failed"
                  ? "Retry Payment"
                  : "Pay with Card"}
          </button>
        )}

        {/* Back button — hidden during processing */}
        {!isProcessing && status !== "success" && (
          <button style={styles.backBtn} onClick={onBack}>
            &#8592; Back
          </button>
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
    flexDirection: "row",
    color: "var(--text-primary)",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
  centerCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: 32,
    gap: 16,
    width: "100%",
  },
  paymentCard: {
    backgroundColor: "var(--bg-secondary)",
    borderRadius: 16,
    padding: 40,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    minWidth: 320,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    backgroundColor: "var(--bg-primary)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "2px solid var(--border)",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
    color: "var(--text-primary)",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "var(--text-muted)",
    textAlign: "center",
    lineHeight: 1.5,
    maxWidth: 360,
    margin: 0,
  },
  totalDisplay: {
    fontSize: 36,
    fontWeight: 800,
    color: "#38bdf8",
    fontFamily: "monospace",
  },
  hint: {
    fontSize: 13,
    color: "var(--text-muted)",
    textAlign: "center",
    margin: 0,
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
  gatewayBadge: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "8px 0",
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
  payBtn: {
    width: "100%",
    minHeight: 52,
    padding: "12px 24px",
    backgroundColor: "#3b82f6",
    border: "none",
    borderRadius: 12,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    transition: "background 0.15s",
  },
  disabledBtn: {
    opacity: 0.5,
    cursor: "not-allowed",
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
    WebkitTapHighlightColor: "transparent",
  },
};
