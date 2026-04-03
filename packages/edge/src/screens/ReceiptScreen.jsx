import React, { useState, useEffect } from "react";
import { useOrder } from "../contexts/OrderContext.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { db } from "../db/index.js";
import { formatINR } from "@swiftserve/shared";

const styles = {
  wrapper: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    display: "flex",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  leftPanel: {
    flex: "0 0 60%",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: 24,
    overflow: "auto",
    boxSizing: "border-box",
  },
  rightPanel: {
    flex: "0 0 40%",
    display: "flex",
    flexDirection: "column",
    padding: 24,
    borderLeft: "1px solid var(--border)",
    overflow: "auto",
    boxSizing: "border-box",
    gap: 16,
    justifyContent: "center",
  },
  receipt: {
    background: "#ffffff",
    color: "#111827",
    width: 300,
    borderRadius: 8,
    padding: "24px 20px",
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: 12,
    lineHeight: 1.6,
    boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
    boxSizing: "border-box",
  },
  receiptCenter: {
    textAlign: "center",
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: 800,
    marginBottom: 2,
    textAlign: "center",
    color: "#111827",
  },
  receiptAddress: {
    fontSize: 10,
    color: "#4b5563",
    textAlign: "center",
    marginBottom: 2,
  },
  receiptGstin: {
    fontSize: 10,
    color: "#4b5563",
    textAlign: "center",
    marginBottom: 8,
  },
  receiptMeta: {
    fontSize: 11,
    color: "#374151",
    marginBottom: 2,
  },
  hr: {
    border: "none",
    borderTop: "1px dashed #9ca3af",
    margin: "8px 0",
  },
  itemRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 11,
    padding: "2px 0",
    color: "#111827",
  },
  itemName: {
    flex: 1,
    paddingRight: 8,
    wordBreak: "break-word",
  },
  itemQtyPrice: {
    fontSize: 10,
    color: "#6b7280",
    paddingLeft: 22,
    marginTop: -2,
    marginBottom: 2,
  },
  itemTotal: {
    textAlign: "right",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 11,
    padding: "2px 0",
    color: "#374151",
  },
  grandTotalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 14,
    fontWeight: 800,
    padding: "4px 0",
    color: "#111827",
  },
  paymentInfo: {
    fontSize: 11,
    color: "#374151",
    padding: "2px 0",
  },
  feedbackBox: {
    border: "1px dashed #9ca3af",
    borderRadius: 6,
    padding: "10px 8px",
    margin: "8px auto",
    textAlign: "center",
    maxWidth: 220,
  },
  feedbackTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: "#374151",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  feedbackUrl: {
    fontSize: 8,
    fontFamily: "'Courier New', Courier, monospace",
    color: "#6b7280",
    wordBreak: "break-all",
    lineHeight: 1.4,
  },
  thankYou: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: 600,
    color: "#374151",
    marginTop: 8,
  },
  primaryBtn: {
    width: "100%",
    height: 56,
    minHeight: 44,
    borderRadius: 12,
    border: "none",
    background: "#38bdf8",
    color: "var(--bg-primary)",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  secondaryBtn: {
    width: "100%",
    height: 48,
    minHeight: 44,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    position: "relative",
  },
  statusCard: {
    background: "var(--bg-secondary)",
    borderRadius: 12,
    border: "1px solid var(--border)",
    padding: 20,
    boxSizing: "border-box",
  },
  statusRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
  },
  statusLabel: {
    fontSize: 13,
    color: "var(--text-muted)",
    fontWeight: 500,
  },
  statusValue: {
    fontSize: 14,
    color: "#22c55e",
    fontWeight: 700,
    fontFamily: "monospace",
  },
  loadingContainer: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    fontSize: 16,
  },
};

