import { useOrder } from "../contexts/OrderContext.jsx";
import { formatINR, FOOD_TYPE_DISPLAY } from "@swiftserve/shared";

export default function KioskCartScreen({ onPay, onBackToMenu }) {
  const order = useOrder();

  const isEmpty = order.items.length === 0;

  if (isEmpty) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.emptyContainer}>
          <div style={styles.emptyIcon}>🛒</div>
          <h1 style={styles.emptyTitle}>Your cart is empty</h1>
          <p style={styles.emptyText}>Add some delicious items from our menu!</p>
          <button style={styles.browseBtn} onClick={onBackToMenu}>
            Browse Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.content}>
        {/* Header */}
        <h1 style={styles.title}>Your Order</h1>

        {/* Items List */}
        <div style={styles.itemsList}>
          {order.items.map((item) => {
            const foodInfo = FOOD_TYPE_DISPLAY[item.foodType] || FOOD_TYPE_DISPLAY.veg;
            const lineTotal = item.unitPrice * item.qty;

            return (
              <div key={item.id} style={styles.itemCard}>
                <div style={styles.itemTop}>
                  {/* Veg/Non-veg indicator */}
                  <span style={{ ...styles.foodBadge, borderColor: foodInfo.color }}>
                    <span style={{ color: foodInfo.color, fontSize: 10 }}>{foodInfo.symbol}</span>
                  </span>

                  {/* Name & price per item */}
                  <div style={styles.itemInfo}>
                    <span style={styles.itemName}>{item.name}</span>
                    {item.variantName && (
                      <span style={styles.variantText}>{item.variantName}</span>
                    )}
                    <span style={styles.itemUnitPrice}>{formatINR(item.unitPrice)} each</span>
                  </div>

                  {/* Line total */}
                  <span style={styles.lineTotal}>{formatINR(lineTotal)}</span>
                </div>

                <div style={styles.itemActions}>
                  {/* Qty controls */}
                  <div style={styles.qtyGroup}>
                    <button
                      style={styles.qtyBtn}
                      onClick={() => order.updateQty(item.id, item.qty - 1)}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span style={styles.qtyValue}>{item.qty}</span>
                    <button
                      style={styles.qtyBtn}
                      onClick={() => order.updateQty(item.id, item.qty + 1)}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>

                  {/* Remove */}
                  <button
                    style={styles.removeBtn}
                    onClick={() => order.removeItem(item.id)}
                    aria-label={`Remove ${item.name}`}
                  >
                    ✕ Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bill Summary */}
        <div style={styles.billCard}>
          <h2 style={styles.billTitle}>Bill Summary</h2>
          <div style={styles.billRow}>
            <span>Subtotal</span>
            <span>{formatINR(order.subtotal)}</span>
          </div>
          {order.discountAmount > 0 && (
            <div style={{ ...styles.billRow, color: "#22c55e" }}>
              <span>Discount</span>
              <span>-{formatINR(order.discountAmount)}</span>
            </div>
          )}
          <div style={styles.billRow}>
            <span>GST</span>
            <span>{formatINR(order.taxTotal)}</span>
          </div>
          {order.roundOff !== 0 && (
            <div style={{ ...styles.billRow, fontSize: 13, color: "#9ca3af" }}>
              <span>Round off</span>
              <span>{order.roundOff > 0 ? "+" : ""}{formatINR(order.roundOff)}</span>
            </div>
          )}
          <div style={styles.billTotal}>
            <span>Total</span>
            <span>{formatINR(order.grandTotal)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <button style={styles.payBtn} onClick={onPay}>
          Proceed to Pay &nbsp;·&nbsp; {formatINR(order.grandTotal)}
        </button>

        <button style={styles.backBtn} onClick={onBackToMenu}>
          ← Back to Menu
        </button>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "#ffffff",
    display: "flex",
    flexDirection: "column",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    overflowY: "auto",
  },
  content: {
    maxWidth: 560,
    width: "100%",
    margin: "0 auto",
    padding: "24px 20px 40px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    boxSizing: "border-box",
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    color: "#111827",
    margin: 0,
    textAlign: "center",
  },

  /* ---- Items List ---- */
  itemsList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  itemCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 16,
    border: "1px solid #e5e7eb",
  },
  itemTop: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  foodBadge: {
    width: 18,
    height: 18,
    borderRadius: 4,
    border: "2px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  itemInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 600,
    color: "#111827",
  },
  variantText: {
    fontSize: 13,
    color: "#6b7280",
    fontStyle: "italic",
  },
  itemUnitPrice: {
    fontSize: 13,
    color: "#6b7280",
  },
  lineTotal: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
    flexShrink: 0,
    marginTop: 2,
  },
  itemActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  qtyGroup: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  qtyBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#22c55e",
    border: "none",
    color: "#ffffff",
    fontSize: 22,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "manipulation",
    lineHeight: 1,
  },
  qtyValue: {
    minWidth: 36,
    textAlign: "center",
    fontSize: 18,
    fontWeight: 700,
    color: "#111827",
  },
  removeBtn: {
    minHeight: 44,
    padding: "8px 16px",
    backgroundColor: "transparent",
    border: "1px solid #ef4444",
    borderRadius: 10,
    color: "#ef4444",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },

  /* ---- Bill Summary ---- */
  billCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 20,
    border: "1px solid #e5e7eb",
    marginTop: 8,
  },
  billTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#374151",
    margin: "0 0 12px 0",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  billRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 15,
    color: "#374151",
    padding: "4px 0",
  },
  billTotal: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 20,
    fontWeight: 800,
    color: "#111827",
    borderTop: "2px solid #e5e7eb",
    marginTop: 8,
    paddingTop: 12,
  },

  /* ---- Buttons ---- */
  payBtn: {
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
    letterSpacing: 0.3,
  },
  backBtn: {
    width: "100%",
    minHeight: 56,
    padding: "14px 24px",
    backgroundColor: "transparent",
    border: "2px solid #e5e7eb",
    borderRadius: 14,
    color: "#6b7280",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },

  /* ---- Empty State ---- */
  emptyContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    margin: 0,
  },
  browseBtn: {
    minHeight: 56,
    padding: "14px 40px",
    backgroundColor: "#22c55e",
    border: "none",
    borderRadius: 14,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
    marginTop: 12,
  },
};
