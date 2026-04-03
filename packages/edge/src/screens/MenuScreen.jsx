import { useState, useEffect } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { useOrder } from "../contexts/OrderContext.jsx";
import MenuItemCard from "../components/MenuItemCard.jsx";
import VariantAddonPicker from "../components/VariantAddonPicker.jsx";
import { formatINR, multiplyPaise } from "@swiftserve/shared";

export default function MenuScreen({ onProceedToCart, onCancel }) {
  const {
    items,
    orderType,
    orderSource,
    tableId,
    orderId,
    subtotal,
    addItem,
    removeItem,
    updateQty,
    setOrderType,
    setOrderSource,
    setTable,
    resetOrder,
  } = useOrder();

  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pickerItem, setPickerItem] = useState(null);
  const [menuLoading, setMenuLoading] = useState(true);
  const [floorTables, setFloorTables] = useState([]);

  // Load categories and menu items
  useEffect(() => {
    let cancelled = false;
    setMenuLoading(true);

    async function load() {
      const cats = await db.menu_categories
        .where({ outlet_id: OUTLET_ID })
        .sortBy("sort_order");

      const allItems = await db.menu_items
        .where({ outlet_id: OUTLET_ID, is_active: 1 })
        .toArray();

      // Load available tables for dine-in
      const tables = await db.floor_tables
        .where("outlet_id").equals(OUTLET_ID)
        .filter(t => t.status === "available" && !t.deleted_at)
        .toArray();
      setFloorTables(tables);

      if (cancelled) return;

      setCategories(cats);
      setMenuItems(allItems);
      if (cats.length > 0 && !activeCategoryId) {
        setActiveCategoryId(cats[0].id);
      }
      setMenuLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // When searching, show all categories (ignore active category filter)
  const effectiveCategoryId = searchQuery ? null : activeCategoryId;

  const filteredItems = menuItems.filter((item) => {
    if (effectiveCategoryId && item.category_id !== effectiveCategoryId) return false;
    if (searchQuery) {
      return item.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  const handleCancel = () => {
    if (items.length > 0 && !window.confirm("Cancel this order? All items will be removed.")) return;
    // Only reset if this is a new draft order. Resumed orders (with orderId)
    // stay in DB as "received" — user can modify or cancel from order queue.
    if (!orderId) {
      resetOrder();
    }
    if (onCancel) onCancel();
  };

  return (
    <div style={styles.root}>
      {/* ─── Top Bar ────────────────────────────────── */}
      <div style={styles.topBar}>
        <div style={styles.topLeft}>
          <button
            style={styles.backButton}
            onClick={handleCancel}
          >
            &larr; Back
          </button>
          <span style={styles.topTitle}>Menu &middot; New Order</span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Order source */}
          <div style={styles.orderTypeToggle}>
            {[["counter","Counter"],["zomato","Zomato"],["swiggy","Swiggy"]].map(([src, label]) => (
              <button
                key={src}
                style={{
                  ...styles.orderTypeButton,
                  ...(orderSource === src ? { backgroundColor: src === "zomato" ? "#ef4444" : src === "swiggy" ? "#f97316" : "#3b82f6", color: "#fff" } : {}),
                }}
                onClick={() => setOrderSource(src)}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Order type */}
          <div style={styles.orderTypeToggle}>
            {["dine_in", "takeaway"].map((type) => (
              <button
                key={type}
                style={{
                  ...styles.orderTypeButton,
                  ...(orderType === type ? styles.orderTypeButtonActive : {}),
                }}
                onClick={() => { setOrderType(type); if (type === "takeaway") setTable(null); }}
              >
                {type === "dine_in" ? "Dine-in" : "Takeaway"}
              </button>
            ))}
          </div>
          {/* Table picker for dine-in */}
          {orderType === "dine_in" && floorTables.length > 0 && (
            <select
              value={tableId || ""}
              onChange={(e) => setTable(e.target.value || null)}
              style={{ height: 40, padding: "0 10px", backgroundColor: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, minWidth: 80 }}
            >
              <option value="">Table</option>
              {floorTables.map(t => (
                <option key={t.id} value={t.id}>{t.table_number}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ─── Body ───────────────────────────────────── */}
      <div style={styles.body}>
        {/* ── Category Sidebar ──────────────────────── */}
        <div style={styles.categorySidebar}>
          <button
            style={{
              ...styles.categoryTab,
              ...(effectiveCategoryId === null ? styles.categoryTabActive : {}),
            }}
            onClick={() => {
              setActiveCategoryId(null);
              setSearchQuery("");
            }}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              style={{
                ...styles.categoryTab,
                ...(effectiveCategoryId === cat.id ? styles.categoryTabActive : {}),
              }}
              onClick={() => {
                setActiveCategoryId(cat.id);
                setSearchQuery("");
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* ── Center: Search + Grid ─────────────────── */}
        <div style={styles.center}>
          {/* Search */}
          <div style={styles.searchBar}>
            <input
              type="text"
              placeholder="Search menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
            {searchQuery && (
              <button
                style={styles.searchClear}
                onClick={() => setSearchQuery("")}
              >
                X
              </button>
            )}
          </div>

          {/* Menu Grid */}
          <div style={styles.menuGrid}>
            {filteredItems.length === 0 ? (
              <div style={styles.emptyState}>
                No items found.
              </div>
            ) : (
              filteredItems.map((item) => {
                const inCart = items.filter((ci) => ci.menuItemId === item.id);
                const totalQty = inCart.reduce((s, ci) => s + ci.qty, 0);
                const hasCustomizations = hasVariantsOrAddons(item);
                return (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    qty={totalQty}
                    onAdd={() => {
                      if (hasCustomizations) {
                        setPickerItem(item);
                      } else {
                        addItem(item);
                      }
                    }}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* ── Right Mini-Cart ───────────────────────── */}
        <div style={styles.cartPanel}>
          <h3 style={styles.cartTitle}>
            Cart ({items.length})
          </h3>

          <div style={styles.cartItems}>
            {items.length === 0 ? (
              <div style={styles.cartEmpty}>
                No items added yet.
              </div>
            ) : (
              items.map((ci) => (
                <div key={ci.id} style={styles.cartItem}>
                  <div style={styles.cartItemName}>{ci.shortName || ci.name}</div>
                  <div style={styles.cartItemControls}>
                    <button
                      style={styles.qtyButton}
                      onClick={() => updateQty(ci.id, ci.qty - 1)}
                    >
                      -
                    </button>
                    <span style={styles.qtyValue}>{ci.qty}</span>
                    <button
                      style={styles.qtyButton}
                      onClick={() => updateQty(ci.id, ci.qty + 1)}
                    >
                      +
                    </button>
                  </div>
                  <div style={styles.cartItemPrice}>
                    {formatINR(multiplyPaise(ci.unitPrice, ci.qty))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Footer */}
          <div style={styles.cartFooter}>
            <div style={styles.subtotalRow}>
              <span>Subtotal</span>
              <span style={{ fontWeight: 700 }}>{formatINR(subtotal)}</span>
            </div>

            {items.length > 0 && (
              <button
                style={styles.proceedButton}
                onClick={onProceedToCart}
                onPointerDown={(e) => {
                  e.currentTarget.style.transform = "scale(0.97)";
                  e.currentTarget.style.backgroundColor = "#2563eb";
                }}
                onPointerUp={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.backgroundColor = "#3b82f6";
                }}
                onPointerLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.backgroundColor = "#3b82f6";
                }}
              >
                Proceed to Cart &rarr;
              </button>
            )}

            <button
              style={styles.cancelTextButton}
              onClick={handleCancel}
            >
              Cancel Order
            </button>
          </div>
        </div>
      </div>
      {pickerItem && (
        <VariantAddonPicker
          item={pickerItem}
          onAdd={(item, variant, addons) => addItem(item, variant, addons)}
          onClose={() => setPickerItem(null)}
        />
      )}
    </div>
  );
}

function hasVariantsOrAddons(item) {
  const parse = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
  };
  return parse(item.variants).length > 0 || parse(item.addons).length > 0;
}

const styles = {
  root: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "var(--bg-primary)",
    display: "flex",
    flexDirection: "column",
    color: "var(--text-primary)",
    fontFamily: "inherit",
  },

  /* ── Top Bar ─────────────────────────── */
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 20px",
    backgroundColor: "var(--bg-secondary)",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  topLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    minHeight: 40,
    minWidth: 44,
    padding: "6px 14px",
    backgroundColor: "transparent",
    border: "1px solid var(--border-light)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  topTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  orderTypeToggle: {
    display: "flex",
    gap: 0,
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  },
  orderTypeButton: {
    minHeight: 40,
    padding: "8px 20px",
    backgroundColor: "transparent",
    border: "none",
    borderRight: "1px solid var(--border)",
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
    transition: "background-color 0.12s, color 0.12s",
  },
  orderTypeButtonActive: {
    backgroundColor: "#3b82f6",
    color: "#ffffff",
  },

  /* ── Body ────────────────────────────── */
  body: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
  },

  /* ── Category Sidebar ────────────────── */
  categorySidebar: {
    width: 180,
    flexShrink: 0,
    backgroundColor: "var(--bg-secondary)",
    borderRight: "1px solid var(--border)",
    overflowY: "auto",
    padding: "8px 0",
    display: "flex",
    flexDirection: "column",
  },
  categoryTab: {
    minHeight: 48,
    padding: "12px 16px",
    backgroundColor: "transparent",
    border: "none",
    borderLeft: "3px solid transparent",
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 600,
    textAlign: "left",
    cursor: "pointer",
    touchAction: "manipulation",
    transition: "background-color 0.12s, color 0.12s, border-color 0.12s",
  },
  categoryTabActive: {
    backgroundColor: "rgba(59,130,246,0.1)",
    borderLeftColor: "#3b82f6",
    color: "var(--text-primary)",
  },

  /* ── Center (search + grid) ──────────── */
  center: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  searchBar: {
    padding: "12px 20px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
    position: "relative",
  },
  searchInput: {
    width: "100%",
    height: 44,
    padding: "0 40px 0 16px",
    backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 22,
    color: "var(--text-primary)",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
  },
  searchClear: {
    position: "absolute",
    right: 28,
    top: "50%",
    transform: "translateY(-50%)",
    width: 28,
    height: 28,
    backgroundColor: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "manipulation",
  },
  menuGrid: {
    flex: 1,
    overflowY: "auto",
    padding: 20,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 12,
    alignContent: "start",
  },
  emptyState: {
    gridColumn: "1 / -1",
    textAlign: "center",
    color: "var(--text-dim)",
    fontSize: 15,
    padding: 40,
  },

  /* ── Right Cart Panel ────────────────── */
  cartPanel: {
    width: 200,
    flexShrink: 0,
    backgroundColor: "var(--bg-secondary)",
    borderLeft: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
  },
  cartTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    margin: 0,
    padding: "14px 14px 10px",
    borderBottom: "1px solid var(--border)",
  },
  cartItems: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 10px",
  },
  cartEmpty: {
    color: "var(--border-light)",
    fontSize: 13,
    textAlign: "center",
    padding: "24px 0",
  },
  cartItem: {
    padding: "8px 4px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  cartItemName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  cartItemControls: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  qtyButton: {
    width: 30,
    height: 30,
    borderRadius: 6,
    border: "1px solid var(--border-light)",
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  qtyValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-primary)",
    minWidth: 20,
    textAlign: "center",
  },
  cartItemPrice: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-muted)",
    textAlign: "right",
  },

  /* ── Cart Footer ─────────────────────── */
  cartFooter: {
    borderTop: "1px solid var(--border)",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  subtotalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 14,
    color: "var(--text-secondary)",
  },
  proceedButton: {
    minHeight: 48,
    backgroundColor: "#3b82f6",
    border: "none",
    borderRadius: 10,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
    transition: "background-color 0.12s, transform 0.08s",
    WebkitTapHighlightColor: "transparent",
  },
  cancelTextButton: {
    minHeight: 36,
    backgroundColor: "transparent",
    border: "none",
    color: "#f87171",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
    touchAction: "manipulation",
  },
};
