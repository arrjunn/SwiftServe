import { useState, useEffect, useMemo, useCallback } from "react";
import { v4 as uuid } from "uuid";
import { useAuth } from "../contexts/AuthContext.jsx";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { modifyOrder } from "../db/orderOps.js";
import { formatINR, calculateGST, multiplyPaise, addPaise, roundToRupee, FOOD_TYPE_DISPLAY } from "@swiftserve/shared";

export default function OrderModifyScreen({ orderId, onModified, onBack }) {
  const auth = useAuth();
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]); // editable cart items
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Load order + menu data
  useEffect(() => {
    async function load() {
      try {
        const o = await db.orders.get(orderId);
        setOrder(o);

        const orderItems = await db.order_items
          .where("order_id").equals(orderId)
          .filter((i) => !i.is_void)
          .toArray();

        // Convert DB items to cart format
        const cartItems = orderItems.map((i) => ({
          id: uuid(),
          menuItemId: i.menu_item_id,
          name: i.name,
          foodType: i.food_type,
          qty: i.quantity,
          unitPrice: i.unit_price,
          taxRate: i.tax_rate,
          hsnCode: i.hsn_code,
          station: i.station,
        }));
        setItems(cartItems);

        const cats = await db.menu_categories
          .where("outlet_id").equals(OUTLET_ID)
          .filter((c) => c.is_active === 1)
          .sortBy("sort_order");
        setCategories(cats);
        if (cats.length > 0) setActiveCategory(cats[0].id);

        const menu = await db.menu_items
          .where("outlet_id").equals(OUTLET_ID)
          .filter((m) => m.is_active === 1 && m.is_available === 1)
          .toArray();
        setMenuItems(menu);
      } catch (err) {
        console.error("[MODIFY] Load failed:", err);
      } finally {
        setLoading(false);
      }
    }
    if (orderId) load();
  }, [orderId]);

  // Calculate totals
  const totals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;

    const computed = items.map((item) => {
      const lineTotal = multiplyPaise(item.unitPrice, item.qty);
      const gst = calculateGST(lineTotal, item.taxRate);
      subtotal += lineTotal;
      taxTotal += gst.totalTax;
      cgstTotal += gst.cgst;
      sgstTotal += gst.sgst;
      return { ...item, lineTotal, cgst: gst.cgst, sgst: gst.sgst, taxTotal: gst.totalTax };
    });

    const beforeRound = addPaise(subtotal, taxTotal);
    const { rounded: grandTotal, roundOff } = roundToRupee(beforeRound);

    return { items: computed, subtotal, taxTotal, cgstTotal, sgstTotal, roundOff, grandTotal };
  }, [items]);

  const addItem = useCallback((menuItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.menuItemId === menuItem.id);
      if (existing) {
        return prev.map((i) =>
          i.menuItemId === menuItem.id ? { ...i, qty: Math.min(i.qty + 1, 99) } : i
        );
      }
      return [...prev, {
        id: uuid(),
        menuItemId: menuItem.id,
        name: menuItem.name,
        foodType: menuItem.food_type,
        qty: 1,
        unitPrice: menuItem.price,
        taxRate: menuItem.tax_rate,
        hsnCode: menuItem.hsn_code,
        station: menuItem.station,
      }];
    });
  }, []);

  const updateQty = useCallback((id, qty) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, qty: Math.min(qty, 99) } : i));
    }
  }, []);

  const handleSave = async () => {
    if (items.length === 0) {
      setError("Cannot save order with no items.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await modifyOrder(orderId, totals.items, totals, auth.staff?.id);
      onModified();
    } catch (err) {
      setError(err.message || "Failed to modify order.");
    } finally {
      setSaving(false);
    }
  };

  const filteredMenu = activeCategory
    ? menuItems.filter((m) => m.category_id === activeCategory)
    : menuItems;

  if (loading) {
    return (
      <div style={styles.root}>
        <div style={styles.loadingText}>Loading order...</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={styles.root}>
        <div style={styles.loadingText}>Order not found.</div>
        <button style={styles.backBtn} onClick={onBack}>← Back</button>
      </div>
    );
  }

  const canModify = ["received", "preparing"].includes(order.status);

  return (
    <div style={styles.root}>
      {/* Left — Menu */}
      <div style={styles.leftPanel}>
        <div style={styles.panelHeader}>
          <button style={styles.backBtn} onClick={onBack}>← Back</button>
          <h2 style={styles.panelTitle}>Modify Order #{order.order_number}</h2>
        </div>

        {/* Category tabs */}
        <div style={styles.categoryTabs}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              style={{
                ...styles.catTab,
                ...(activeCategory === cat.id ? styles.catTabActive : {}),
              }}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Menu grid */}
        <div style={styles.menuGrid}>
          {filteredMenu.map((m) => {
            const ft = FOOD_TYPE_DISPLAY[m.food_type];
            return (
              <button key={m.id} style={styles.menuCard} onClick={() => addItem(m)}>
                <div style={styles.menuCardTop}>
                  {ft && <span style={{ ...styles.foodDot, color: ft.color }}>{ft.symbol}</span>}
                  <span style={styles.menuName}>{m.name}</span>
                </div>
                <span style={styles.menuPrice}>{formatINR(m.price)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right — Modified Cart */}
      <div style={styles.rightPanel}>
        <h3 style={styles.rightTitle}>Modified Items</h3>

        {items.length === 0 ? (
          <div style={styles.emptyCart}>No items</div>
        ) : (
          <div style={styles.itemList}>
            {items.map((item) => {
              const ft = FOOD_TYPE_DISPLAY[item.foodType];
              return (
                <div key={item.id} style={styles.cartItem}>
                  <div style={styles.cartItemTop}>
                    {ft && <span style={{ ...styles.foodDot, color: ft.color, fontSize: 10 }}>{ft.symbol}</span>}
                    <span style={styles.cartItemName}>{item.name}</span>
                  </div>
                  <div style={styles.cartItemBottom}>
                    <div style={styles.qtyControls}>
                      <button style={styles.qtyBtn} onClick={() => updateQty(item.id, item.qty - 1)}>-</button>
                      <span style={styles.qtyText}>{item.qty}</span>
                      <button style={styles.qtyBtn} onClick={() => updateQty(item.id, item.qty + 1)}>+</button>
                    </div>
                    <span style={styles.lineTotal}>{formatINR(multiplyPaise(item.unitPrice, item.qty))}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Totals */}
        <div style={styles.totalsSection}>
          <div style={styles.totalRow}>
            <span>Subtotal</span>
            <span>{formatINR(totals.subtotal)}</span>
          </div>
          <div style={styles.totalRow}>
            <span>GST</span>
            <span>{formatINR(totals.taxTotal)}</span>
          </div>
          {totals.roundOff !== 0 && (
            <div style={styles.totalRow}>
              <span>Round-off</span>
              <span>{totals.roundOff > 0 ? "+" : ""}{formatINR(totals.roundOff)}</span>
            </div>
          )}
          <div style={styles.grandTotalRow}>
            <span>Grand Total</span>
            <span>{formatINR(totals.grandTotal)}</span>
          </div>
        </div>

        {!canModify && (
          <div style={styles.warningBox}>
            Cannot modify order with status "{order.status}".
          </div>
        )}

        {error && <div style={styles.errorBox}>{error}</div>}

        <button
          style={{
            ...styles.saveBtn,
            ...(!canModify || saving || items.length === 0 ? styles.disabledBtn : {}),
          }}
          disabled={!canModify || saving || items.length === 0}
          onClick={handleSave}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  root: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    display: "flex",
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontFamily: "inherit",
  },
  loadingText: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    fontSize: 16,
  },
  leftPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderRight: "1px solid var(--border)",
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 20px",
    backgroundColor: "var(--bg-secondary)",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: 0,
  },
  backBtn: {
    minHeight: 40,
    minWidth: 44,
    padding: "6px 16px",
    backgroundColor: "transparent",
    border: "1px solid var(--border-light)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  categoryTabs: {
    display: "flex",
    gap: 4,
    padding: "10px 20px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
    overflowX: "auto",
  },
  catTab: {
    minHeight: 36,
    padding: "6px 16px",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
    whiteSpace: "nowrap",
  },
  catTabActive: {
    backgroundColor: "#6366f1",
    borderColor: "#6366f1",
    color: "#fff",
  },
  menuGrid: {
    flex: 1,
    overflowY: "auto",
    padding: 16,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 10,
    alignContent: "start",
  },
  menuCard: {
    backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    cursor: "pointer",
    touchAction: "manipulation",
    textAlign: "left",
  },
  menuCardTop: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  foodDot: {
    fontSize: 12,
    flexShrink: 0,
  },
  menuName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
  },
  menuPrice: {
    fontSize: 13,
    fontWeight: 700,
    color: "#38bdf8",
    fontFamily: "monospace",
  },
  rightPanel: {
    width: 340,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    padding: 16,
    overflow: "auto",
    gap: 8,
  },
  rightTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    margin: "0 0 4px 0",
  },
  emptyCart: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--border-light)",
    fontSize: 15,
  },
  itemList: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  cartItem: {
    backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  cartItemTop: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  cartItemName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
  },
  cartItemBottom: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  qtyControls: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    minWidth: 36,
    minHeight: 36,
    borderRadius: 8,
    border: "1px solid var(--border)",
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "manipulation",
  },
  qtyText: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-primary)",
    minWidth: 24,
    textAlign: "center",
  },
  lineTotal: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-primary)",
    fontFamily: "monospace",
  },
  totalsSection: {
    backgroundColor: "var(--bg-secondary)",
    borderRadius: 10,
    border: "1px solid var(--border)",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "2px 0",
  },
  grandTotalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 16,
    fontWeight: 800,
    color: "#38bdf8",
    padding: "6px 0 0 0",
    borderTop: "1px dashed var(--border)",
    marginTop: 4,
  },
  warningBox: {
    padding: "10px 14px",
    backgroundColor: "rgba(234,179,8,0.12)",
    border: "1px solid #ca8a04",
    borderRadius: 8,
    color: "#fbbf24",
    fontSize: 13,
    textAlign: "center",
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
  saveBtn: {
    width: "100%",
    minHeight: 52,
    padding: "12px 24px",
    backgroundColor: "#6366f1",
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
};