export default function ReceiptScreen({ onNewOrder }) {
  const order = useOrder();
  const auth = useAuth();
  const [invoice, setInvoice] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!order.orderId) {
        setLoading(false);
        return;
      }

      try {
        const [inv, items, pay] = await Promise.all([
          db.invoices.where("order_id").equals(order.orderId).first(),
          db.order_items.where("order_id").equals(order.orderId).filter((i) => !i.is_void).toArray(),
          db.payments.where("order_id").equals(order.orderId).filter(p => !p.is_refund).toArray(),
        ]);

        if (!cancelled) {
          setInvoice(inv || null);
          setOrderItems(items || []);
          setPayments(pay || []);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load receipt data:", err);
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [order.orderId]);

  if (loading) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.loadingContainer}>Loading receipt...</div>
      </div>
    );
  }

  const invoiceDate = invoice
    ? new Date(invoice.created_at).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "--";

  return (
    <div style={styles.wrapper}>
      {/* Left Panel — Thermal Receipt Mockup */}
      <div style={styles.leftPanel}>
        <div style={styles.receipt} data-receipt>
          {/* Header */}
          <div style={styles.restaurantName}>
            {invoice ? invoice.seller_name : "SwiftServe Restaurant"}
          </div>
          <div style={styles.receiptAddress}>
            {invoice ? invoice.seller_address : ""}
          </div>
          {invoice && invoice.seller_gstin && (
            <div style={styles.receiptGstin}>
              GSTIN: {invoice.seller_gstin}
            </div>
          )}

          <div style={styles.hr} />

          {/* Invoice info */}
          <div style={styles.receiptMeta}>
            Invoice: {invoice ? invoice.invoice_number : "--"}
          </div>
          <div style={styles.receiptMeta}>Date: {invoiceDate}</div>
          <div style={styles.receiptMeta}>
            Order #{order.orderNumber || "--"}
          </div>

          <div style={styles.hr} />

          {/* Items */}
          {orderItems.map((item) => (
            <div key={item.id}>
              <div style={styles.itemRow}>
                <span style={styles.itemName}>{item.name}</span>
                <span style={styles.itemTotal}>
                  {formatINR(item.line_total)}
                </span>
              </div>
              <div style={styles.itemQtyPrice}>
                {item.quantity} x {formatINR(item.effective_price)}
              </div>
            </div>
          ))}

          <div style={styles.hr} />

          {/* Totals */}
          <div style={styles.totalRow}>
            <span>Subtotal</span>
            <span>{invoice ? formatINR(invoice.subtotal) : "--"}</span>
          </div>
          <div style={styles.totalRow}>
            <span>CGST</span>
            <span>{invoice ? formatINR(invoice.cgst_total) : "--"}</span>
          </div>
          <div style={styles.totalRow}>
            <span>SGST</span>
            <span>{invoice ? formatINR(invoice.sgst_total) : "--"}</span>
          </div>
          {invoice && invoice.round_off !== 0 && (
            <div style={styles.totalRow}>
              <span>Round-off</span>
              <span>
                {invoice.round_off > 0 ? "+" : ""}
                {formatINR(invoice.round_off)}
              </span>
            </div>
          )}

          <div style={styles.hr} />

          <div style={styles.grandTotalRow}>
            <span>GRAND TOTAL</span>
            <span>{invoice ? formatINR(invoice.grand_total) : "--"}</span>
          </div>

          <div style={styles.hr} />

          {/* Payment info */}
          {payments.map((p, i) => (
            <div key={p.id || i}>
              <div style={styles.paymentInfo}>
                Payment {payments.length > 1 ? `#${i + 1}` : ""}: {(p.method || "cash").toUpperCase()}
                {" — "}{formatINR(p.amount)}
              </div>
              {p.method === "cash" && p.cash_tendered != null && (
                <>
                  <div style={styles.paymentInfo}>
                    Tendered: {formatINR(p.cash_tendered)}
                  </div>
                  <div style={styles.paymentInfo}>
                    Change: {formatINR(p.cash_change)}
                  </div>
                </>
              )}
              {p.method === "upi" && p.gateway_txn_id && (
                <div style={styles.paymentInfo}>UTR: {p.gateway_txn_id}</div>
              )}
            </div>
          ))}

          <div style={styles.hr} />

          {/* Feedback QR placeholder */}
          <div style={styles.feedbackBox}>
            <div style={styles.feedbackTitle}>Scan to rate your experience</div>
            <div style={styles.feedbackUrl}>
              {`https://swiftserve.app/feedback/${order.orderId || "---"}`}
            </div>
          </div>

          <div style={styles.hr} />

          <div style={styles.thankYou}>Thank you! Visit again.</div>
        </div>
      </div>

      {/* Right Panel — Actions */}
      <div style={styles.rightPanel}>
        {/* Status card */}
        <div style={styles.statusCard}>
          <div style={styles.statusRow}>
            <span style={styles.statusLabel}>Invoice</span>
            <span style={styles.statusValue}>
              {invoice
                ? `${invoice.invoice_number} generated`
                : "Pending"}
            </span>
          </div>
          <div style={styles.statusRow}>
            <span style={styles.statusLabel}>Order</span>
            <span style={{ ...styles.statusValue, color: "#38bdf8" }}>
              #{order.orderNumber || "--"}
            </span>
          </div>
          <div style={styles.statusRow}>
            <span style={styles.statusLabel}>Payment</span>
            <span style={styles.statusValue}>
              {payments.length > 0 ? "Received" : "Pending"}
            </span>
          </div>
        </div>

        {/* New Order button */}
        <button
          type="button"
          style={styles.primaryBtn}
          onClick={() => {
            order.resetOrder();
            onNewOrder();
          }}
        >
          New Order
        </button>

        {/* Print Receipt */}
        <button
          type="button"
          style={styles.secondaryBtn}
          disabled={printing}
          onClick={() => {
            setPrinting(true);
            // Use a small delay so React can update the button state
            setTimeout(() => {
              window.print();
              setPrinting(false);
            }, 100);
          }}
        >
          {printing ? "Printing..." : "Print Receipt"}
        </button>
      </div>
    </div>
  );
}
