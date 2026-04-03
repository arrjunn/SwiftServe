import React from "react";
import { formatINR } from "@swiftserve/shared";

const styles = {
  container: {
    background: "var(--bg-secondary)",
    borderRadius: 12,
    border: "1px solid var(--border)",
    padding: 16,
    width: "100%",
    boxSizing: "border-box",
  },
  header: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "5px 0",
  },
  label: {
    fontSize: 13,
    color: "var(--text-muted)",
    fontWeight: 500,
  },
  value: {
    fontSize: 13,
    color: "var(--text-secondary)",
    fontWeight: 600,
    fontFamily: "monospace",
  },
  divider: {
    borderTop: "1px dashed var(--border)",
    margin: "8px 0",
  },
  grandTotalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0 0 0",
  },
  grandTotalLabel: {
    fontSize: 15,
    color: "var(--text-primary)",
    fontWeight: 800,
  },
  grandTotalValue: {
    fontSize: 18,
    color: "#38bdf8",
    fontWeight: 800,
    fontFamily: "monospace",
  },
  discountLabel: {
    fontSize: 13,
    color: "#22c55e",
    fontWeight: 500,
  },
  discountValue: {
    fontSize: 13,
    color: "#22c55e",
    fontWeight: 600,
    fontFamily: "monospace",
  },
};

function LineItem({ label, value, labelStyle, valueStyle }) {
  return (
    <div style={styles.row}>
      <span style={{ ...styles.label, ...labelStyle }}>{label}</span>
      <span style={{ ...styles.value, ...valueStyle }}>{value}</span>
    </div>
  );
}

export default function BillSummary({
  subtotal = 0,
  taxTotal = 0,
  cgstTotal,
  sgstTotal,
  roundOff = 0,
  grandTotal = 0,
  itemCount = 0,
  discount = 0,
}) {
  // Use actual per-item accumulated CGST/SGST when available (accurate to the paise),
  // otherwise fall back to splitting taxTotal (can drift by 1 paise).
  const cgst = cgstTotal != null ? cgstTotal : Math.floor(taxTotal / 2);
  const sgst = sgstTotal != null ? sgstTotal : taxTotal - Math.floor(taxTotal / 2);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        Bill Summary {itemCount > 0 && `(${itemCount} item${itemCount !== 1 ? "s" : ""})`}
      </div>

      <LineItem label="Subtotal" value={formatINR(subtotal)} />

      {discount > 0 && (
        <LineItem
          label="Discount"
          value={`-${formatINR(discount)}`}
          labelStyle={styles.discountLabel}
          valueStyle={styles.discountValue}
        />
      )}

      <LineItem label="CGST" value={formatINR(cgst)} />
      <LineItem label="SGST" value={formatINR(sgst)} />

      {roundOff !== 0 && (
        <LineItem
          label="Round-off"
          value={`${roundOff > 0 ? "+" : ""}${formatINR(roundOff)}`}
        />
      )}

      <div style={styles.divider} />

      <div style={styles.grandTotalRow}>
        <span style={styles.grandTotalLabel}>Grand Total</span>
        <span style={styles.grandTotalValue}>{formatINR(grandTotal)}</span>
      </div>
    </div>
  );
}
