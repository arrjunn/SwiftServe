import React, { useState } from "react";
import { formatINR } from "@swiftserve/shared";

const styles = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)", display: "flex",
    alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  modal: {
    backgroundColor: "var(--bg-secondary)", borderRadius: 16, padding: 24,
    width: "100%", maxWidth: 400, maxHeight: "80vh", overflow: "auto",
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
  },
  title: { margin: "0 0 4px 0", fontSize: 18, fontWeight: 700, color: "var(--text-primary)" },
  subtitle: { margin: "0 0 16px 0", fontSize: 13, color: "var(--text-muted)" },
  sectionLabel: {
    fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase",
    letterSpacing: 0.5, margin: "12px 0 6px 0",
  },
  option: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)",
    backgroundColor: "var(--bg-primary)", cursor: "pointer", marginBottom: 6,
    touchAction: "manipulation", minHeight: 44,
  },
  optionSelected: {
    borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.1)",
  },
  optionName: { fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" },
  optionPrice: { fontSize: 14, fontWeight: 700, color: "#38bdf8", fontFamily: "monospace" },
  totalRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 0", borderTop: "1px solid var(--border)", marginTop: 12,
  },
  totalLabel: { fontSize: 14, fontWeight: 600, color: "var(--text-muted)" },
  totalValue: { fontSize: 18, fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" },
  addBtn: {
    width: "100%", padding: "14px 0", borderRadius: 10, border: "none",
    backgroundColor: "#22c55e", color: "#fff", fontSize: 16, fontWeight: 700,
    cursor: "pointer", touchAction: "manipulation", marginTop: 12,
  },
  cancelBtn: {
    width: "100%", padding: "10px 0", border: "none", backgroundColor: "transparent",
    color: "var(--text-dim)", fontSize: 13, cursor: "pointer", textDecoration: "underline",
    marginTop: 6,
  },
  checkmark: { color: "#38bdf8", fontWeight: 700, marginRight: 8 },
};

/**
 * Modal picker for item variants and add-ons.
 * Variants: pick ONE (radio). Add-ons: pick MANY (checkbox).
 *
 * Props:
 *   item — menu item with variants/addons JSON arrays
 *   onAdd(item, selectedVariant, selectedAddons) — callback
 *   onClose — dismiss
 */
export default function VariantAddonPicker({ item, onAdd, onClose }) {
  const variants = parseJSON(item.variants);
  const addons = parseJSON(item.addons);

  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedAddons, setSelectedAddons] = useState([]);

  const variantAdd = selectedVariant ? (selectedVariant.price_add || selectedVariant.price || 0) : 0;
  const addonTotal = selectedAddons.reduce((s, a) => s + (a.price || 0), 0);
  const totalPrice = item.price + variantAdd + addonTotal;

  const toggleAddon = (addon) => {
    const exists = selectedAddons.find((a) => a.name === addon.name);
    if (exists) {
      setSelectedAddons(selectedAddons.filter((a) => a.name !== addon.name));
    } else {
      setSelectedAddons([...selectedAddons, addon]);
    }
  };

  const handleAdd = () => {
    onAdd(item, selectedVariant, selectedAddons);
    onClose();
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>{item.name}</h3>
        <p style={styles.subtitle}>Base price: {formatINR(item.price)}</p>

        {variants.length > 0 && (
          <>
            <div style={styles.sectionLabel}>Choose Variant</div>
            {variants.map((v, i) => {
              const isSelected = selectedVariant?.name === v.name;
              return (
                <div
                  key={i}
                  style={{ ...styles.option, ...(isSelected ? styles.optionSelected : {}) }}
                  onClick={() => setSelectedVariant(isSelected ? null : v)}
                >
                  <span style={styles.optionName}>
                    {isSelected && <span style={styles.checkmark}>&#10003;</span>}
                    {v.name}
                  </span>
                  <span style={styles.optionPrice}>
                    +{formatINR(v.price_add || v.price || 0)}
                  </span>
                </div>
              );
            })}
          </>
        )}

        {addons.length > 0 && (
          <>
            <div style={styles.sectionLabel}>Add-ons</div>
            {addons.map((a, i) => {
              const isSelected = selectedAddons.some((sa) => sa.name === a.name);
              return (
                <div
                  key={i}
                  style={{ ...styles.option, ...(isSelected ? styles.optionSelected : {}) }}
                  onClick={() => toggleAddon(a)}
                >
                  <span style={styles.optionName}>
                    {isSelected && <span style={styles.checkmark}>&#10003;</span>}
                    {a.name}
                  </span>
                  <span style={styles.optionPrice}>
                    +{formatINR(a.price || 0)}
                  </span>
                </div>
              );
            })}
          </>
        )}

        <div style={styles.totalRow}>
          <span style={styles.totalLabel}>Total</span>
          <span style={styles.totalValue}>{formatINR(totalPrice)}</span>
        </div>

        <button style={styles.addBtn} onClick={handleAdd}>
          Add to Cart — {formatINR(totalPrice)}
        </button>
        <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function parseJSON(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}
