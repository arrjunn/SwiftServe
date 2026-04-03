import { useState, useEffect } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { formatINR } from "@swiftserve/shared";
import { createCategory, reorderCategory, toggleCategoryActive, toggleItemAvailability } from "../db/adminOps.js";

const FOOD_DOT = { veg: "#22c55e", "non-veg": "#ef4444", egg: "#f59e0b" };

export default function MenuBuilderScreen({ onEditItem, onBack }) {
  const { staff } = useAuth();
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [newCatName, setNewCatName] = useState("");
  const [showAddCat, setShowAddCat] = useState(false);

  const load = async () => {
    const cats = await db.menu_categories
      .where("outlet_id").equals(OUTLET_ID)
      .sortBy("sort_order");
    const allItems = await db.menu_items
      .where("outlet_id").equals(OUTLET_ID)
      .filter((i) => i.is_active === 1)
      .toArray();
    setCategories(cats);
    setItems(allItems);
    if (!selectedCatId && cats.length > 0) setSelectedCatId(cats[0].id);
  };

  useEffect(() => { load(); }, []);

  const catItems = items.filter((i) => i.category_id === selectedCatId);
  const itemCountMap = {};
  items.forEach((i) => { itemCountMap[i.category_id] = (itemCountMap[i.category_id] || 0) + 1; });

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    await createCategory(newCatName.trim(), staff.id);
    setNewCatName("");
    setShowAddCat(false);
    await load();
  };

  const handleReorder = async (catId, dir) => {
    await reorderCategory(catId, dir, staff.id);
    await load();
  };

  const handleToggleCat = async (catId) => {
    await toggleCategoryActive(catId, staff.id);
    await load();
  };

  const handleToggleAvail = async (itemId) => {
    await toggleItemAvailability(itemId, staff.id);
    await load();
  };

  return (
    <div style={styles.container}>
      {/* Left: Categories */}
      <div style={styles.sidebar}>
        <h2 style={styles.sideTitle}>Categories</h2>

        <div style={styles.catList}>
          {categories.map((c, idx) => (
            <div key={c.id}
              style={{ ...styles.catRow, ...(selectedCatId === c.id ? styles.catRowActive : {}), ...(c.is_active !== 1 ? { opacity: 0.4 } : {}) }}
              onClick={() => setSelectedCatId(c.id)}
            >
              <div style={styles.catInfo}>
                <span style={styles.catName}>{c.name}</span>
                <span style={styles.catCount}>{itemCountMap[c.id] || 0}</span>
              </div>
              <div style={styles.catActions}>
                {idx > 0 && (
                  <button style={styles.arrowBtn} onClick={(e) => { e.stopPropagation(); handleReorder(c.id, "up"); }}>&#9650;</button>
                )}
                {idx < categories.length - 1 && (
                  <button style={styles.arrowBtn} onClick={(e) => { e.stopPropagation(); handleReorder(c.id, "down"); }}>&#9660;</button>
                )}
                <button style={styles.toggleBtn} onClick={(e) => { e.stopPropagation(); handleToggleCat(c.id); }}>
                  {c.is_active === 1 ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {showAddCat ? (
          <div style={styles.addCatRow}>
            <input style={styles.addCatInput} value={newCatName} placeholder="Category name"
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()} autoFocus />
            <button style={styles.addCatConfirm} onClick={handleAddCategory}>Add</button>
            <button style={styles.addCatCancel} onClick={() => { setShowAddCat(false); setNewCatName(""); }}>X</button>
          </div>
        ) : (
          <button style={styles.addCatBtn} onClick={() => setShowAddCat(true)}>+ Add Category</button>
        )}

        <button style={styles.backBtn} onClick={onBack}>&#8592; Back</button>
      </div>

      {/* Right: Items Grid */}
      <div style={styles.main}>
        <div style={styles.mainHeader}>
          <h2 style={styles.mainTitle}>
            {categories.find((c) => c.id === selectedCatId)?.name || "Select Category"}
          </h2>
          <button style={styles.addItemBtn} onClick={() => onEditItem(null, selectedCatId)}>+ Add Item</button>
        </div>

        <div style={styles.itemGrid}>
          {catItems.map((item) => (
            <div key={item.id} style={{ ...styles.itemCard, ...(item.is_available !== 1 ? { opacity: 0.5 } : {}) }}
              onClick={() => onEditItem(item.id)}>
              <div style={styles.itemTop}>
                <span style={{ ...styles.foodDot, borderColor: FOOD_DOT[item.food_type] || FOOD_DOT.veg }} />
                <span style={styles.itemName}>{item.name}</span>
              </div>
              <div style={styles.itemBottom}>
                <span style={styles.itemPrice}>{formatINR(item.price)}</span>
                <button
                  style={item.is_available === 1 ? styles.availBtn : styles.unavailBtn}
                  onClick={(e) => { e.stopPropagation(); handleToggleAvail(item.id); }}
                >
                  {item.is_available === 1 ? "In Stock" : "Out"}
                </button>
              </div>
            </div>
          ))}

          {catItems.length === 0 && (
            <div style={styles.emptyItems}>No items in this category.</div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "var(--bg-primary)", display: "flex",
    color: "var(--text-primary)",
  },
  sidebar: {
    width: 280, flexShrink: 0, backgroundColor: "var(--bg-secondary)", borderRight: "1px solid var(--border)",
    padding: 20, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto",
  },
  sideTitle: { fontSize: 16, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 8px 0" },
  catList: { display: "flex", flexDirection: "column", gap: 4, flex: 1, overflowY: "auto" },
  catRow: {
    padding: 12, borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer",
    display: "flex", flexDirection: "column", gap: 6, touchAction: "manipulation",
  },
  catRowActive: { borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.1)" },
  catInfo: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  catName: { fontSize: 14, fontWeight: 600 },
  catCount: { fontSize: 12, color: "var(--text-muted)", backgroundColor: "rgba(148,163,184,0.15)", padding: "2px 8px", borderRadius: 4 },
  catActions: { display: "flex", gap: 4 },
  arrowBtn: {
    width: 36, height: 36, backgroundColor: "transparent", border: "1px solid var(--border-light)",
    borderRadius: 4, color: "var(--text-muted)", fontSize: 10, cursor: "pointer", display: "flex",
    alignItems: "center", justifyContent: "center", touchAction: "manipulation",
  },
  toggleBtn: {
    marginLeft: "auto", minHeight: 36, padding: "0 12px", backgroundColor: "transparent",
    border: "1px solid var(--border-light)", borderRadius: 4, color: "var(--text-muted)", fontSize: 12,
    fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  addCatRow: { display: "flex", gap: 4 },
  addCatInput: {
    flex: 1, padding: "8px 10px", backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)",
    borderRadius: 6, color: "var(--text-primary)", fontSize: 13, outline: "none",
  },
  addCatConfirm: {
    padding: "6px 12px", backgroundColor: "#22c55e", border: "none", borderRadius: 6,
    color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  addCatCancel: {
    padding: "6px 10px", backgroundColor: "transparent", border: "1px solid var(--border-light)",
    borderRadius: 6, color: "var(--text-muted)", fontSize: 12, cursor: "pointer",
  },
  addCatBtn: {
    width: "100%", minHeight: 40, padding: "8px 16px", backgroundColor: "transparent",
    border: "1px dashed var(--border-light)", borderRadius: 8, color: "var(--text-muted)", fontSize: 13,
    fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  backBtn: {
    marginTop: 8, width: "100%", minHeight: 44, padding: "10px 24px",
    backgroundColor: "transparent", border: "1px solid var(--border)", borderRadius: 10,
    color: "var(--text-muted)", fontSize: 14, fontWeight: 600, cursor: "pointer",
    touchAction: "manipulation",
  },
  main: {
    flex: 1, padding: 20, display: "flex", flexDirection: "column", overflow: "hidden",
  },
  mainHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16,
  },
  mainTitle: { fontSize: 20, fontWeight: 700, margin: 0, color: "var(--text-primary)" },
  addItemBtn: {
    minHeight: 40, padding: "8px 20px", backgroundColor: "#3b82f6", border: "none",
    borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
    touchAction: "manipulation",
  },
  itemGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12,
    overflowY: "auto", flex: 1,
  },
  itemCard: {
    backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 10,
    padding: 14, cursor: "pointer", display: "flex", flexDirection: "column",
    gap: 10, touchAction: "manipulation",
  },
  itemTop: { display: "flex", alignItems: "center", gap: 8 },
  foodDot: {
    width: 12, height: 12, borderRadius: 2, border: "2px solid", flexShrink: 0,
  },
  itemName: { fontSize: 14, fontWeight: 600, flex: 1 },
  itemBottom: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  itemPrice: { fontSize: 14, fontWeight: 700, color: "#38bdf8", fontFamily: "monospace" },
  availBtn: {
    padding: "3px 10px", backgroundColor: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.4)",
    borderRadius: 4, color: "#4ade80", fontSize: 11, fontWeight: 600, cursor: "pointer",
  },
  unavailBtn: {
    padding: "3px 10px", backgroundColor: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)",
    borderRadius: 4, color: "#f87171", fontSize: 11, fontWeight: 600, cursor: "pointer",
  },
  emptyItems: { color: "var(--text-muted)", fontSize: 14, padding: 32, textAlign: "center", gridColumn: "1 / -1" },
};
