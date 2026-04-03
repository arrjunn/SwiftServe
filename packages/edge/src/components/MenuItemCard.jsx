import React from "react";
import { toRupees, formatINR, FOOD_TYPE_DISPLAY } from "@swiftserve/shared";

const styles = {
  card: {
    position: "relative",
    minWidth: 140,
    minHeight: 120,
    background: "var(--bg-secondary)",
    borderRadius: 12,
    border: "1px solid var(--border)",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    cursor: "pointer",
    userSelect: "none",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    transition: "background 0.12s, border-color 0.12s, transform 0.08s",
    overflow: "hidden",
    boxSizing: "border-box",
  },
  cardUnavailable: {
    opacity: 0.45,
    cursor: "not-allowed",
    filter: "grayscale(0.6)",
  },
  cardHasQty: {
    borderColor: "#38bdf8",
    background: "var(--bg-secondary)",
  },
  topRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
  },
  name: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-primary)",
    lineHeight: "18px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    flex: 1,
  },
  foodTypeIndicator: {
    fontSize: 14,
    lineHeight: "18px",
    flexShrink: 0,
    marginLeft: 4,
  },
  bottomRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 8,
  },
  price: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text-secondary)",
  },
  gstBadge: {
    fontSize: 10,
    fontWeight: 600,
    color: "var(--text-muted)",
    background: "var(--bg-primary)",
    borderRadius: 4,
    padding: "2px 6px",
    whiteSpace: "nowrap",
  },
  qtyBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    background: "#38bdf8",
    color: "var(--bg-primary)",
    fontSize: 13,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 6px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
  },
  unavailableLabel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    background: "rgba(15, 23, 42, 0.85)",
    color: "#ef4444",
    fontSize: 11,
    fontWeight: 700,
    textAlign: "center",
    padding: "3px 0",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
};

export default function MenuItemCard({ item, onAdd, qty = 0 }) {
  const { id, name, price, food_type, is_available, tax_rate } = item;

  const available = Boolean(is_available);
  const foodDisplay = FOOD_TYPE_DISPLAY[food_type];

  const handleTap = () => {
    if (!available || !onAdd) return;
    onAdd(item);
  };

  const gstPercent =
    tax_rate != null ? (tax_rate / 100).toFixed(0) : null;

  return (
    <div
      role="button"
      tabIndex={available ? 0 : -1}
      aria-disabled={!available}
      aria-label={`${name}, ${formatINR(price)}${qty > 0 ? `, ${qty} in cart` : ""}`}
      style={{
        ...styles.card,
        ...(!available ? styles.cardUnavailable : {}),
        ...(qty > 0 && available ? styles.cardHasQty : {}),
      }}
      onClick={handleTap}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleTap();
        }
      }}
      onPointerDown={(e) => {
        if (!available) return;
        e.currentTarget.style.transform = "scale(0.96)";
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {/* Quantity badge */}
      {qty > 0 && <div style={styles.qtyBadge}>{qty}</div>}

      {/* Top: name + food type */}
      <div style={styles.topRow}>
        <div style={styles.name}>{name}</div>
        {foodDisplay && (
          <span
            style={{
              ...styles.foodTypeIndicator,
              color: foodDisplay.color,
            }}
            title={foodDisplay.label}
          >
            {foodDisplay.symbol}
          </span>
        )}
      </div>

      {/* Bottom: price + GST badge */}
      <div style={styles.bottomRow}>
        <span style={styles.price}>{formatINR(price)}</span>
        {gstPercent != null && (
          <span style={styles.gstBadge}>{gstPercent}% GST</span>
        )}
      </div>

      {/* Unavailable overlay label */}
      {!available && <div style={styles.unavailableLabel}>Unavailable</div>}
    </div>
  );
}
