import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { useOrder } from "../contexts/OrderContext.jsx";
import { formatINR } from "@swiftserve/shared";

/**
 * KioskMenuScreen — Customer-facing menu browser for kiosk self-ordering.
 * Supports light/dark theme via CSS variables. Green (#22c55e) accents. All touch targets >= 56px.
 *
 * Props:
 *   onCheckout() — called when customer taps the checkout bar
 *
 * Uses useOrder() for addItem, removeItem, updateQty, items, setOrderSource, setOrderType.
 * Loads categories and menu items from Dexie on mount.
 */
export default function KioskMenuScreen({ onCheckout }) {
  const {
    items: cartItems,
    addItem,
    updateQty,
    setOrderSource,
    setOrderType,
  } = useOrder();

  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Auto-set kiosk order defaults on mount
  useEffect(() => {
    setOrderSource("kiosk");
    setOrderType("takeaway");
  }, [setOrderSource, setOrderType]);

  // Load categories and menu items from Dexie
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const cats = await db.menu_categories
          .where({ outlet_id: OUTLET_ID })
          .filter((c) => c.is_active === 1 && !c.deleted_at)
          .sortBy("sort_order");

        const allItems = await db.menu_items
          .where("outlet_id").equals(OUTLET_ID)
          .filter((i) => i.is_active === 1 && i.is_available === 1 && !i.deleted_at)
          .toArray();

        if (cancelled) return;

        setCategories(cats);
        setMenuItems(allItems);
        if (cats.length > 0) {
          setActiveCategoryId(cats[0].id);
        }
      } catch (err) {
        console.error("[KioskMenuScreen] Failed to load menu:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Build cart lookup: menuItemId -> qty
  const cartMap = useMemo(() => {
    const map = {};
    for (const ci of cartItems) {
      map[ci.menuItemId] = (map[ci.menuItemId] || 0) + ci.qty;
    }
    return map;
  }, [cartItems]);

  // Cart totals for sticky bar
  const cartTotals = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const ci of cartItems) {
      count += ci.qty;
      total += ci.unitPrice * ci.qty;
    }
    return { count, total };
  }, [cartItems]);

  // Filter items by category and search
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (searchQuery) {
        return item.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      if (activeCategoryId && item.category_id !== activeCategoryId) {
        return false;
      }
      return true;
    });
  }, [menuItems, activeCategoryId, searchQuery]);

  const handleAdd = useCallback((item) => {
    addItem(item);
  }, [addItem]);

  const handleIncrement = useCallback((menuItemId) => {
    const cartItem = cartItems.find((ci) => ci.menuItemId === menuItemId);
    if (cartItem) {
      updateQty(cartItem.id, cartItem.qty + 1);
    }
  }, [cartItems, updateQty]);

  const handleDecrement = useCallback((menuItemId) => {
    const cartItem = cartItems.find((ci) => ci.menuItemId === menuItemId);
    if (cartItem) {
      updateQty(cartItem.id, cartItem.qty - 1);
    }
  }, [cartItems, updateQty]);

  const handleCheckout = useCallback(() => {
    if (cartTotals.count > 0 && onCheckout) {
      onCheckout();
    }
  }, [cartTotals.count, onCheckout]);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner} />
        <p style={styles.loadingText}>Loading menu...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Search bar */}
      <div style={styles.searchWrapper}>
        <div style={styles.searchBar}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search menu items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
          {searchQuery && (
            <button
              style={styles.searchClear}
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      {!searchQuery && (
        <div style={styles.categoryBar}>
          <div style={styles.categoryScroll}>
            {categories.map((cat) => (
              <button
                key={cat.id}
                style={{
                  ...styles.categoryTab,
                  ...(activeCategoryId === cat.id ? styles.categoryTabActive : {}),
                }}
                onClick={() => setActiveCategoryId(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Menu grid */}
      <div style={styles.menuGrid}>
        {filteredItems.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>
              {searchQuery ? `No items matching "${searchQuery}"` : "No items in this category"}
            </p>
          </div>
        )}
        {filteredItems.map((item) => {
          const qtyInCart = cartMap[item.id] || 0;
          return (
            <div key={item.id} style={styles.card}>
              {/* Image placeholder */}
              <div style={styles.cardImage}>
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    style={styles.cardImg}
                    loading="lazy"
                  />
                ) : (
                  <span style={styles.cardInitial}>
                    {item.name.charAt(0).toUpperCase()}
                  </span>
                )}
                {/* Veg/Non-veg indicator */}
                <div style={styles.foodTypeWrapper}>
                  {item.food_type === "non_veg" ? (
                    <div style={styles.nonVegIndicator}>
                      <div style={styles.nonVegTriangle} />
                    </div>
                  ) : (
                    <div style={styles.vegIndicator}>
                      <div style={styles.vegCircle} />
                    </div>
                  )}
                </div>
              </div>

              {/* Card body */}
              <div style={styles.cardBody}>
                <h3 style={styles.cardName}>{item.name}</h3>
                {item.description && (
                  <p style={styles.cardDesc}>
                    {item.description.length > 60
                      ? item.description.slice(0, 60) + "..."
                      : item.description}
                  </p>
                )}
                <div style={styles.cardFooter}>
                  <span style={styles.cardPrice}>{formatINR(item.price)}</span>

                  {qtyInCart === 0 ? (
                    <button
                      style={styles.addButton}
                      onClick={() => handleAdd(item)}
                      aria-label={`Add ${item.name}`}
                    >
                      <span style={styles.addButtonPlus}>+</span>
                    </button>
                  ) : (
                    <div style={styles.qtyControls}>
                      <button
                        style={styles.qtyButton}
                        onClick={() => handleDecrement(item.id)}
                        aria-label="Decrease quantity"
                      >
                        -
                      </button>
                      <span style={styles.qtyText}>{qtyInCart}</span>
                      <button
                        style={styles.qtyButton}
                        onClick={() => handleIncrement(item.id)}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Spacer for sticky bar */}
      {cartTotals.count > 0 && <div style={{ height: 80 }} />}

      {/* Sticky checkout bar */}
      {cartTotals.count > 0 && (
        <div style={styles.checkoutBar}>
          <button style={styles.checkoutButton} onClick={handleCheckout}>
            <span style={styles.checkoutLeft}>
              <span style={styles.checkoutBadge}>{cartTotals.count}</span>
              <span style={styles.checkoutLabel}>
                {cartTotals.count === 1 ? "item" : "items"}
              </span>
            </span>
            <span style={styles.checkoutDivider}>|</span>
            <span style={styles.checkoutTotal}>{formatINR(cartTotals.total)}</span>
            <span style={styles.checkoutArrow}>Checkout →</span>
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    boxSizing: "border-box",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    overflow: "hidden",
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: "var(--bg-primary)",
    color: "var(--text-muted)",
  },
  loadingSpinner: {
    width: 48,
    height: 48,
    border: "4px solid var(--border-light)",
    borderTopColor: "#22c55e",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    color: "var(--text-muted)",
    fontWeight: 500,
  },

  // Search
  searchWrapper: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    background: "var(--bg-primary)",
    padding: "16px 16px 12px 16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  searchBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "var(--bg-secondary)",
    borderRadius: 14,
    padding: "0 16px",
    height: 56,
    minHeight: 56,
  },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 17,
    color: "var(--text-primary)",
    padding: 0,
    fontFamily: "inherit",
  },
  searchClear: {
    background: "none",
    border: "none",
    color: "var(--text-dim)",
    fontSize: 18,
    cursor: "pointer",
    padding: "8px",
    minWidth: 40,
    minHeight: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "manipulation",
  },

  // Category tabs
  categoryBar: {
    background: "var(--bg-primary)",
    borderBottom: "1px solid var(--border-light)",
    position: "sticky",
    top: 84,
    zIndex: 19,
  },
  categoryScroll: {
    display: "flex",
    overflowX: "auto",
    gap: 6,
    padding: "10px 16px",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
  },
  categoryTab: {
    flexShrink: 0,
    padding: "10px 20px",
    minHeight: 56,
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text-muted)",
    background: "var(--bg-secondary)",
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.15s",
    touchAction: "manipulation",
  },
  categoryTabActive: {
    background: "#22c55e",
    color: "#ffffff",
    boxShadow: "0 2px 8px rgba(34, 197, 94, 0.3)",
  },

  // Menu grid
  menuGrid: {
    flex: 1,
    overflowY: "auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: 16,
    padding: 16,
    alignContent: "start",
  },
  emptyState: {
    gridColumn: "1 / -1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "64px 16px",
  },
  emptyText: {
    fontSize: 17,
    color: "var(--text-dim)",
    textAlign: "center",
  },

  // Menu card
  card: {
    background: "var(--bg-primary)",
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    display: "flex",
    flexDirection: "column",
  },
  cardImage: {
    width: "100%",
    height: 140,
    background: "var(--bg-secondary)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  cardImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  cardInitial: {
    fontSize: 42,
    fontWeight: 800,
    color: "var(--border)",
  },
  foodTypeWrapper: {
    position: "absolute",
    top: 8,
    left: 8,
  },
  vegIndicator: {
    width: 20,
    height: 20,
    border: "2px solid #22c55e",
    borderRadius: 3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg-primary)",
  },
  vegCircle: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#22c55e",
  },
  nonVegIndicator: {
    width: 20,
    height: 20,
    border: "2px solid #ef4444",
    borderRadius: 3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg-primary)",
  },
  nonVegTriangle: {
    width: 0,
    height: 0,
    borderLeft: "5px solid transparent",
    borderRight: "5px solid transparent",
    borderBottom: "10px solid #ef4444",
  },

  // Card body
  cardBody: {
    padding: "12px 14px 14px 14px",
    display: "flex",
    flexDirection: "column",
    flex: 1,
  },
  cardName: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: 0,
    lineHeight: 1.3,
  },
  cardDesc: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: "4px 0 0 0",
    lineHeight: 1.4,
  },
  cardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "auto",
    paddingTop: 10,
  },
  cardPrice: {
    fontSize: 20,
    fontWeight: 700,
    color: "#22c55e",
  },

  // Add button
  addButton: {
    width: 48,
    height: 48,
    minWidth: 48,
    minHeight: 48,
    borderRadius: "50%",
    background: "#22c55e",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(34, 197, 94, 0.3)",
    transition: "transform 0.1s",
    touchAction: "manipulation",
  },
  addButtonPlus: {
    fontSize: 28,
    fontWeight: 700,
    color: "#ffffff",
    lineHeight: 1,
  },

  // Qty controls
  qtyControls: {
    display: "flex",
    alignItems: "center",
    gap: 0,
    background: "#f0fdf4",
    border: "2px solid #22c55e",
    borderRadius: 12,
    overflow: "hidden",
  },
  qtyButton: {
    width: 40,
    height: 40,
    minWidth: 40,
    minHeight: 40,
    background: "transparent",
    border: "none",
    fontSize: 22,
    fontWeight: 700,
    color: "#22c55e",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "manipulation",
  },
  qtyText: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
    minWidth: 28,
    textAlign: "center",
  },

  // Sticky checkout bar
  checkoutBar: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    padding: "8px 16px",
    paddingBottom: "max(8px, env(safe-area-inset-bottom))",
    background: "rgba(255,255,255,0.95)",
    backdropFilter: "blur(8px)",
    zIndex: 50,
  },
  checkoutButton: {
    width: "100%",
    height: 64,
    minHeight: 64,
    background: "#22c55e",
    color: "#ffffff",
    border: "none",
    borderRadius: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    fontSize: 18,
    fontWeight: 700,
    boxShadow: "0 4px 14px rgba(34, 197, 94, 0.35)",
    touchAction: "manipulation",
  },
  checkoutLeft: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  checkoutBadge: {
    background: "rgba(255,255,255,0.25)",
    borderRadius: 8,
    padding: "2px 10px",
    fontSize: 18,
    fontWeight: 800,
  },
  checkoutLabel: {
    fontSize: 16,
    fontWeight: 500,
  },
  checkoutDivider: {
    opacity: 0.4,
    fontSize: 20,
  },
  checkoutTotal: {
    fontSize: 20,
    fontWeight: 800,
  },
  checkoutArrow: {
    fontSize: 17,
    fontWeight: 600,
    marginLeft: 4,
  },
};
